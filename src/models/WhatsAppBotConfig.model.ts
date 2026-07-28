import mongoose, { Document, Schema } from 'mongoose';

export interface IWhatsAppBotConfig extends Document {
  tenantId: mongoose.Types.ObjectId;
  enabled: boolean;
  botName: string;
  systemPrompt: string;
  welcomeMessage: string;
  offHoursMessage: string;
  offHoursEnabled: boolean;
  offHoursStart: string; // "HH:mm"
  offHoursEnd: string;   // "HH:mm"
  escalationKeywords: string[];
  escalationMessage: string;
  maxContextMessages: number;
  language: string;
  updatedBy?: mongoose.Types.ObjectId;
}

const WhatsAppBotConfigSchema = new Schema<IWhatsAppBotConfig>(
  {
    tenantId:   { type: Schema.Types.ObjectId, required: true, unique: true, index: true },
    enabled:    { type: Boolean, default: false },
    botName:    { type: String, default: 'GymBot' },
    systemPrompt: {
      type: String,
      default: `You are a friendly and professional sales assistant for a gym. Your job is to:
1. Answer questions about memberships, plans, pricing, facilities, and schedules
2. Qualify leads by asking about their fitness goals
3. Encourage prospects to visit the gym or book a free trial
4. Handle objections politely and professionally
5. Always be concise — respond in 2-4 sentences unless detail is needed
6. Never make up prices or facts you don't know — say "I'll have our team get back to you"
7. If someone wants to speak to a human, acknowledge and escalate

Keep responses friendly, motivating, and action-oriented.`,
    },
    welcomeMessage: {
      type: String,
      default: "Hi! I'm GymBot 🏋️ How can I help you today? Ask me about memberships, plans, or facilities!",
    },
    offHoursMessage: {
      type: String,
      default: "Hi! We're currently closed but I'll try my best to help. Our team will follow up during business hours.",
    },
    offHoursEnabled: { type: Boolean, default: false },
    offHoursStart:   { type: String, default: '22:00' },
    offHoursEnd:     { type: String, default: '07:00' },
    escalationKeywords: {
      type: [String],
      default: ['human', 'agent', 'speak to someone', 'manager', 'call me', 'complaint', 'refund'],
    },
    escalationMessage: {
      type: String,
      default: "I understand you'd like to speak with someone from our team. I've flagged your conversation and a team member will reach out to you shortly! 🙏",
    },
    maxContextMessages: { type: Number, default: 10 },
    language:   { type: String, default: 'en' },
    updatedBy:  { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

export default mongoose.model<IWhatsAppBotConfig>('WhatsAppBotConfig', WhatsAppBotConfigSchema);
