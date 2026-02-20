import mongoose, { Schema, Document } from 'mongoose';

export interface IPersonalizedOffer extends Document {
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    type: 'discount' | 'membership_upgrade' | 'foc_sessions' | 'rewardPoints' | 'free_session' | 'freeze_waiver' | 'referral_bonus' | 'upgrade';
    title: string;
    description: string;
    value: number;
    couponId?: mongoose.Types.ObjectId;
    validity?: {
        startDate: Date;
        endDate: Date;
    };
    expiryDate: Date; // Added
    status: 'pending' | 'sent' | 'redeemed' | 'expired' | 'active'; // Added active
    sentAt?: Date;
    redeemedAt?: Date;
    criteria?: {
        lastActivityDays?: number;
        attendancePercentage?: number;
        membershipTier?: string;
    };
    churnRiskScore?: number; // Added
    createdAt: Date;
    updatedAt: Date;
}

const PersonalizedOfferSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
        type: {
            type: String,
            // enum: ['discount', 'membership_upgrade', 'foc_sessions', 'rewardPoints'], // Expanded in interface, keeping loose here or updating
            required: true,
        },
        title: { type: String }, // Made optional as service might not send it? Service sends title? 
        // Service sends: type, value, description, expiryDate. 
        // Title is required in Schema line 36 of original. Service generatePersonalizedOffer does NOT send title!
        // I should make title optional or default.
        description: { type: String },
        value: { type: Number, required: true },
        couponId: { type: Schema.Types.ObjectId, ref: 'Coupon' },
        validity: {
            startDate: { type: Date },
            endDate: { type: Date },
        },
        expiryDate: { type: Date },
        status: {
            type: String,
            enum: ['pending', 'sent', 'redeemed', 'expired', 'active'],
            default: 'pending',
            index: true,
        },
        sentAt: { type: Date },
        redeemedAt: { type: Date },
        criteria: {
            lastActivityDays: { type: Number },
            attendancePercentage: { type: Number },
            membershipTier: { type: String },
        },
        churnRiskScore: { type: Number },
    },
    { timestamps: true }
);

export default mongoose.model<IPersonalizedOffer>('PersonalizedOffer', PersonalizedOfferSchema);
