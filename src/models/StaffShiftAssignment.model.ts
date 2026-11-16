import mongoose, { Document, Schema } from 'mongoose';

/**
 * Which shift a staff member works, and their weekly off days, from a given local date onwards.
 * History is kept: a day is judged by the latest assignment whose effectiveFrom is on or before it,
 * so changing someone's shift never rewrites the months already worked.
 * shiftId null means "gym default hours" (still with the weekly off days).
 */
export interface IStaffShiftAssignment extends Document {
    tenantId: mongoose.Types.ObjectId;
    staffId: mongoose.Types.ObjectId;
    shiftId: mongoose.Types.ObjectId | null;
    weeklyOff: number[];         // 0 = Sunday ... 6 = Saturday
    effectiveFrom: string;       // "YYYY-MM-DD", local date in the gym's timezone
    createdBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const assignmentSchema = new Schema<IStaffShiftAssignment>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        shiftId: { type: Schema.Types.ObjectId, ref: 'StaffShift', default: null },
        weeklyOff: { type: [Number], default: [] },
        effectiveFrom: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        createdBy: String,
    },
    { timestamps: true }
);

assignmentSchema.index({ tenantId: 1, staffId: 1, effectiveFrom: 1 }, { unique: true });
assignmentSchema.index({ tenantId: 1, shiftId: 1 });

export default mongoose.model<IStaffShiftAssignment>('StaffShiftAssignment', assignmentSchema);
