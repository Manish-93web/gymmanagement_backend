import mongoose, { Schema, Document } from 'mongoose';

export interface IStaffDeductionSettings extends Document {
    tenantId: mongoose.Types.ObjectId;
    deductionPerAbsentDay: number;     // fraction of daily rate (default 1.0 = full day)
    deductionPerLate: number;          // fixed INR amount per late instance (default ₹50)
    deductionPerEarlyDeparture: number;// extra penalty, fraction of daily rate (default 0: short hours are already deducted pro rata)
    lateAfterTime: string;             // "HH:mm" local time; first punch after this is late
    shiftEndTime: string;              // "HH:mm" local time; last punch before this is early departure
    standardHoursPerDay: number;       // hours that make a full day (overtime starts after this)
    workingDaysPerMonth: number;       // divisor for the daily / hourly rate
    overtimeMultiplier: number;        // pay multiple for overtime hours
    graceMinutes: number;              // tolerance for late arrival after shift start and for short hours
    updatedAt: Date;
    createdAt: Date;
}

const StaffDeductionSettingsSchema = new Schema<IStaffDeductionSettings>(
    {
        tenantId:                  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
        deductionPerAbsentDay:     { type: Number, default: 1.0, min: 0, max: 2 },
        deductionPerLate:          { type: Number, default: 50,  min: 0 },
        deductionPerEarlyDeparture:{ type: Number, default: 0, min: 0, max: 1 },
        lateAfterTime:             { type: String, default: '09:30', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        shiftEndTime:              { type: String, default: '18:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
        standardHoursPerDay:       { type: Number, default: 8,  min: 1, max: 24 },
        workingDaysPerMonth:       { type: Number, default: 26, min: 1, max: 31 },
        overtimeMultiplier:        { type: Number, default: 1.5, min: 1, max: 3 },
        graceMinutes:              { type: Number, default: 10, min: 0, max: 120 },
    },
    { timestamps: true }
);

export default (mongoose.models.StaffDeductionSettings as mongoose.Model<IStaffDeductionSettings>) ||
    mongoose.model<IStaffDeductionSettings>('StaffDeductionSettings', StaffDeductionSettingsSchema);
