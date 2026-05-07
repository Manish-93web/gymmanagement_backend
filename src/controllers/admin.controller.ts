import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant.model';
import User from '../models/User.model';
import Payment from '../models/Payment.model';
import Member from '../models/Member.model';
import AuditLog from '../models/AuditLog.model';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import mongoose from 'mongoose';

export class AdminController {
    async getGyms(req: Request, res: Response, next: NextFunction) {
        try {
            const { status, page = 1, limit = 20, search } = req.query;
            const query: any = {};
            if (status) query.isActive = status === 'active';
            if (search) query.name = { $regex: search, $options: 'i' };
            const skip = (Number(page) - 1) * Number(limit);
            const [tenants, total] = await Promise.all([
                Tenant.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('owner', 'firstName lastName email mobile'),
                Tenant.countDocuments(query)
            ]);
            const gymsWithStats = await Promise.all(tenants.map(async (tenant) => {
                const memberCount = await Member.countDocuments({ tenantId: tenant._id, status: 'active' });
                return { ...tenant.toObject(), memberCount };
            }));
            return res.json({ success: true, data: { gyms: gymsWithStats, total, page: Number(page) } });
        } catch (error) { return next(error); }
    }

    async getGym(req: Request, res: Response, next: NextFunction) {
        try {
            const tenant = await Tenant.findById(req.params.gymId as string).populate('owner', 'firstName lastName email mobile');
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            const [memberCount, totalPayments] = await Promise.all([
                Member.countDocuments({ tenantId: tenant._id }),
                Payment.aggregate([
                    { $match: { tenantId: new mongoose.Types.ObjectId(req.params.gymId as string), status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount.total' } } }
                ])
            ]);
            return res.json({ success: true, data: { ...tenant.toObject(), memberCount, totalRevenue: totalPayments[0]?.total || 0 } });
        } catch (error) { return next(error); }
    }

    async updateGym(req: Request, res: Response, next: NextFunction) {
        try {
            const tenant = await Tenant.findByIdAndUpdate(req.params.gymId as string, req.body, { new: true });
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            return res.json({ success: true, data: tenant });
        } catch (error) { return next(error); }
    }

    async suspendGym(req: Request, res: Response, next: NextFunction) {
        try {
            const { reason } = req.body;
            const tenant = await Tenant.findByIdAndUpdate(
                req.params.gymId as string,
                { isActive: false, suspendedAt: new Date(), suspensionReason: reason },
                { new: true }
            );
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            await (AuditLog as any).create({
                userId: req.user!._id,
                action: 'SUSPEND_GYM',
                resourceType: 'Tenant',
                resourceId: req.params.gymId as string,
                changes: { reason },
                ipAddress: req.ip,
                tenantId: req.user!.tenantId
            });
            return res.json({ success: true, message: 'Gym suspended', data: tenant });
        } catch (error) { return next(error); }
    }

    async reactivateGym(req: Request, res: Response, next: NextFunction) {
        try {
            const tenant = await Tenant.findByIdAndUpdate(
                req.params.gymId as string,
                { isActive: true, $unset: { suspendedAt: 1, suspensionReason: 1 } },
                { new: true }
            );
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            return res.json({ success: true, message: 'Gym reactivated', data: tenant });
        } catch (error) { return next(error); }
    }

    async extendTrial(req: Request, res: Response, next: NextFunction) {
        try {
            const { days } = req.body;
            if (!days) return res.status(400).json({ success: false, message: 'days is required' });
            const tenant = await Tenant.findById(req.params.gymId as string);
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            const currentExpiry = (tenant as any).trialEndsAt || new Date();
            const newExpiry = new Date(currentExpiry.getTime() + days * 24 * 60 * 60 * 1000);
            await Tenant.findByIdAndUpdate(req.params.gymId as string, { trialEndsAt: newExpiry });
            return res.json({ success: true, message: `Trial extended by ${days} days`, data: { newExpiry } });
        } catch (error) { return next(error); }
    }

    async changePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const { plan } = req.body;
            const tenant = await Tenant.findByIdAndUpdate(
                req.params.gymId as string,
                { 'subscription.plan': plan, 'subscription.updatedAt': new Date() },
                { new: true }
            );
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            return res.json({ success: true, data: tenant });
        } catch (error) { return next(error); }
    }

    async addNote(req: Request, res: Response, next: NextFunction) {
        try {
            const { note } = req.body;
            const tenant = await Tenant.findByIdAndUpdate(
                req.params.gymId as string,
                { $push: { adminNotes: { note, addedBy: req.user!._id, addedAt: new Date() } } },
                { new: true }
            );
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            return res.json({ success: true, data: tenant });
        } catch (error) { return next(error); }
    }

    async generateInvoice(req: Request, res: Response, next: NextFunction) {
        try {
            const tenant = await Tenant.findById(req.params.gymId as string);
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            const invoice = {
                invoiceNumber: `INV-${Date.now()}`,
                tenantId: req.params.gymId as string,
                tenantName: tenant.name,
                generatedAt: new Date(),
                amount: req.body.amount || 0,
                plan: (tenant as any).subscription?.plan || 'basic'
            };
            return res.json({ success: true, data: invoice });
        } catch (error) { return next(error); }
    }

    async getAuditHistory(req: Request, res: Response, next: NextFunction) {
        try {
            const logs = await AuditLog.find({ resourceId: req.params.gymId as string })
                .populate('userId', 'firstName lastName')
                .sort({ createdAt: -1 })
                .limit(100);
            return res.json({ success: true, data: logs });
        } catch (error) { return next(error); }
    }

    async impersonateGym(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.body;
            const tenant = await Tenant.findById(gymId);
            if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
            const owner = await User.findOne({ tenantId: gymId, role: 'gym_owner' });
            if (!owner) return res.status(404).json({ success: false, message: 'Gym owner not found' });
            const impersonationToken = jwt.sign(
                { userId: owner._id, impersonatedBy: req.user!._id, tenantId: gymId },
                config.jwt.secret,
                { expiresIn: '2h' }
            );
            await (AuditLog as any).create({
                userId: req.user!._id,
                action: 'IMPERSONATE_GYM',
                resourceType: 'Tenant',
                resourceId: gymId,
                ipAddress: req.ip,
                tenantId: req.user!.tenantId
            });
            return res.json({
                success: true,
                data: {
                    impersonationToken,
                    gymOwner: { firstName: owner.firstName, lastName: owner.lastName, email: owner.email }
                }
            });
        } catch (error) { return next(error); }
    }

    async getPlatformRevenue(req: Request, res: Response, next: NextFunction) {
        try {
            const { period = 'month' } = req.query;
            const now = new Date();
            let startDate = new Date();
            if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            else if (period === 'quarter') startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            else if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);
            const revenue = await Payment.aggregate([
                { $match: { status: 'completed', createdAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$amount.total' }, count: { $sum: 1 } } }
            ]);
            const mrr = await Payment.aggregate([
                { $match: { status: 'completed', createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } }
            ]);
            const activeTenants = await Tenant.countDocuments({ isActive: true });
            return res.json({
                success: true,
                data: {
                    totalRevenue: revenue[0]?.total || 0,
                    transactionCount: revenue[0]?.count || 0,
                    mrr: mrr[0]?.total || 0,
                    arr: (mrr[0]?.total || 0) * 12,
                    activeTenants
                }
            });
        } catch (error) { return next(error); }
    }

    async convertTrial(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.params as Record<string, string>;
            const { planId, billingCycle } = req.body;
            const tenant = await Tenant.findByIdAndUpdate(gymId,
                { $set: { 'subscription.status': 'active', 'subscription.plan': planId || 'starter', 'subscription.billingCycle': billingCycle || 'monthly', trialEndsAt: null } },
                { new: true }
            );
            if (!tenant) { res.status(404).json({ success: false, message: 'Gym not found' }); return; }
            await (AuditLog as any).create({ tenantId: gymId, userId: req.user!._id, action: 'trial_converted', resourceType: 'Tenant', resourceId: gymId, details: { planId } });
            return res.json({ success: true, message: 'Trial converted to paid', data: tenant });
        } catch (error) { return next(error); }
    }

    async pauseTrial(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.params as Record<string, string>;
            const tenant = await Tenant.findByIdAndUpdate(gymId, { $set: { 'subscription.status': 'paused' } }, { new: true });
            if (!tenant) { res.status(404).json({ success: false, message: 'Gym not found' }); return; }
            await (AuditLog as any).create({ tenantId: gymId, userId: req.user!._id, action: 'trial_paused', resourceType: 'Tenant', resourceId: gymId });
            return res.json({ success: true, data: tenant });
        } catch (error) { return next(error); }
    }

    async restartTrial(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.params as Record<string, string>;
            const newTrialEnd = new Date();
            newTrialEnd.setDate(newTrialEnd.getDate() + 14);
            const tenant = await Tenant.findByIdAndUpdate(gymId,
                { $set: { 'subscription.status': 'trial', trialEndsAt: newTrialEnd } },
                { new: true }
            );
            if (!tenant) { res.status(404).json({ success: false, message: 'Gym not found' }); return; }
            await (AuditLog as any).create({ tenantId: gymId, userId: req.user!._id, action: 'trial_restarted', resourceType: 'Tenant', resourceId: gymId });
            return res.json({ success: true, data: tenant });
        } catch (error) { return next(error); }
    }

    async reduceTrial(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.params as Record<string, string>;
            const { days } = req.body;
            const tenant = await Tenant.findById(gymId);
            if (!tenant) { res.status(404).json({ success: false, message: 'Gym not found' }); return; }
            const newDate = new Date((tenant as any).trialEndsAt || new Date());
            newDate.setDate(newDate.getDate() - (days || 7));
            await Tenant.findByIdAndUpdate(gymId, { trialEndsAt: newDate });
            await (AuditLog as any).create({ tenantId: gymId, userId: req.user!._id, action: 'trial_reduced', resourceType: 'Tenant', resourceId: gymId, details: { days } });
            return res.json({ success: true, message: `Trial reduced by ${days} days` });
        } catch (error) { return next(error); }
    }

    async setRenewalDate(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.params as Record<string, string>;
            const { renewalDate } = req.body;
            const tenant = await Tenant.findByIdAndUpdate(gymId, { 'subscription.renewalDate': new Date(renewalDate) }, { new: true });
            if (!tenant) { res.status(404).json({ success: false, message: 'Gym not found' }); return; }
            return res.json({ success: true, data: tenant });
        } catch (error) { return next(error); }
    }

    async logWhatsApp(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.params as Record<string, string>;
            const { message, creditsUsed = 1 } = req.body;
            await (AuditLog as any).create({ tenantId: gymId, userId: req.user!._id, action: 'whatsapp_sent', resourceType: 'Tenant', resourceId: gymId, details: { message, creditsUsed } });
            return res.json({ success: true, message: 'WhatsApp log recorded' });
        } catch (error) { return next(error); }
    }

    async getWhatsAppHistory(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.params as Record<string, string>;
            const logs = await (AuditLog as any).find({ tenantId: gymId, action: 'whatsapp_sent' }).sort({ createdAt: -1 }).limit(50);
            return res.json({ success: true, data: logs });
        } catch (error) { return next(error); }
    }

    async getGymTickets(req: Request, res: Response, next: NextFunction) {
        try {
            const { gymId } = req.params as Record<string, string>;
            const SupportTicket = require('../models/SupportTicket.model').default;
            const tickets = await SupportTicket.find({ tenantId: gymId }).sort({ createdAt: -1 }).limit(50);
            return res.json({ success: true, data: tickets });
        } catch (error) { return next(error); }
    }
}

export default new AdminController();


