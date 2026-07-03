import mongoose, { Schema, Document } from 'mongoose';

export interface IWhatsAppInbox extends Document {
  tenantId: mongoose.Types.ObjectId;
  from: string;          // phone number of sender
  fromName?: string;     // member name if matched
  memberId?: mongoose.Types.ObjectId;
  message: string;
  mediaUrl?: string;
  messageId: string;     // WhatsApp message ID
  status: 'unread' | 'read' | 'replied';
  assignedTo?: mongoose.Types.ObjectId;
  replies: Array<{
    message: string;
    sentAt: Date;
    sentBy: mongoose.Types.ObjectId;
  }>;
  receivedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WhatsAppInboxSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  from: { type: String, required: true, index: true },
  fromName: { type: String },
  memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
  message: { type: String, required: true },
  mediaUrl: { type: String },
  messageId: { type: String, required: true, unique: true },
  status: { type: String, enum: ['unread', 'read', 'replied'], default: 'unread', index: true },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
  replies: [{
    message: { type: String, required: true },
    sentAt: { type: Date, default: Date.now },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
  }],
  receivedAt: { type: Date, default: Date.now },
}, { timestamps: true });

WhatsAppInboxSchema.index({ tenantId: 1, status: 1 });
WhatsAppInboxSchema.index({ tenantId: 1, from: 1 });

export default mongoose.model<IWhatsAppInbox>('WhatsAppInbox', WhatsAppInboxSchema);
