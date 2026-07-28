import mongoose, { Schema, Document } from 'mongoose';

export type BotNodeType =
    | 'greeting'
    | 'main_menu'
    | 'membership_info'
    | 'trial_offer'
    | 'schedule_tour'
    | 'pricing'
    | 'trainer_info'
    | 'collect_name'
    | 'collect_phone'
    | 'collect_email'
    | 'lead_capture'
    | 'human_handoff'
    | 'farewell';

export interface IBotNode {
    nodeId: string;
    type: BotNodeType;
    message: string;
    options?: { label: string; nextNodeId: string; keyword?: string }[];
    isTerminal?: boolean;
    captureField?: string;
    nextNodeId?: string;
}

export interface IWhatsAppBot extends Document {
    tenantId: mongoose.Types.ObjectId;
    isEnabled: boolean;
    botName: string;
    welcomeMessage: string;
    fallbackMessage: string;
    humanHandoffMessage: string;
    nodes: IBotNode[];
    triggerKeywords: string[];
    businessHours: {
        enabled: boolean;
        timezone: string;
        schedule: {
            day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
            open: string;
            close: string;
            isOpen: boolean;
        }[];
        outsideHoursMessage: string;
    };
    leadCaptureEnabled: boolean;
    autoAssignTo?: mongoose.Types.ObjectId;
    totalConversations: number;
    totalLeadsCaptured: number;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const BotNodeSchema = new Schema(
    {
        nodeId: { type: String, required: true },
        type: {
            type: String,
            enum: [
                'greeting', 'main_menu', 'membership_info', 'trial_offer',
                'schedule_tour', 'pricing', 'trainer_info', 'collect_name',
                'collect_phone', 'collect_email', 'lead_capture', 'human_handoff', 'farewell',
            ],
            required: true,
        },
        message: { type: String, required: true },
        options: [
            {
                label: { type: String, required: true },
                nextNodeId: { type: String, required: true },
                keyword: { type: String },
            },
        ],
        isTerminal: { type: Boolean, default: false },
        captureField: { type: String },
        nextNodeId: { type: String },
    },
    { _id: false }
);

const WhatsAppBotSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
        isEnabled: { type: Boolean, default: false },
        botName: { type: String, default: 'GymBot' },
        welcomeMessage: {
            type: String,
            default: 'Hello! Welcome to our gym. How can I help you today?',
        },
        fallbackMessage: {
            type: String,
            default: "I didn't understand that. Please choose from the options below.",
        },
        humanHandoffMessage: {
            type: String,
            default: 'Connecting you to our team. Please wait a moment.',
        },
        nodes: [BotNodeSchema],
        triggerKeywords: [{ type: String }],
        businessHours: {
            enabled: { type: Boolean, default: false },
            timezone: { type: String, default: 'Asia/Kolkata' },
            schedule: [
                {
                    day: { type: String, enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
                    open: { type: String, default: '09:00' },
                    close: { type: String, default: '21:00' },
                    isOpen: { type: Boolean, default: true },
                },
            ],
            outsideHoursMessage: {
                type: String,
                default: "We're currently closed. We'll respond as soon as we're back!",
            },
        },
        leadCaptureEnabled: { type: Boolean, default: true },
        autoAssignTo: { type: Schema.Types.ObjectId, ref: 'User' },
        totalConversations: { type: Number, default: 0 },
        totalLeadsCaptured: { type: Number, default: 0 },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

export default mongoose.model<IWhatsAppBot>('WhatsAppBot', WhatsAppBotSchema);
