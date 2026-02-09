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
        const classDoc = await Class.create(data);
        return classDoc;
    }

    // Get class by ID
    async getClassById(classId: string, tenantId: string): Promise<IClass | null> {
        return await Class.findOne({ _id: classId, tenantId })
            .populate('trainerId', 'firstName lastName specializations')
            .populate('branchId', 'name');
    }

    // Update class
    async updateClass(classId: string, tenantId: string, data: Partial<CreateClassDTO>): Promise<IClass | null> {
        return await Class.findOneAndUpdate(
            { _id: classId, tenantId },
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Get classes with filters
    async getClasses(
        tenantId: string,
        branchId?: string,
        classType?: ClassType,
        trainerId?: string,
        startDate?: Date,
        endDate?: Date,
        page: number = 1,
        limit: number = 20
    ): Promise<{ classes: IClass[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { tenantId, isActive: true };
        if (branchId) filter.branchId = branchId;
        if (classType) filter.classType = classType;
        if (trainerId) filter.trainerId = trainerId;
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
        const currentBookings = await Booking.countDocuments({
            classId: data.classId,
            status: { $in: ['confirmed', 'attended'] },
        });

        if (currentBookings >= classDoc.capacity.max) {
            // Add to waitlist
            const booking = await Booking.create({
                ...data,
                status: 'waitlisted',
                waitlistPosition: (await Booking.countDocuments({
                    classId: data.classId,
                    status: 'waitlisted',
                })) + 1,
            });

            return booking;
        }

        // Create confirmed booking
        const booking = await Booking.create({
            ...data,
            status: 'confirmed',
            bookedAt: new Date(),
        });

        // Update class enrolled count
        await Class.findByIdAndUpdate(data.classId, {
            $inc: { 'capacity.enrolled': 1 },
        });

        return booking;
    }

    // Cancel booking
    async cancelBooking(
        bookingId: string,
        tenantId: string,
        reason: string
    ): Promise<IBooking | null> {
        const booking = await Booking.findOne({ _id: bookingId, tenantId });

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
        const hoursUntilClass = (classDoc.schedule.startTime.getTime() - Date.now()) / (1000 * 60 * 60);
        let penalty = 0;

        if (classDoc.cancellationPolicy) {
            if (hoursUntilClass < classDoc.cancellationPolicy.penaltyHours) {
                penalty = classDoc.cancellationPolicy.penaltyAmount;
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
            $inc: { 'capacity.enrolled': -1 },
        });

        // Process waitlist - move first waitlisted to confirmed
        const waitlistedBooking = await Booking.findOne({
            classId: booking.classId,
            status: 'waitlisted',
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
                $inc: { 'capacity.enrolled': 1 },
            });
        }

        return updatedBooking;
    }

    // Mark attendance
    async markAttendance(bookingId: string, tenantId: string, attended: boolean): Promise<IBooking | null> {
        return await Booking.findOneAndUpdate(
            { _id: bookingId, tenantId },
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
        tenantId: string,
        status?: string,
        page: number = 1,
        limit: number = 20
    ): Promise<{ bookings: IBooking[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { memberId, tenantId };
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
    async getClassBookings(classId: string, tenantId: string): Promise<IBooking[]> {
        return await Booking.find({ classId, tenantId })
            .populate('memberId', 'firstName lastName membershipNumber')
            .sort({ bookedAt: 1 });
    }

    // Cancel class
    async cancelClass(classId: string, tenantId: string, reason: string): Promise<IClass | null> {
        // Cancel all bookings
        await Booking.updateMany(
            { classId, status: { $in: ['confirmed', 'waitlisted'] } },
            {
                $set: {
                    status: 'cancelled',
                    'cancellation.cancelledAt': new Date(),
                    'cancellation.reason': `Class cancelled: ${reason}`,
                    'cancellation.penalty': 0,
                },
            }
        );

        return await Class.findOneAndUpdate(
            { _id: classId, tenantId },
            { $set: { isActive: false } },
            { new: true }
        );
    }
}

export default new ClassService();
