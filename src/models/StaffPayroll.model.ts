import mongoose, { Schema, Document } from 'mongoose';

/** A generated monthly payslip for one staff member / trainer. */
export interface IStaffPayroll extends Document {
    tenantId: mongoose.Types.ObjectId;
    staffId: mongoose.Types.ObjectId;
    month: number;                 // 1-12
    year: number;
    monthlySalary: number;         // contractual monthly salary used for the run
    workingDays: number;
    paidLeaveDays: number;
    absentDays: number;
    lateCount: number;
    earlyDepartures: number;
    shortfallHours: number;
    shortfallDeduction: number;
    totalHours: number;
    overtimeHours: number;
    basePay: number;
    overtimePay: number;
    absentDayDeduction: number;
    lateDeduction: number;
    earlyDepartureDeduction: number;
    deductions: number;
    netPay: number;
    status: 'generated' | 'paid';
    generatedAt: Date;
    generatedBy?: mongoose.Types.ObjectId;
    paidAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const StaffPayrollSchema = new Schema<IStaffPayroll>(
    {
        tenantId:  { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        staffId:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
        month:     { type: Number, required: true, min: 1, max: 12 },
        year:      { type: Number, required: true },
        monthlySalary: { type: Number, default: 0 },
        workingDays: { type: Number, default: 0 },
        paidLeaveDays: { type: Number, default: 0 },
        absentDays: { type: Number, default: 0 },
        lateCount: { type: Number, default: 0 },
        earlyDepartures: { type: Number, default: 0 },
        shortfallHours: { type: Number, default: 0 },
        shortfallDeduction: { type: Number, default: 0 },
        totalHours: { type: Number, default: 0 },
        overtimeHours: { type: Number, default: 0 },
        basePay: { type: Number, default: 0 },
        overtimePay: { type: Number, default: 0 },
        absentDayDeduction: { type: Number, default: 0 },
        lateDeduction: { type: Number, default: 0 },
        earlyDepartureDeduction: { type: Number, default: 0 },
        deductions: { type: Number, default: 0 },
        netPay: { type: Number, default: 0 },
        status:    { type: String, enum: ['generated', 'paid'], default: 'generated' },
        generatedAt: { type: Date, default: Date.now },
        generatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        paidAt:    { type: Date },
    },
    { timestamps: true }
);

StaffPayrollSchema.index({ tenantId: 1, staffId: 1, month: 1, year: 1 }, { unique: true });

export default (mongoose.models.StaffPayroll as mongoose.Model<IStaffPayroll>) ||
    mongoose.model<IStaffPayroll>('StaffPayroll', StaffPayrollSchema);
