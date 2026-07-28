import mongoose, { Schema, Document } from 'mongoose';

interface IGroupMember {
  memberId: mongoose.Types.ObjectId;
  phone: string;
  name: string;
  addedAt: Date;
  status: 'active' | 'removed';
}

export interface IWhatsAppGroup extends Document {
  tenantId: string;
  name: string;
  description?: string;
  groupType: 'batch' | 'goal_based' | 'plan_tier' | 'location' | 'custom';
  segmentCriteria?: {
    planIds?: string[];
    tags?: string[];
    batchTime?: string;
    joinedAfter?: Date;
    joinedBefore?: Date;
  };
  members: IGroupMember[];
  memberCount: number;
  whatsappGroupId?: string;
  whatsappInviteLink?: string;
  isApiGroup: boolean;
  status: 'active' | 'archived';
  lastMessageAt?: Date;
  messageCount: number;
}

const WhatsAppGroupSchema = new Schema<IWhatsAppGroup>({
  tenantId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  groupType: {
    type: String,
    enum: ['batch', 'goal_based', 'plan_tier', 'location', 'custom'],
    default: 'custom',
  },
  segmentCriteria: {
    planIds: [String],
    tags: [String],
    batchTime: String,
    joinedAfter: Date,
    joinedBefore: Date,
  },
  members: [
    {
      memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
      phone: { type: String },
      name: { type: String },
      addedAt: { type: Date, default: Date.now },
      status: { type: String, enum: ['active', 'removed'], default: 'active' },
    },
  ],
  memberCount: { type: Number, default: 0 },
  whatsappGroupId: { type: String },
  whatsappInviteLink: { type: String },
  isApiGroup: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  lastMessageAt: { type: Date },
  messageCount: { type: Number, default: 0 },
}, { timestamps: true });

WhatsAppGroupSchema.index({ tenantId: 1, status: 1 });
WhatsAppGroupSchema.index({ tenantId: 1, groupType: 1 });
WhatsAppGroupSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export default mongoose.model<IWhatsAppGroup>('WhatsAppGroup', WhatsAppGroupSchema);
