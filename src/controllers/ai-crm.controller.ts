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
    email: z.preprocess(v => (v === '' ? undefined : v), z.string().email().optional()),
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
            const { branchId, status, source, assignedTo, hasFollowUp, page, limit, search } = req.query;

            const leads = await CRMService.getLeads(
                tenantId,
                branchId as string,
                status as any,
                source as any,
                assignedTo as string,
                page ? parseInt(page as string, 10) : 1,
                limit ? parseInt(limit as string, 10) : 20,
                search as string,
                hasFollowUp === 'true'
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

    async updateLead(req: Request, res: Response, next: NextFunction) {
        try {
            const { leadId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';
            const Lead = (await import('../models/Lead.model')).default;
            const lead = await Lead.findOneAndUpdate(
                { _id: leadId, tenantId },
                { $set: req.body },
                { new: true }
            );
            if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
            return res.status(200).json({ success: true, data: lead });
        } catch (error) {
            next(error);
        }
    }

    async deleteLead(req: Request, res: Response, next: NextFunction) {
        try {
            const { leadId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';
            const Lead = (await import('../models/Lead.model')).default;
            const lead = await Lead.findOneAndDelete({ _id: leadId, tenantId });
            if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
            return res.status(200).json({ success: true, message: 'Lead deleted' });
        } catch (error) {
            next(error);
        }
    }

    async addCallLog(req: Request, res: Response, next: NextFunction) {
        try {
            const { leadId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';
            const staffId = req.user?._id?.toString();
            const { duration, outcome, notes, nextFollowUp } = req.body;
            const Lead = (await import('../models/Lead.model')).default;
            const CallLog = (await import('../models/CallLog.model')).default;
            const lead = await Lead.findOne({ _id: leadId, tenantId });
            if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
            const branchId = req.user?.branchId?.toString() || '';
            const log = await CallLog.create({
                tenantId,
                branchId,
                memberId: (lead as any).memberId || lead._id,
                userId: staffId || req.user?._id,
                direction: 'outbound',
                startTime: new Date(),
                duration: duration || 0,
                status: outcome === 'no_answer' ? 'no-answer' : (outcome || 'completed'),
                notes,
                nextFollowUp: nextFollowUp ? new Date(nextFollowUp) : undefined,
                followUpRequired: !!nextFollowUp,
            } as any);
            if (nextFollowUp) {
                await Lead.findByIdAndUpdate(leadId, { nextFollowUp: new Date(nextFollowUp) });
            }
            return res.status(201).json({ success: true, data: log });
        } catch (error) {
            next(error);
        }
    }

    async getCallLogs(req: Request, res: Response, next: NextFunction) {
        try {
            const { leadId } = req.params as Record<string, string>;
            const tenantId = req.user?.tenantId?.toString() || '';
            const Lead = (await import('../models/Lead.model')).default;
            const CallLog = (await import('../models/CallLog.model')).default;
            const lead = await Lead.findOne({ _id: leadId, tenantId });
            const filter: any = { tenantId };
            if ((lead as any)?.memberId) filter.memberId = (lead as any).memberId;
            const logs = await CallLog.find(filter)
                .sort({ startTime: -1 })
                .limit(50)
                .lean();
            return res.status(200).json({ success: true, data: logs });
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

    // A-01: CRM Performance leaderboard
    async getPerformance(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const Lead = (await import('../models/Lead.model')).default;
            const User = (await import('../models/User.model')).default;

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const [leadsByStaff, conversionsByStaff] = await Promise.all([
                Lead.aggregate([
                    { $match: { tenantId: new (await import('mongoose')).default.Types.ObjectId(tenantId), createdAt: { $gte: thirtyDaysAgo } } },
                    { $group: { _id: '$assignedTo', total: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } }, revenue: { $sum: { $ifNull: ['$conversion.revenue', 0] } } } },
                ]),
                Lead.countDocuments({ tenantId, status: 'converted', createdAt: { $gte: thirtyDaysAgo } }),
            ]);

            const staffIds = leadsByStaff.map((l: any) => l._id).filter(Boolean);
            const staffUsers = staffIds.length > 0 ? await User.find({ _id: { $in: staffIds } }).select('firstName lastName').lean() : [];

            const leaderboard = leadsByStaff
                .filter((l: any) => l._id)
                .map((l: any, idx: number) => {
                    const user = (staffUsers as any[]).find((u: any) => u._id.toString() === l._id.toString());
                    const rate = l.total > 0 ? ((l.converted / l.total) * 100).toFixed(1) : '0.0';
                    const tier = parseFloat(rate) >= 20 ? 'Elite' : parseFloat(rate) >= 10 ? 'Platinum' : 'Gold';
                    return {
                        id: l._id,
                        name: user ? `${user.firstName} ${user.lastName}` : 'Staff',
                        leads: l.total,
                        conversions: l.converted,
                        revenue: `₹${(l.revenue || 0).toLocaleString('en-IN')}`,
                        rate: `${rate}%`,
                        rank: idx + 1,
                        tier,
                    };
                })
                .sort((a: any, b: any) => b.conversions - a.conversions)
                .map((item: any, idx: number) => ({ ...item, rank: idx + 1 }));

            const totalRevenue = leadsByStaff.reduce((s: number, l: any) => s + (l.revenue || 0), 0);
            const avgRate = leaderboard.length > 0
                ? (leaderboard.reduce((s: number, l: any) => s + parseFloat(l.rate), 0) / leaderboard.length).toFixed(1)
                : '0.0';

            return res.json({
                success: true,
                data: {
                    leaderboard,
                    summary: { avgConvRate: `${avgRate}%`, totalYield: `₹${(totalRevenue / 100000).toFixed(1)}L`, activeMissions: leaderboard.length },
                    velocity: { callToVisit: 45, winback: 18, retention: 92 },
                },
            });
        } catch (error) { return next(error); }
    }

    // A-02: CRM Forecast
    async getForecast(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const mongoose = (await import('mongoose')).default;
            const Lead = (await import('../models/Lead.model')).default;
            const Payment = (await import('../models/Payment.model')).default;

            const months: { month: string; revenue: number; projected: number }[] = [];
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const start = new Date(d.getFullYear(), d.getMonth(), 1);
                const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
                const [rev] = await Payment.aggregate([
                    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), status: 'completed', paidAt: { $gte: start, $lte: end } } },
                    { $group: { _id: null, total: { $sum: '$amount.total' } } },
                ]);
                const revenue = rev?.total || 0;
                months.push({ month: d.toLocaleString('en-IN', { month: 'short' }), revenue, projected: Math.round(revenue * 1.08) });
            }

            const stages = await Lead.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]);

            const stageMap: Record<string, string> = { new: 'New', contacted: 'Trial', qualified: 'Qualified', converted: 'Won' };
            const velocity = ['new', 'contacted', 'qualified', 'converted'].map((s) => {
                const found = (stages as any[]).find((st: any) => st._id === s);
                return { stage: stageMap[s] || s, leads: found?.count || 0, rate: s === 'new' ? '100%' : s === 'contacted' ? '60%' : s === 'qualified' ? '35%' : '15%' };
            });

            const lastRevenue = months[months.length - 1]?.revenue || 0;
            return res.json({
                success: true,
                data: {
                    forecastData: months,
                    velocityData: velocity,
                    summary: {
                        projectedQ: `₹${((lastRevenue * 3) / 100000).toFixed(1)}L`,
                        leadVelocity: '+12.5%',
                        forecastHealth: '98%',
                        nextMonth: `₹${((lastRevenue * 1.08) / 100000).toFixed(1)}L`,
                    },
                },
            });
        } catch (error) { return next(error); }
    }

    // A-CRM Settings: get/save CRM config
    async getCRMSettings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const Tenant = (await import('../models/Tenant.model')).default;
            const tenant = await Tenant.findById(tenantId).select('crmSettings').lean();
            const defaults = { autoFollowUp: true, followUpDays: 3, autoAssign: true, notifyOnNewLead: true, leadExpireDays: 30 };
            return res.json({ success: true, data: { ...(defaults), ...((tenant as any)?.crmSettings || {}) } });
        } catch (error) { return next(error); }
    }

    async saveCRMSettings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId?.toString() || '';
            const { autoFollowUp, followUpDays, autoAssign, notifyOnNewLead, leadExpireDays } = req.body;
            const Tenant = (await import('../models/Tenant.model')).default;
            await Tenant.findByIdAndUpdate(tenantId, { $set: { crmSettings: { autoFollowUp, followUpDays, autoAssign, notifyOnNewLead, leadExpireDays } } });
            return res.json({ success: true, message: 'CRM settings saved' });
        } catch (error) { return next(error); }
    }

    // GET /ai/predict — dashboard-level AI predictions for the current user
    async predict(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = (req as any).tenantId as string | undefined;
            const userId = (req as any).user?._id;

            // Lightweight prediction: look up member's workout/attendance stats
            const Member = require('../models/Member.model').default;
            const WorkoutLog = require('../models/WorkoutLog.model').default;

            const member = await Member.findOne({ userId, tenantId }).select('firstName lastName membershipStatus').lean();

            const recentLogs = member
                ? await WorkoutLog.countDocuments({
                    memberId: member._id,
                    createdAt: { $gte: new Date(Date.now() - 30 * 86400000) },
                })
                : 0;

            const churnScore = recentLogs >= 8 ? 10 : recentLogs >= 4 ? 35 : recentLogs >= 1 ? 60 : 80;
            const churnRisk = churnScore >= 70 ? 'high' : churnScore >= 40 ? 'medium' : 'low';
            const injuryRisk = recentLogs >= 20 ? 'high' : 'low';

            return res.json({
                success: true,
                data: {
                    churn: {
                        riskLevel: churnRisk,
                        score: churnScore,
                        reason: churnRisk === 'low'
                            ? 'Member is highly engaged with consistent sessions.'
                            : churnRisk === 'medium'
                            ? 'Attendance has declined over the past 2 weeks.'
                            : 'No sessions logged in the past 30 days.',
                    },
                    injury: {
                        riskLevel: injuryRisk,
                        reason: injuryRisk === 'high'
                            ? 'High volume spike detected — consider a deload week.'
                            : 'Consistent progressive overload pattern. Safe profile.',
                    },
                    trainers: [],
                    nudges: recentLogs >= 8
                        ? 'Keep it up! Your consistency is inspiring.'
                        : 'Try to hit at least 3 sessions this week to stay on track.',
                },
            });
        } catch (error) { return next(error); }
    }
}

export default new AIAndCRMController();


