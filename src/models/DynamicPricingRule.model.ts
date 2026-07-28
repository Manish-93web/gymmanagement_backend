import mongoose, { Schema, Document } from 'mongoose';

export interface IPeakHour {
    startHour: number;
    endHour: number;
    days: number[];
}

export interface IPinnedDate {
    date: Date;
    price: number;
    reason?: string;
}

export interface IDynamicPricingRule extends Document {
    tenantId: string;
    branchId?: string;
    name: string;
    isEnabled: boolean;
    applyToAllClasses: boolean;
    classIds?: string[];
    peakHours: IPeakHour[];
    peakMultiplier: number;
    offPeakDiscount: number;
    minPrice?: number;
    maxPrice?: number;
    pinnedDates: IPinnedDate[];
    demandSensitivity: 'low' | 'medium' | 'high';
    createdAt: Date;
    updatedAt: Date;
}

const PeakHourSchema = new Schema(
    {
        startHour: { type: Number, required: true, min: 0, max: 23 },
        endHour: { type: Number, required: true, min: 0, max: 23 },
        days: [{ type: Number, min: 0, max: 6 }],
    },
    { _id: false }
);

const PinnedDateSchema = new Schema(
    {
        date: { type: Date, required: true },
        price: { type: Number, required: true },
        reason: { type: String },
    },
    { _id: false }
);

const DynamicPricingRuleSchema: Schema = new Schema(
    {
        tenantId: { type: String, required: true, index: true },
        branchId: { type: String },
        name: { type: String, required: true },
        isEnabled: { type: Boolean, default: true },
        applyToAllClasses: { type: Boolean, default: true },
        classIds: [{ type: String }],
        peakHours: [PeakHourSchema],
        peakMultiplier: { type: Number, default: 1.5 },
        offPeakDiscount: { type: Number, default: 0.8 },
        minPrice: { type: Number },
        maxPrice: { type: Number },
        pinnedDates: [PinnedDateSchema],
        demandSensitivity: {
            type: String,
            enum: ['low', 'medium', 'high'],
            default: 'medium',
        },
    },
    { timestamps: true }
);

DynamicPricingRuleSchema.index({ tenantId: 1 });
DynamicPricingRuleSchema.index({ tenantId: 1, isEnabled: 1 });

export default mongoose.model<IDynamicPricingRule>('DynamicPricingRule', DynamicPricingRuleSchema);
