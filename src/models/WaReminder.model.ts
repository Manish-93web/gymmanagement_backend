import mongoose, { Document, Schema } from 'mongoose';

export interface IWaReminder extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    memberId?: mongoose.Types.ObjectId;
    memberName: string;
    phone: string;
    type: string;
    message: string;
    scheduledFor: Date;
    status: 'pending' | 'dismissed' | 'sent';
    notes?: string;
    createdBy?: mongoose.Types.ObjectId;
    createdByName: string;
    createdAt: Date;
    updatedAt: Date;
}

const WaReminderSchema = new Schema<IWaReminder>({
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
    memberName: { type: String, required: true },
    phone: { type: String, required: true },
    type: { type: String, required: true },
    message: { type: String, required: true },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'dismissed', 'sent'], default: 'pending' },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, default: '' },
}, { timestamps: true });

WaReminderSchema.index({ tenantId: 1, status: 1, scheduledFor: 1 });
WaReminderSchema.index({ tenantId: 1, memberId: 1 });

export default mongoose.model<IWaReminder>('WaReminder', WaReminderSchema);
