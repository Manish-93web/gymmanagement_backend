import mongoose, { Document, Schema } from 'mongoose';

export interface IAutomationConfig extends Document {
  tenantId: mongoose.Types.ObjectId;
  // GAP 52: Birthday greeting automation
  birthdayGreeting: {
    enabled: boolean;
    channels: ('sms' | 'whatsapp' | 'email' | 'push')[];
    messageTemplate: string;      // {{name}}, {{gym_name}} placeholders
    sendTime: string;             // 'HH:mm' — time of day to send (default '09:00')
    includeOffer: boolean;
    offerText?: string;           // e.g. '20% off on next PT session today!'
  };
  // GAP 52: Renewal reminder automation (expanded beyond basic SMS)
  renewalReminder: {
    enabled: boolean;
    channels: ('sms' | 'whatsapp' | 'email' | 'push')[];
    daysBefore: number[];         // e.g. [30, 15, 7, 3, 1] — days before expiry
    messageTemplate: string;
  };
  // Re-engagement automation for inactive members
  inactiveReEngagement: {
    enabled: boolean;
    channels: ('sms' | 'whatsapp' | 'email' | 'push')[];
    inactiveDaysThreshold: number; // e.g. 14 — trigger after 14 days of no check-in
    messageTemplate: string;
  };
  // Promotional SMS campaigns log
  promotionalCampaigns: {
    name: string;
    message: string;
    targetSegment: 'all' | 'active' | 'expired' | 'inactive' | 'specific_plan';
    targetPlanId?: mongoose.Types.ObjectId;
    scheduledAt: Date;
    sentAt?: Date;
    recipientCount?: number;
    status: 'scheduled' | 'sent' | 'cancelled';
    createdBy: mongoose.Types.ObjectId;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const AutomationConfigSchema = new Schema<IAutomationConfig>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, unique: true },
    birthdayGreeting: {
      enabled:         { type: Boolean, default: false },
      channels:        [{ type: String, enum: ['sms', 'whatsapp', 'email', 'push'] }],
      messageTemplate: { type: String, default: 'Happy Birthday {{name}}! 🎂 Wishing you a great day from {{gym_name}}!' },
      sendTime:        { type: String, default: '09:00' },
      includeOffer:    { type: Boolean, default: false },
      offerText:       { type: String },
    },
    renewalReminder: {
      enabled:         { type: Boolean, default: true },
      channels:        [{ type: String, enum: ['sms', 'whatsapp', 'email', 'push'] }],
      daysBefore:      { type: [Number], default: [30, 15, 7, 3, 1] },
      messageTemplate: { type: String, default: 'Hi {{name}}, your {{gym_name}} membership expires in {{days}} days. Renew now to continue your fitness journey!' },
    },
    inactiveReEngagement: {
      enabled:               { type: Boolean, default: false },
      channels:              [{ type: String, enum: ['sms', 'whatsapp', 'email', 'push'] }],
      inactiveDaysThreshold: { type: Number, default: 14 },
      messageTemplate:       { type: String, default: "Hi {{name}}, we miss you at {{gym_name}}! It's been a while since your last visit. Come back and keep the momentum going!" },
    },
    promotionalCampaigns: [{
      name:             { type: String, required: true },
      message:          { type: String, required: true },
      targetSegment:    { type: String, enum: ['all', 'active', 'expired', 'inactive', 'specific_plan'], required: true },
      targetPlanId:     { type: Schema.Types.ObjectId, ref: 'MembershipPlan' },
      scheduledAt:      { type: Date, required: true },
      sentAt:           { type: Date },
      recipientCount:   { type: Number },
      status:           { type: String, enum: ['scheduled', 'sent', 'cancelled'], default: 'scheduled' },
      createdBy:        { type: Schema.Types.ObjectId, ref: 'User', required: true },
    }],
  },
  { timestamps: true }
);

AutomationConfigSchema.index({ tenantId: 1 });

export default mongoose.model<IAutomationConfig>('AutomationConfig', AutomationConfigSchema);
