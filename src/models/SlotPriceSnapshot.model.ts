import mongoose, { Schema, Document } from 'mongoose';

export interface ISlotPriceSnapshot extends Document {
    tenantId: string;
    classId: string;
    className?: string;
    date: Date;
    slotTime: string;
    basePrice: number;
    computedPrice: number;
    priceLabel: 'peak' | 'off-peak' | 'standard' | 'special';
    demandScore: number;
    bookingCount: number;
    capacity: number;
    occupancyPercent: number;
    ruleName?: string;
    createdAt: Date;
    updatedAt: Date;
}

const SlotPriceSnapshotSchema: Schema = new Schema(
    {
        tenantId: { type: String, required: true, index: true },
        classId: { type: String, required: true },
        className: { type: String },
        date: { type: Date, required: true },
        slotTime: { type: String, required: true },
        basePrice: { type: Number, required: true },
        computedPrice: { type: Number, required: true },
        priceLabel: {
            type: String,
            enum: ['peak', 'off-peak', 'standard', 'special'],
            default: 'standard',
        },
        demandScore: { type: Number, default: 0 },
        bookingCount: { type: Number, default: 0 },
        capacity: { type: Number, default: 0 },
        occupancyPercent: { type: Number, default: 0 },
        ruleName: { type: String },
    },
    { timestamps: true }
);

SlotPriceSnapshotSchema.index({ tenantId: 1, classId: 1, date: 1 });
SlotPriceSnapshotSchema.index({ tenantId: 1, date: 1 });
SlotPriceSnapshotSchema.index({ tenantId: 1, priceLabel: 1 });

export default mongoose.model<ISlotPriceSnapshot>('SlotPriceSnapshot', SlotPriceSnapshotSchema);
