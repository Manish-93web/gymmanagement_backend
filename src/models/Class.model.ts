import mongoose, { Schema, Document } from 'mongoose';

export type ClassType = 'group' | 'personal_training' | 'online';
export type RecurrenceType = 'once' | 'daily' | 'weekly' | 'monthly';

export interface IClass extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    name: string;
    description: string;
    type: ClassType;
    trainerId: mongoose.Types.ObjectId;
    category: string;
    level: 'beginner' | 'intermediate' | 'advanced' | 'all';
    schedule: {
        startDate: Date;
        endDate?: Date;
        startTime: string;
        endTime: string;
        duration: number; // in minutes
        recurrence: RecurrenceType;
        daysOfWeek?: number[]; // 0-6 (Sunday-Saturday)
    };
    capacity: {
        max: number;
        current: number;
        waitlist: number;
    };
    pricing: {
        memberFree: boolean;
        dropInPrice?: number;
    };
    online: {
        isOnline: boolean;
        platform?: 'zoom' | 'google_meet' | 'custom';
        meetingLink?: string;
        meetingId?: string;
        password?: string;
    };
    cancellationPolicy: {
        allowCancellation: boolean;
        hoursBeforeClass: number;
        penaltyAmount?: number;
    };
    isActive: boolean;
    isCancelled: boolean;
    cancellationReason?: string;
    calendarEvents?: {
        userId: mongoose.Types.ObjectId;
        eventId: string;
        provider: 'google' | 'outlook' | 'apple';
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const ClassSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String },
        type: {
            type: String,
            enum: ['group', 'personal_training', 'online'],
            required: true,
        },
        trainerId: { type: Schema.Types.ObjectId, ref: 'Trainer', required: true, index: true },
        category: { type: String, required: true },
        level: {
            type: String,
            enum: ['beginner', 'intermediate', 'advanced', 'all'],
            default: 'all',
        },
        schedule: {
            startDate: { type: Date, required: true },
            endDate: { type: Date },
            startTime: { type: String, required: true },
            endTime: { type: String, required: true },
            duration: { type: Number, required: true },
            recurrence: {
                type: String,
                enum: ['once', 'daily', 'weekly', 'monthly'],
                default: 'once',
            },
            daysOfWeek: [{ type: Number, min: 0, max: 6 }],
        },
        capacity: {
            max: { type: Number, required: true },
            current: { type: Number, default: 0 },
            waitlist: { type: Number, default: 0 },
        },
        pricing: {
            memberFree: { type: Boolean, default: true },
            dropInPrice: { type: Number },
        },
        online: {
            isOnline: { type: Boolean, default: false },
            platform: { type: String, enum: ['zoom', 'google_meet', 'custom'] },
            meetingLink: { type: String },
            meetingId: { type: String },
            password: { type: String },
        },
        cancellationPolicy: {
            allowCancellation: { type: Boolean, default: true },
            hoursBeforeClass: { type: Number, default: 2 },
            penaltyAmount: { type: Number, default: 0 },
        },
        isActive: { type: Boolean, default: true },
        isCancelled: { type: Boolean, default: false },
        cancellationReason: { type: String },
        calendarEvents: [
            {
                userId: { type: Schema.Types.ObjectId, ref: 'User' },
                eventId: { type: String },
                provider: { type: String, enum: ['google', 'outlook', 'apple'] },
            },
        ],
    },
    { timestamps: true }
);

// Indexes
ClassSchema.index({ tenantId: 1, branchId: 1, 'schedule.startDate': 1 });
ClassSchema.index({ trainerId: 1, 'schedule.startDate': 1 });
ClassSchema.index({ type: 1, isActive: 1 });

export default mongoose.model<IClass>('Class', ClassSchema);
