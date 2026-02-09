import EmailTemplate from '../models/EmailTemplate.model';
import SMSTemplate from '../models/SMSTemplate.model';
import logger from '../config/logger';

interface TemplateData {
    name: string;
    subject?: string; // For email only
    content: string;
    variables: string[];
    category: 'transactional' | 'marketing' | 'notification';
    isActive: boolean;
    tenantId: string;
}

class TemplateEditorService {
    /**
     * Create email template
     */
    async createEmailTemplate(data: TemplateData) {
        const template = await EmailTemplate.create({
            ...data,
            createdAt: new Date(),
        });

        logger.info('Email template created', { templateId: template._id });

        return template;
    }

    /**
     * Create SMS template
     */
    async createSMSTemplate(data: Omit<TemplateData, 'subject'>) {
        const template = await SMSTemplate.create({
            ...data,
            createdAt: new Date(),
        });

        logger.info('SMS template created', { templateId: template._id });

        return template;
    }

    /**
     * Get all email templates
     */
    async getAllEmailTemplates(tenantId: string) {
        const templates = await EmailTemplate.find({ tenantId }).sort({ createdAt: -1 });
        return templates;
    }

    /**
     * Get all SMS templates
     */
    async getAllSMSTemplates(tenantId: string) {
        const templates = await SMSTemplate.find({ tenantId }).sort({ createdAt: -1 });
        return templates;
    }

    /**
     * Get email template by name
     */
    async getEmailTemplate(tenantId: string, name: string) {
        const template = await EmailTemplate.findOne({ tenantId, name, isActive: true });

        if (!template) {
            throw new Error('Email template not found');
        }

        return template;
    }

    /**
     * Get SMS template by name
     */
    async getSMSTemplate(tenantId: string, name: string) {
        const template = await SMSTemplate.findOne({ tenantId, name, isActive: true });

        if (!template) {
            throw new Error('SMS template not found');
        }

        return template;
    }

    /**
     * Update email template
     */
    async updateEmailTemplate(templateId: string, updates: Partial<TemplateData>) {
        const template = await EmailTemplate.findByIdAndUpdate(
            templateId,
            { $set: updates },
            { new: true }
        );

        if (!template) {
            throw new Error('Email template not found');
        }

        logger.info('Email template updated', { templateId });

        return template;
    }

    /**
     * Update SMS template
     */
    async updateSMSTemplate(templateId: string, updates: Partial<Omit<TemplateData, 'subject'>>) {
        const template = await SMSTemplate.findByIdAndUpdate(
            templateId,
            { $set: updates },
            { new: true }
        );

        if (!template) {
            throw new Error('SMS template not found');
        }

        logger.info('SMS template updated', { templateId });

        return template;
    }

    /**
     * Delete email template
     */
    async deleteEmailTemplate(templateId: string) {
        const template = await EmailTemplate.findByIdAndDelete(templateId);

        if (!template) {
            throw new Error('Email template not found');
        }

        logger.info('Email template deleted', { templateId });

        return {
            success: true,
            message: 'Email template deleted successfully',
        };
    }

    /**
     * Delete SMS template
     */
    async deleteSMSTemplate(templateId: string) {
        const template = await SMSTemplate.findByIdAndDelete(templateId);

        if (!template) {
            throw new Error('SMS template not found');
        }

        logger.info('SMS template deleted', { templateId });

        return {
            success: true,
            message: 'SMS template deleted successfully',
        };
    }

    /**
     * Render template with variables
     */
    renderTemplate(template: string, variables: { [key: string]: any }): string {
        let rendered = template;

        Object.keys(variables).forEach((key) => {
            const regex = new RegExp(`{${key}}`, 'g');
            rendered = rendered.replace(regex, variables[key]);
        });

        return rendered;
    }

    /**
     * Preview template
     */
    async previewEmailTemplate(templateId: string, sampleData: any) {
        const template = await EmailTemplate.findById(templateId);

        if (!template) {
            throw new Error('Email template not found');
        }

        const renderedSubject = this.renderTemplate(template.subject, sampleData);
        const renderedContent = this.renderTemplate(template.content, sampleData);

        return {
            subject: renderedSubject,
            content: renderedContent,
        };
    }

    /**
     * Preview SMS template
     */
    async previewSMSTemplate(templateId: string, sampleData: any) {
        const template = await SMSTemplate.findById(templateId);

        if (!template) {
            throw new Error('SMS template not found');
        }

        const renderedContent = this.renderTemplate(template.content, sampleData);

        return {
            content: renderedContent,
            length: renderedContent.length,
            segments: Math.ceil(renderedContent.length / 160),
        };
    }

    /**
     * Duplicate template
     */
    async duplicateEmailTemplate(templateId: string) {
        const original = await EmailTemplate.findById(templateId);

        if (!original) {
            throw new Error('Email template not found');
        }

        const duplicate = await EmailTemplate.create({
            name: `${original.name} (Copy)`,
            subject: original.subject,
            content: original.content,
            variables: original.variables,
            category: original.category,
            isActive: false,
            tenantId: original.tenantId,
            createdAt: new Date(),
        });

        logger.info('Email template duplicated', { originalId: templateId, duplicateId: duplicate._id });

        return duplicate;
    }

    /**
     * Get available variables
     */
    getAvailableVariables() {
        return {
            member: [
                'firstName',
                'lastName',
                'email',
                'mobile',
                'membershipNumber',
                'membershipExpiry',
            ],
            payment: ['amount', 'transactionId', 'date', 'planName'],
            class: ['className', 'trainerName', 'startTime', 'endTime'],
            general: ['siteName', 'supportEmail', 'supportPhone'],
        };
    }
}

export default new TemplateEditorService();
