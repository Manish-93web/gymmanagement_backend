import mongoose, { Schema, Document } from 'mongoose';

export type TriggerType = 'event' | 'schedule' | 'condition';
export type ActionType = 'send_notification' | 'update_status' | 'assign_task' | 'webhook';

export interface IAutomationRule extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    name: string;
    description: string;
    isActive: boolean;
    trigger: {
        type: TriggerType;
        event?: string; // e.g., 'member.created', 'subscription.expiring'
        schedule?: {
            cron: string;
            timezone: string;
        };
        conditions?: {
            field: string;
            operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
            value: any;
        }[];
    };
    actions: {
        type: ActionType;
        config: any;
        delay?: number; // minutes
    }[];
    executionLog: {
        executedAt: Date;
        success: boolean;
        error?: string;
        affectedRecords: number;
    }[];
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const AutomationRuleSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        name: { type: String, required: true },
        description: { type: String },
        isActive: { type: Boolean, default: true, index: true },
        trigger: {
            type: {
                type: String,
                enum: ['event', 'schedule', 'condition'],
                required: true,
            },
            event: { type: String },
            schedule: {
                cron: { type: String },
                timezone: { type: String, default: 'UTC' },
            },
            conditions: [
                {
                    field: { type: String, required: true },
                    operator: {
                        type: String,
                        enum: ['equals', 'not_equals', 'greater_than', 'less_than', 'contains'],
                        required: true,
                    },
                    value: { type: Schema.Types.Mixed, required: true },
                },
            ],
        },
        actions: [
            {
                type: {
                    type: String,
                    enum: ['send_notification', 'update_status', 'assign_task', 'webhook'],
                    required: true,
                },
                config: { type: Schema.Types.Mixed, required: true },
                delay: { type: Number, default: 0 },
            },
        ],
        executionLog: [
            {
                executedAt: { type: Date, required: true },
                success: { type: Boolean, required: true },
                error: { type: String },
                affectedRecords: { type: Number, default: 0 },
            },
        ],
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
);

// Indexes
AutomationRuleSchema.index({ tenantId: 1, isActive: 1 });
AutomationRuleSchema.index({ 'trigger.event': 1, isActive: 1 });

export default mongoose.model<IAutomationRule>('AutomationRule', AutomationRuleSchema);
