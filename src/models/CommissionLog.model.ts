import mongoose, { Document, Schema } from 'mongoose';

export interface ICommissionLog extends Document {
    trainerId: mongoose.Types.ObjectId;
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    type: 'session' | 'membership_sale' | 'pt_package' | 'product_sale' | 'manual';
    amount: number;
    baseAmount: number;
    percentage: number;
    referenceId?: mongoose.Types.ObjectId;
    referenceType?: 'Payment' | 'Subscription';
    description: string;
    status: 'pending' | 'approved' | 'paid' | 'cancelled';
    paidAt?: Date;
    paidBy?: mongoose.Types.ObjectId;
    month: number;
    year: number;
    notes?: string;
}

const CommissionLogSchema = new Schema<ICommissionLog>(
    {
        trainerId:     { type: Schema.Types.ObjectId, ref: 'Trainer',       required: true, index: true },
        tenantId:      { type: Schema.Types.ObjectId, ref: 'Tenant',        required: true, index: true },
        branchId:      { type: Schema.Types.ObjectId, ref: 'Branch',        required: true },
        type:          { type: String, enum: ['session', 'membership_sale', 'pt_package', 'product_sale', 'manual'], required: true },
        amount:        { type: Number, required: true, min: 0 },
        baseAmount:    { type: Number, default: 0,    min: 0 },
        percentage:    { type: Number, default: 0,    min: 0, max: 100 },
        referenceId:   { type: Schema.Types.ObjectId },
        referenceType: { type: String, enum: ['Payment', 'Subscription'] },
        description:   { type: String, required: true, trim: true },
        status:        { type: String, enum: ['pending', 'approved', 'paid', 'cancelled'], default: 'pending', index: true },
        paidAt:        { type: Date },
        paidBy:        { type: Schema.Types.ObjectId, ref: 'User' },
        month:         { type: Number, required: true, min: 1, max: 12 },
        year:          { type: Number, required: true, min: 2020 },
        notes:         { type: String, trim: true },
    },
    { timestamps: true },
);

CommissionLogSchema.index({ trainerId: 1, year: 1, month: 1 });
CommissionLogSchema.index({ tenantId: 1, branchId: 1, status: 1 });

export default mongoose.model<ICommissionLog>('CommissionLog', CommissionLogSchema);
