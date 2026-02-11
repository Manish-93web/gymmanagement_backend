import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import CommunicationTemplate from '../models/CommunicationTemplate.model';

const templateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    type: z.enum(['email', 'sms', 'whatsapp']),
    subject: z.string().optional(),
    content: z.string().min(1),
    variables: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
});

export class TemplateController {
    async createTemplate(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = templateSchema.parse(req.body);
            const tenantId = req.user?.tenantId;

            const template = await CommunicationTemplate.create({
                ...validatedData,
                tenantId,
            });

            res.status(201).json({
                success: true,
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    async getTemplates(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId;
            const { type } = req.query;

            const filter: any = { tenantId };
            if (type) filter.type = type;

            const templates = await CommunicationTemplate.find(filter).sort({ createdAt: -1 });

            res.status(200).json({
                success: true,
                data: templates,
            });
        } catch (error) {
            next(error);
        }
    }

    async getTemplateById(req: Request, res: Response, next: NextFunction) {
        try {
            const { templateId } = req.params;
            const tenantId = req.user?.tenantId;

            const template = await CommunicationTemplate.findOne({ _id: templateId, tenantId });

            if (!template) {
                return res.status(404).json({
                    success: false,
                    message: 'Template not found',
                });
            }

            res.status(200).json({
                success: true,
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    async updateTemplate(req: Request, res: Response, next: NextFunction) {
        try {
            const { templateId } = req.params;
            const tenantId = req.user?.tenantId;
            const validatedData = templateSchema.partial().parse(req.body);

            const template = await CommunicationTemplate.findOneAndUpdate(
                { _id: templateId, tenantId },
                { $set: validatedData },
                { new: true, runValidators: true }
            );

            if (!template) {
                return res.status(404).json({
                    success: false,
                    message: 'Template not found',
                });
            }

            res.status(200).json({
                success: true,
                data: template,
            });
        } catch (error) {
            next(error);
        }
    }

    async deleteTemplate(req: Request, res: Response, next: NextFunction) {
        try {
            const { templateId } = req.params;
            const tenantId = req.user?.tenantId;

            const template = await CommunicationTemplate.findOneAndDelete({ _id: templateId, tenantId });

            if (!template) {
                return res.status(404).json({
                    success: false,
                    message: 'Template not found',
                });
            }

            res.status(200).json({
                success: true,
                message: 'Template deleted successfully',
            });
        } catch (error) {
            next(error);
        }
    }
}

export default new TemplateController();
