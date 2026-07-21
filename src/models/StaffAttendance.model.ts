import mongoose, { Schema, Document } from 'mongoose';

export interface IStaffAttendance extends Document {
  tenantId: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
  staffId: mongoose.Types.ObjectId;
  date: Date;
  clockIn: Date;
  clockOut?: Date;
  hoursWorked?: number;  // calculated when clocked out
  overtime?: number;     // hours beyond 8h shift, calculated at clock-out
  earlyDeparture?: boolean; // true if clocked out before shift end (18:00 default)
  status: 'present' | 'late' | 'absent' | 'half_day';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StaffAttendanceSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
  staffId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  date: { type: Date, required: true },
  clockIn: { type: Date, required: true },
  clockOut: { type: Date },
  hoursWorked: { type: Number },
  overtime: { type: Number, default: 0 },
  earlyDeparture: { type: Boolean, default: false },
  status: { type: String, enum: ['present', 'late', 'absent', 'half_day'], default: 'present' },
  notes: { type: String },
}, { timestamps: true });

StaffAttendanceSchema.index({ tenantId: 1, staffId: 1, date: 1 }, { unique: true });
StaffAttendanceSchema.index({ tenantId: 1, date: 1 });

export default mongoose.model<IStaffAttendance>('StaffAttendance', StaffAttendanceSchema);
