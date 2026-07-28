import mongoose, { Schema, Document } from 'mongoose';

export type MembershipTransferStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface IMembershipTransfer extends Document {
    tenantId: string;
    branchId?: string;
    subscriptionId: string;
    fromMemberId: string;
    toMemberId?: string;
    toMemberDetails?: {
        firstName: string;
        lastName: string;
        email?: string;
        mobile: string;
    };
    transferFee: number;
    reason?: string;
    status: MembershipTransferStatus;
    approvedBy?: string;
    approvedAt?: Date;
    rejectedBy?: string;
    rejectedAt?: Date;
    rejectionReason?: string;
    remainingDays?: number;
    remainingSessions?: number;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

const MembershipTransferSchema: Schema = new Schema(
    {
        tenantId: { type: String, required: true, index: true },
        branchId: { type: String },
        subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', required: true },
        fromMemberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
        toMemberId: { type: Schema.Types.ObjectId, ref: 'Member' },
        toMemberDetails: {
            firstName: { type: String },
            lastName: { type: String },
            email: { type: String, lowercase: true, trim: true },
            mobile: { type: String, trim: true },
        },
        transferFee: { type: Number, default: 0 },
        reason: { type: String },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected', 'cancelled'],
            default: 'pending',
            index: true,
        },
        approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        approvedAt: { type: Date },
        rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        rejectedAt: { type: Date },
        rejectionReason: { type: String },
        remainingDays: { type: Number },
        remainingSessions: { type: Number },
        notes: { type: String },
    },
    { timestamps: true }
);

MembershipTransferSchema.index({ tenantId: 1, status: 1 });
MembershipTransferSchema.index({ tenantId: 1, fromMemberId: 1 });
MembershipTransferSchema.index({ tenantId: 1, toMemberId: 1 });

export default mongoose.model<IMembershipTransfer>('MembershipTransfer', MembershipTransferSchema);
