import mongoose, { Schema, Document } from 'mongoose';

export type BookingStatus = 'confirmed' | 'waitlist' | 'cancelled' | 'completed' | 'no_show';

export interface IBooking extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    classId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    status: BookingStatus;
    bookingDate: Date;
    classDate: Date;
    waitlistPosition?: number;
    cancellation?: {
        cancelledAt: Date;
        cancelledBy: mongoose.Types.ObjectId;
        reason: string;
        penaltyApplied: boolean;
        penaltyAmount?: number;
    };
    attendance: {
        attended: boolean;
        checkInTime?: Date;
    };
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const BookingSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        status: {
            type: String,
            enum: ['confirmed', 'waitlist', 'cancelled', 'completed', 'no_show'],
            default: 'confirmed',
            index: true,
        },
        bookingDate: { type: Date, default: Date.now },
        classDate: { type: Date, required: true, index: true },
        waitlistPosition: { type: Number },
        cancellation: {
            cancelledAt: { type: Date },
            cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
            reason: { type: String },
            penaltyApplied: { type: Boolean, default: false },
            penaltyAmount: { type: Number },
        },
        attendance: {
            attended: { type: Boolean, default: false },
            checkInTime: { type: Date },
        },
        notes: { type: String },
    },
    { timestamps: true }
);

// Indexes
BookingSchema.index({ tenantId: 1, classId: 1, classDate: 1 });
BookingSchema.index({ memberId: 1, classDate: 1 });
BookingSchema.index({ classId: 1, status: 1 });

export default mongoose.model<IBooking>('Booking', BookingSchema);
