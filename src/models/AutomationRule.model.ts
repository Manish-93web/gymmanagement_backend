import mongoose, { Schema, Document } from 'mongoose';

export type ActionType = 'send_email' | 'send_sms' | 'send_whatsapp' | 'update_field' | 'create_task' | 'send_notification';

export interface TriggerCondition {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
    value: any;
}

export interface TriggerAction {
    type: ActionType;
    config: any;
    delay?: number; // in minutes
}

export interface IAutomationRule extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    description: string;
    trigger: {
        type: 'member_signup' | 'subscription_expiring' | 'payment_failed' | 'inactivity' | 'birthday' | 'custom';
        condition?: TriggerCondition[];
    };
    actions: TriggerAction[];
    isActive: boolean;
    executionCount: number;
    lastExecutedAt?: Date;
    executionLog?: {
        date: Date;
        status: 'success' | 'failed';
        details?: string;
    }[];
    createdAt: Date;
    updatedAt: Date;
}

const AutomationRuleSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true },
        description: { type: String },
        trigger: {
            type: {
                type: String,
                enum: ['member_signup', 'subscription_expiring', 'payment_failed', 'inactivity', 'birthday', 'custom'],
                required: true,
            },
            condition: [
                {
                    field: { type: String },
                    operator: {
                        type: String,
                        enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains'],
                    },
                    value: { type: Schema.Types.Mixed },
                },
            ],
        },
        actions: [
            {
                type: {
                    type: String,
                    enum: [
                        'send_email',
                        'send_sms',
                        'send_whatsapp',
                        'update_field',
                        'create_task',
                        'send_notification',
                    ],
                },
                config: { type: Schema.Types.Mixed },
                delay: { type: Number, default: 0 },
            },
        ],
        isActive: { type: Boolean, default: true, index: true },
        executionCount: { type: Number, default: 0 },
        lastExecutedAt: { type: Date },
        executionLog: [
            {
                date: { type: Date, default: Date.now },
                status: { type: String, enum: ['success', 'failed'] },
                details: { type: String },
            },
        ],
    },
    { timestamps: true }
);

export default mongoose.model<IAutomationRule>('AutomationRule', AutomationRuleSchema);
