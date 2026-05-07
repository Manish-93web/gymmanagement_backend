import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import AIService from '../services/ai.service';
import CRMService from '../services/crm.service';

const generateWorkoutSchema = z.object({
    memberId: z.string(),
    goal: z.enum(['strength', 'hypertrophy', 'endurance', 'weight_loss', 'general_fitness']),
    daysPerWeek: z.number().min(1).max(7),
    experience: z.enum(['beginner', 'intermediate', 'advanced']),
    equipmentAvailable: z.array(z.string()),
});

const generateDietSchema = z.object({
    memberId: z.string(),
    goal: z.enum(['weight_loss', 'muscle_gain', 'maintenance', 'athletic_performance']),
    dietaryPreferences: z.array(z.string()).optional(),
    allergies: z.array(z.string()).optional(),
    mealsPerDay: z.number().min(1).max(8),
});

const chatbotSchema = z.object({
    memberId: z.string(),
    message: z.string(),
    conversationHistory: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
    })).optional(),
});

const createLeadSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional(),
    mobile: z.string(),
    source: z.enum(['walk_in', 'website', 'referral', 'social_media', 'advertisement', 'other']),
    interestedIn: z.array(z.string()).optional(),
    budget: z.number().optional(),
    notes: z.string().optional(),
});

const addFollowUpSchema = z.object({
    date: z.string(),
    type: z.enum(['call', 'email', 'sms', 'whatsapp', 'visit']),
    notes: z.string(),
    outcome: z.enum(['interested', 'not_interested', 'callback', 'converted', 'no_response']).optional(),
    nextFollowUp: z.string().optional(),
});

export class AIAndCRMController {
    // AI endpoints
    async generateWorkoutPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = generateWorkoutSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';

            const workoutPlan = await AIService.generateWorkoutPlan(
                validatedData.memberId,
                validatedData.goal,
                validatedData.experience,
                validatedData.daysPerWeek,
                validatedData.equipmentAvailable,
                tenantId
            );

            res.status(200).json({ success: true, data: workoutPlan });
        } catch (error) {
            next(error);
        }
    }

    async generateDietPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = generateDietSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';

            const dietPlan = await AIService.generateDietPlan(
                validatedData.memberId,
                validatedData.goal,
                validatedData.dietaryPreferences,
                validatedData.allergies,
                validatedData.mealsPerDay,
                tenantId
            );

            res.status(200).json({ success: true, data: dietPlan });
        } catch (error) {
            next(error);
        }
    }

    async chatbot(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = chatbotSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';

            const response = await AIService.chatbot(
                validatedData.memberId,
                validatedData.message,
                tenantId,
                validatedData.conversationHistory
            );

            res.status(200).json({ success: true, data: response });
        } catch (error) {
            next(error);
        }
    }

    async predictChurn(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params as Record<string, string>;
            const prediction = await AIService.predictChurn(memberId);

            res.status(200).json({ success: true, data: prediction });
        } catch (error) {
            next(error);
        }
    }

    async getProgressInsights(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';

            const insights = await AIService.getProgressInsights(memberId, tenantId);

            res.status(200).json({ success: true, data: insights });
        } catch (error) {
            next(error);
        }
    }

    // CRM endpoints
    async createLead(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createLeadSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';
            const branchId = req.user?.branchId?.toString() || '';
            const assignedTo = req.user?._id?.toString() || '';

            const lead = await CRMService.createLead({
                ...validatedData,
                tenantId,
                branchId,
                assignedTo,
            });

            res.status(201).json({ success: true, data: lead });
        } catch (error) {
            next(error);
        }
    }

    async getLeads(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const { branchId, status, source, assignedTo } = req.query;

            const leads = await CRMService.getLeads(
                tenantId,
                branchId as string,
                status as any,
                source as any,
                assignedTo as string
            );

            res.status(200).json({ success: true, data: leads });
        } catch (error) {
            next(error);
        }
    }

    async getLeadById(req: Request, res: Response, next: NextFunction) {
        try {
            const { leadId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';
            const lead = await CRMService.getLeadById(leadId, tenantId);
            if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
            res.status(200).json({ success: true, data: lead });
        } catch (error) {
            next(error);
        }
    }

    async updateLeadStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { leadId } = req.params as Record<string, string>;
            const { status, reason } = req.body;
            const tenantId = req.user?.tenantId?.toString() || '';
            const changedBy = req.user?._id?.toString() || 'system';

            const lead = await CRMService.updateLeadStatus(leadId, status, tenantId, changedBy);

            res.status(200).json({ success: true, data: lead });
        } catch (error) {
            next(error);
        }
    }

    async addFollowUp(req: Request, res: Response, next: NextFunction) {
        try {
            const { leadId } = req.params as Record<string, string>;
            const validatedData = addFollowUpSchema.parse(req.body);
            const tenantId = req.user?.tenantId?.toString() || '';
            const userId = req.user?._id?.toString() || 'system';

            const lead = await CRMService.addFollowUp(leadId, {
                ...validatedData,
                date: new Date(validatedData.date),
                nextFollowUp: validatedData.nextFollowUp ? new Date(validatedData.nextFollowUp) : undefined,
            }, tenantId, userId);

            res.status(200).json({ success: true, data: lead });
        } catch (error) {
            next(error);
        }
    }

    async getLeadStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const { branchId } = req.query;

            const stats = await CRMService.getLeadStats(tenantId, branchId as string);

            res.status(200).json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    }

    async getSalesFunnel(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const { branchId } = req.query;

            const funnel = await CRMService.getSalesFunnel(tenantId, branchId as string);

            res.status(200).json({ success: true, data: funnel });
        } catch (error) {
            next(error);
        }
    }

    async convertLead(req: Request, res: Response, next: NextFunction) {
        try {
            const { leadId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';
            const changedBy = req.user?._id?.toString() || 'system';
            const lead = await CRMService.updateLeadStatus(leadId, 'converted' as any, tenantId, changedBy);
            if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
            res.status(200).json({ success: true, message: 'Lead converted', data: lead });
        } catch (error) {
            next(error);
        }
    }

    async createPublicLead(req: Request, res: Response, next: NextFunction) {
        try {
            const { tenantSlug, firstName, lastName, email, mobile, source = 'website', interestedIn, notes } = req.body;
            if (!firstName || !mobile) {
                return res.status(400).json({ success: false, message: 'firstName and mobile are required' });
            }
            const Tenant = (await import('../models/Tenant.model')).default;
            const tenant = tenantSlug
                ? await Tenant.findOne({ slug: tenantSlug })
                : await Tenant.findById(req.body.tenantId);
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            const lead = await CRMService.createLead({
                tenantId: tenant._id.toString(),
                branchId: '',
                firstName,
                lastName: lastName || '',
                email,
                mobile,
                source,
                interestedIn,
                notes,
            });
            res.status(201).json({ success: true, data: lead });
        } catch (error) {
            next(error);
        }
    }
}

export default new AIAndCRMController();

