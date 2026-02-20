import AutomationRule from '../models/AutomationRule.model';
import Member from '../models/Member.model';
import Payment from '../models/Payment.model';
import WhatsAppService from './whatsapp.service';
import { sendEmail } from '../utils/email.util';
import { sendSMS } from '../utils/sms.util';
import logger from '../config/logger';

interface TriggerConfig {
    name: string;
    description: string;
    trigger: {
        event: 'member_joined' | 'payment_success' | 'payment_failed' | 'membership_expiring' | 'attendance_milestone' | 'birthday';
        conditions?: TriggerCondition[];
    };
    actions: TriggerAction[];
    isActive: boolean;
    tenantId: string;
}

interface TriggerCondition {
    field: string;
    operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
    value: any;
}

interface TriggerAction {
    type: 'send_email' | 'send_sms' | 'send_whatsapp' | 'update_field' | 'create_task' | 'send_notification';
    config: any;
}

class TriggerAutomationService {
    /**
     * Create automation rule
     */
    async createRule(config: TriggerConfig) {
        const rule = await AutomationRule.create({
            ...config,
            createdAt: new Date(),
            executionCount: 0,
        });

        logger.info('Automation rule created', { ruleId: rule._id });

        return rule;
    }

    /**
     * Execute trigger when event occurs
     */
    async executeTrigger(event: string, data: any, tenantId: string) {
        // Find active rules for this event
        const rules = await AutomationRule.find({
            'trigger.event': event,
            isActive: true,
            tenantId,
        });

        for (const rule of rules) {
            try {
                // Check conditions
                if (rule.trigger.condition && rule.trigger.condition.length > 0) {
                    const conditionsMet = this.checkConditions(rule.trigger.condition, data);
                    if (!conditionsMet) continue;
                }

                // Execute actions
                for (const action of rule.actions) {
                    await this.executeAction(action, data);
                }

                // Update execution count
                rule.executionCount = (rule.executionCount || 0) + 1;
                rule.lastExecutedAt = new Date();
                await rule.save();

                logger.info('Automation rule executed', { ruleId: rule._id, event });
            } catch (error: any) {
                logger.error('Automation rule execution failed', { error, ruleId: rule._id });
            }
        }
    }

    /**
     * Check if conditions are met
     */
    private checkConditions(conditions: TriggerCondition[], data: any): boolean {
        return conditions.every((condition) => {
            const value = data[condition.field];

            switch (condition.operator) {
                case 'equals':
                    return value === condition.value;
                case 'not_equals':
                    return value !== condition.value;
                case 'greater_than':
                    return value > condition.value;
                case 'less_than':
                    return value < condition.value;
                case 'contains':
                    return String(value).includes(condition.value);
                default:
                    return false;
            }
        });
    }

    /**
     * Execute action
     */
    private async executeAction(action: TriggerAction, data: any) {
        switch (action.type) {
            case 'send_email':
                await this.sendEmailAction(action.config, data);
                break;
            case 'send_sms':
                await this.sendSMSAction(action.config, data);
                break;
            case 'send_whatsapp':
                await this.sendWhatsAppAction(action.config, data);
                break;
            case 'update_field':
                await this.updateFieldAction(action.config, data);
                break;
            case 'create_task':
                await this.createTaskAction(action.config, data);
                break;
        }
    }

    /**
     * Send email action
     */
    private async sendEmailAction(config: any, data: any) {
        const { to, subject, template, templateData } = config;

        const recipient = to === 'member' ? data.email : to;
        const personalizedData = this.personalizeData(templateData, data);

        await sendEmail({
            to: recipient,
            subject,
            template,
            data: personalizedData,
        });
    }

    /**
     * Send SMS action
     */
    private async sendSMSAction(config: any, data: any) {
        const { to, message } = config;

        const recipient = to === 'member' ? data.mobile : to;
        const personalizedMessage = this.personalizeMessage(message, data);

        await sendSMS(recipient, personalizedMessage);
    }

    /**
     * Send WhatsApp action
     */
    private async sendWhatsAppAction(config: any, data: any) {
        const { to, message } = config;

        const recipient = to === 'member' ? data.mobile : to;
        const personalizedMessage = this.personalizeMessage(message, data);

        await WhatsAppService.sendMessage({
            to: recipient,
            message: personalizedMessage,
        });
    }

    /**
     * Update field action
     */
    private async updateFieldAction(config: any, data: any) {
        const { model, field, value } = config;

        if (model === 'member' && data.memberId) {
            await Member.findByIdAndUpdate(data.memberId, { [field]: value });
        }
    }

    /**
     * Create task action
     */
    private async createTaskAction(config: any, data: any) {
        // Implementation for task creation
        logger.info('Task created via automation', { config, data });
    }

    /**
     * Personalize message with data
     */
    private personalizeMessage(template: string, data: any): string {
        let message = template;

        Object.keys(data).forEach((key) => {
            message = message.replace(new RegExp(`{${key}}`, 'g'), data[key]);
        });

        return message;
    }

    /**
     * Personalize template data
     */
    private personalizeData(templateData: any, data: any): any {
        const personalized: any = {};

        Object.keys(templateData).forEach((key) => {
            const value = templateData[key];
            if (typeof value === 'string') {
                personalized[key] = this.personalizeMessage(value, data);
            } else {
                personalized[key] = value;
            }
        });

        return personalized;
    }

    /**
     * Get all rules
     */
    async getAllRules(tenantId: string) {
        const rules = await AutomationRule.find({ tenantId }).sort({ createdAt: -1 });
        return rules;
    }

    /**
     * Update rule
     */
    async updateRule(ruleId: string, updates: Partial<TriggerConfig>) {
        const rule = await AutomationRule.findByIdAndUpdate(ruleId, updates, { new: true });

        if (!rule) {
            throw new Error('Automation rule not found');
        }

        logger.info('Automation rule updated', { ruleId });

        return rule;
    }

    /**
     * Delete rule
     */
    async deleteRule(ruleId: string) {
        const rule = await AutomationRule.findByIdAndDelete(ruleId);

        if (!rule) {
            throw new Error('Automation rule not found');
        }

        logger.info('Automation rule deleted', { ruleId });

        return {
            success: true,
            message: 'Automation rule deleted successfully',
        };
    }

    /**
     * Test rule execution
     */
    async testRule(ruleId: string, testData: any) {
        const rule = await AutomationRule.findById(ruleId);

        if (!rule) {
            throw new Error('Automation rule not found');
        }

        try {
            // Check conditions
            if (rule.trigger.condition && rule.trigger.condition.length > 0) {
                const conditionsMet = this.checkConditions(rule.trigger.condition, testData);
                if (!conditionsMet) {
                    return {
                        success: false,
                        message: 'Conditions not met',
                    };
                }
            }

            // Execute actions (in test mode, just log)
            logger.info('Testing automation rule', { ruleId, testData });

            return {
                success: true,
                message: 'Rule would execute successfully',
                actions: rule.actions,
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message,
            };
        }
    }
}

export default new TriggerAutomationService();
