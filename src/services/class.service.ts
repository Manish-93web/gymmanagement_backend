import Class, { IClass, ClassType } from '../models/Class.model';
import Booking, { IBooking } from '../models/Booking.model';
import ClassCategory, { IClassCategory } from '../models/ClassCategory.model';
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
    async getClassById(classId: string, tenantId?: string): Promise<any | null> {
        const query: any = { _id: classId };
        if (tenantId) query.tenantId = tenantId;

        // Trainer.firstName/lastName don't exist on the Trainer model itself —
        // the name lives on the linked User document, so populate through it.
        const classDoc: any = await Class.findOne(query)
            .populate({
                path: 'trainerId',
                select: 'specializations userId',
                populate: { path: 'userId', select: 'firstName lastName' },
            })
            .populate('branchId', 'name')
            .lean();

        if (classDoc?.trainerId && typeof classDoc.trainerId === 'object') {
            const u = classDoc.trainerId.userId;
            classDoc.trainerId.firstName = u?.firstName ?? '';
            classDoc.trainerId.lastName = u?.lastName ?? '';
        }

        return classDoc;
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
    ): Promise<{ classes: any[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { isActive: true };
        if (tenantId) filter.tenantId = tenantId;
        if (branchId) filter.branchId = branchId;
        if (classType) filter.type = classType;
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
                .populate({
                    path: 'trainerId',
                    select: 'specializations userId',
                    populate: { path: 'userId', select: 'firstName lastName' },
                })
                .populate('branchId', 'name')
                .lean(),
            Class.countDocuments(filter),
        ]);

        (classes as any[]).forEach((c: any) => {
            if (c.trainerId && typeof c.trainerId === 'object') {
                const u = c.trainerId.userId;
                c.trainerId.firstName = u?.firstName ?? '';
                c.trainerId.lastName = u?.lastName ?? '';
            }
        });

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
                classDate: classDoc.schedule.startDate,
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
            classDate: classDoc.schedule.startDate,
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

    // Get distinct categories — merges categories actually used by classes with
    // any pre-created ClassCategory documents (so a brand-new category with no
    // classes yet still shows up) and a baseline default list.
    async getCategories(tenantId?: string): Promise<string[]> {
        const defaults = ['yoga', 'crossfit', 'zumba', 'pilates', 'hiit', 'strength', 'cardio', 'boxing', 'cycling', 'swimming', 'other'];
        try {
            const query: any = { isActive: true };
            if (tenantId) query.tenantId = tenantId;
            const distinct: string[] = await Class.distinct('category', query);

            const catQuery: any = {};
            if (tenantId) catQuery.tenantId = tenantId;
            const persisted: string[] = tenantId ? await ClassCategory.distinct('name', catQuery) : [];

            const merged = [...new Set([
                ...distinct.filter(Boolean).map((c: string) => c.toLowerCase()),
                ...persisted.filter(Boolean).map((c: string) => c.toLowerCase()),
                ...defaults,
            ])];
            return merged.sort();
        } catch {
            return defaults;
        }
    }

    // Create (or update metadata on) a class category
    async createCategory(tenantId: string, name: string, description?: string, color?: string): Promise<IClassCategory> {
        const normalized = name.trim();
        const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existing = await ClassCategory.findOne({
            tenantId,
            name: { $regex: `^${escaped}$`, $options: 'i' },
        });

        if (existing) {
            if (description !== undefined) existing.description = description;
            if (color !== undefined) existing.color = color;
            if (existing.isModified()) await existing.save();
            return existing;
        }

        return await ClassCategory.create({ tenantId, name: normalized, description, color });
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
