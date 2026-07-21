import mongoose, { Schema, Document } from 'mongoose';

export interface IStaffDeductionSettings extends Document {
    tenantId: mongoose.Types.ObjectId;
    deductionPerAbsentDay: number;     // fraction of daily rate (default 1.0 = full day)
    deductionPerLate: number;          // fixed INR amount per late instance (default ₹50)
    deductionPerEarlyDeparture: number;// fraction of daily rate (default 0.5 = half day)
    updatedAt: Date;
    createdAt: Date;
}

const StaffDeductionSettingsSchema = new Schema<IStaffDeductionSettings>(
    {
        tenantId:                  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
        deductionPerAbsentDay:     { type: Number, default: 1.0, min: 0, max: 2 },
        deductionPerLate:          { type: Number, default: 50,  min: 0 },
        deductionPerEarlyDeparture:{ type: Number, default: 0.5, min: 0, max: 1 },
    },
    { timestamps: true }
);

export default (mongoose.models.StaffDeductionSettings as mongoose.Model<IStaffDeductionSettings>) ||
    mongoose.model<IStaffDeductionSettings>('StaffDeductionSettings', StaffDeductionSettingsSchema);
