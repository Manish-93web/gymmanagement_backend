import Class, { IClass, ClassType } from '../models/Class.model';
import Booking, { IBooking } from '../models/Booking.model';
import mongoose from 'mongoose';

export interface CreateClassDTO {
    tenantId: string;
    branchId: string;
    name: string;
    description?: string;
    classType: ClassType;
    trainerId: string;
    schedule: {
        startTime: Date;
        endTime: Date;
        isRecurring: boolean;
        recurrence?: {
            frequency: 'daily' | 'weekly' | 'monthly';
            interval: number;
            daysOfWeek?: number[];
            endDate?: Date;
        };
    };
    capacity: {
        min: number;
        max: number;
    };
    pricing?: {
        dropInPrice: number;
        memberPrice: number;
    };
    zoomMeetingId?: string;
}

export interface CreateBookingDTO {
    tenantId: string;
    branchId: string;
    classId: string;
    memberId: string;
    bookingType: 'regular' | 'trial' | 'drop_in';
    paymentStatus: 'pending' | 'completed' | 'waived';
}

export class ClassService {
    // Create class
    async createClass(data: CreateClassDTO): Promise<IClass> {
        const classDoc = await (Class as any).create(data);
        return classDoc;
    }

    // Get class by ID
    async getClassById(classId: string, tenantId?: string): Promise<IClass | null> {
        const query: any = { _id: classId };
        if (tenantId) query.tenantId = tenantId;

        return await Class.findOne(query)
            .populate('trainerId', 'firstName lastName specializations')
            .populate('branchId', 'name');
    }

    // Update class
    async updateClass(classId: string, tenantId: string | undefined, data: Partial<CreateClassDTO>): Promise<IClass | null> {
        const query: any = { _id: classId };
        if (tenantId) query.tenantId = tenantId;

        return await Class.findOneAndUpdate(
            query,
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Get classes with filters
    async getClasses(
        tenantId?: string,
        branchId?: string,
        classType?: ClassType,
        trainerId?: string,
        startDate?: Date,
        endDate?: Date,
        search?: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ classes: IClass[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { isActive: true };
        if (tenantId) filter.tenantId = tenantId;
        if (branchId) filter.branchId = branchId;
        if (classType) filter.classType = classType;
        if (trainerId) filter.trainerId = trainerId;
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        if (startDate || endDate) {
            filter['schedule.startTime'] = {};
            if (startDate) filter['schedule.startTime'].$gte = startDate;
            if (endDate) filter['schedule.startTime'].$lte = endDate;
        }

        const [classes, total] = await Promise.all([
            Class.find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ 'schedule.startTime': 1 })
                .populate('trainerId', 'firstName lastName specializations')
                .populate('branchId', 'name'),
            Class.countDocuments(filter),
        ]);

        return { classes, total };
    }

    // Create booking
    async createBooking(data: CreateBookingDTO): Promise<IBooking> {
        const classDoc = await Class.findById(data.classId);

        if (!classDoc) {
            throw new Error('Class not found');
        }

        // Check capacity
        const currentBookings = await (Booking as any).countDocuments({
            classId: data.classId,
            status: { $in: ['confirmed', 'completed'] },
        });

        if (currentBookings >= classDoc.capacity.max) {
            // Add to waitlist
            const booking = await (Booking as any).create({
                ...data,
                status: 'waitlist',
                waitlistPosition: (await (Booking as any).countDocuments({
                    classId: data.classId,
                    status: 'waitlist',
                })) + 1,
            });

            return booking;
        }

        // Create confirmed booking
        const booking = await (Booking as any).create({
            ...data,
            status: 'confirmed',
            bookedAt: new Date(),
        });

        // Update class enrolled count
        await Class.findByIdAndUpdate(data.classId, {
            $inc: { 'capacity.current': 1 },
        });

        return booking;
    }

    // Cancel booking
    async cancelBooking(
        bookingId: string,
        tenantId: string | undefined,
        reason: string
    ): Promise<IBooking | null> {
        const query: any = { _id: bookingId };
        if (tenantId) query.tenantId = tenantId;

        const booking = await Booking.findOne(query);

        if (!booking) {
            throw new Error('Booking not found');
        }

        if (booking.status === 'cancelled') {
            throw new Error('Booking already cancelled');
        }

        const classDoc = await Class.findById(booking.classId);
        if (!classDoc) {
            throw new Error('Class not found');
        }

        // Calculate cancellation penalty
        const classDate = new Date(classDoc.schedule.startDate);
        const [hours, minutes] = classDoc.schedule.startTime.split(':').map(Number);
        classDate.setHours(hours, minutes, 0, 0);

        const hoursUntilClass = (classDate.getTime() - Date.now()) / (1000 * 60 * 60);
        let penalty = 0;

        if (classDoc.cancellationPolicy) {
            if (hoursUntilClass < classDoc.cancellationPolicy.hoursBeforeClass) {
                penalty = classDoc.cancellationPolicy.penaltyAmount || 0;
            }
        }

        // Update booking
        const updatedBooking = await Booking.findByIdAndUpdate(
            bookingId,
            {
                $set: {
                    status: 'cancelled',
                    'cancellation.cancelledAt': new Date(),
                    'cancellation.reason': reason,
                    'cancellation.penalty': penalty,
                },
            },
            { new: true }
        );

        // Decrement class enrolled count
        await Class.findByIdAndUpdate(booking.classId, {
            $inc: { 'capacity.current': -1 },
        });

        // Process waitlist - move first waitlisted to confirmed
        const waitlistedBooking = await (Booking as any).findOne({
            classId: booking.classId,
            status: 'waitlist',
        }).sort({ waitlistPosition: 1 });

        if (waitlistedBooking) {
            await Booking.findByIdAndUpdate(waitlistedBooking._id, {
                $set: {
                    status: 'confirmed',
                    bookedAt: new Date(),
                },
                $unset: { waitlistPosition: 1 },
            });

            await Class.findByIdAndUpdate(booking.classId, {
                $inc: { 'capacity.current': 1 },
            });
        }

        return updatedBooking;
    }

    // Mark attendance
    async markAttendance(bookingId: string, tenantId: string | undefined, attended: boolean): Promise<IBooking | null> {
        const query: any = { _id: bookingId };
        if (tenantId) query.tenantId = tenantId;

        return await Booking.findOneAndUpdate(
            query,
            {
                $set: {
                    status: attended ? 'attended' : 'no_show',
                    attendedAt: attended ? new Date() : undefined,
                },
            },
            { new: true }
        );
    }

    // Get member bookings
    async getMemberBookings(
        memberId: string,
        tenantId?: string,
        status?: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ bookings: IBooking[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { memberId };
        if (tenantId) filter.tenantId = tenantId;
        if (status) filter.status = status;

        const [bookings, total] = await Promise.all([
            Booking.find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ bookedAt: -1 })
                .populate('classId'),
            Booking.countDocuments(filter),
        ]);

        return { bookings, total };
    }

    // Get class bookings
    async getClassBookings(classId: string, tenantId?: string): Promise<IBooking[]> {
        const query: any = { classId };
        if (tenantId) query.tenantId = tenantId;

        return await Booking.find(query)
            .populate('memberId', 'firstName lastName membershipNumber')
            .sort({ bookedAt: 1 });
    }

    // Cancel class
    async cancelClass(classId: string, tenantId: string | undefined, reason: string): Promise<IClass | null> {
        // Cancel all bookings
        await (Booking as any).updateMany(
            { classId, status: { $in: ['confirmed', 'waitlist'] } },
            {
                $set: {
                    status: 'cancelled',
                    'cancellation.cancelledAt': new Date(),
                    'cancellation.reason': `Class cancelled: ${reason}`,
                    'cancellation.penalty': 0,
                },
            }
        );

        const query: any = { _id: classId };
        if (tenantId) query.tenantId = tenantId;

        return await Class.findOneAndUpdate(
            query,
            { $set: { isActive: false } },
            { new: true }
        );
    }
}

export default new ClassService();
