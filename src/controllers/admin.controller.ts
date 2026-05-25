import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tenant from '../models/Tenant.model';
import AuditLog from '../models/AuditLog.model';
import Payment from '../models/Payment.model';
import User from '../models/User.model';
import Member from '../models/Member.model';
import AdminWhatsAppLog from '../models/AdminWhatsAppLog.model';
import SaaSTicket from '../models/SaaSTicket.model';
import { generateAccessToken } from '../utils/jwt.utils';

// All routes in this controller require super_admin — no tenantId check needed.

export class AdminController {

    // ─── GYM LIST ────────────────────────────────────────────────────────────

    // GET /gyms
    async getGyms(req: Request, res: Response): Promise<void> {
        try {
            const page   = parseInt((req.query.page   as string) || '1',  10);
            const limit  = parseInt((req.query.limit  as string) || '20', 10);
            const skip   = (page - 1) * limit;
            const search = (req.query.search as string) || '';

            const filter: Record<string, any> = {};
            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { slug: { $regex: search, $options: 'i' } },
                    { 'contactInfo.email': { $regex: search, $options: 'i' } },
                ];
            }

            const [gyms, total] = await Promise.all([
                Tenant.find(filter)
                    .select('-integrations -securitySettings')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit),
                Tenant.countDocuments(filter),
            ]);

            res.status(200).json({
                success: true,
                data:       gyms,
                pagination: { total, page, limit, pages: Math.ceil(total / limit) },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch gyms' });
        }
    }

    // GET /gyms/:gymId
    async getGym(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const gym = await Tenant.findById(gymId).select('-integrations.razorpayKeySecret -integrations.stripeKeySecret');

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            // Fetch owner user info + member count + recent payments in parallel
            const [owner, memberCount, recentPayments] = await Promise.all([
                User.findOne({ tenantId: gymId, role: 'gym_owner' }).select('firstName lastName email mobile lastLoginAt').lean(),
                Member.countDocuments({ tenantId: gymId }),
                Payment.find({ tenantId: new mongoose.Types.ObjectId(gymId), status: 'completed' })
                    .sort({ createdAt: -1 })
                    .limit(5)
                    .lean(),
            ]);

            // Build owner snapshot — prefer stored fields, fall back to live User doc
            const gymObj = gym.toObject() as any;
            const ownerName  = gymObj.ownerName  || (owner ? `${owner.firstName} ${owner.lastName}`.trim() : null);
            const ownerEmail = gymObj.ownerEmail  || owner?.email || null;
            const ownerMobile = gymObj.ownerMobile || (owner as any)?.mobile || null;
            const lastLoginAt = (owner as any)?.lastLoginAt || null;

            // Map recentPayments → invoices shape the drawer expects
            const invoices = recentPayments.map((p: any) => ({
                _id:       p._id,
                invoiceNo: p.invoiceNumber || `INV-${p._id.toString().slice(-6).toUpperCase()}`,
                total:     p.amount?.total ?? p.amount ?? 0,
                status:    p.status === 'completed' ? 'paid' : p.status,
                createdAt: p.createdAt,
            }));

            // trialEndsAt — stored field or fall back to subscription.endDate
            const trialEndsAt = gymObj.trialEndsAt || gymObj.subscription?.endDate || null;

            const tenant = {
                ...gymObj,
                ownerName,
                ownerEmail,
                ownerMobile,
                lastLoginAt,
                trialEndsAt,
            };

            res.status(200).json({
                success: true,
                data: {
                    tenant,
                    memberCount,
                    invoices,
                    subscriptionHistory: [],
                },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch gym' });
        }
    }

    // PUT /gyms/:gymId
    async updateGym(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const updateData = { ...req.body };
            // Prevent overwriting protected fields via body
            delete updateData._id;

            const gym = await Tenant.findByIdAndUpdate(
                gymId,
                { $set: updateData },
                { new: true, runValidators: true }
            );

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            res.status(200).json({ success: true, message: 'Gym updated successfully', data: gym });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to update gym' });
        }
    }

    // ─── SUBSCRIPTION MANAGEMENT ─────────────────────────────────────────────

    // POST /gyms/:gymId/suspend
    async suspendGym(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;
            const { reason } = req.body;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const gym = await Tenant.findByIdAndUpdate(
                gymId,
                {
                    $set: {
                        'subscription.status': 'suspended',
                        lockState:             'hard',
                        ...(reason ? { suspensionReason: reason } : {}),
                    },
                },
                { new: true }
            );

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            res.status(200).json({ success: true, message: 'Gym suspended successfully', data: gym });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to suspend gym' });
        }
    }

    // POST /gyms/:gymId/reactivate
    async reactivateGym(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const gym = await Tenant.findByIdAndUpdate(
                gymId,
                {
                    $set: {
                        'subscription.status': 'active',
                        lockState:             'none',
                    },
                },
                { new: true }
            );

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            res.status(200).json({ success: true, message: 'Gym reactivated successfully', data: gym });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to reactivate gym' });
        }
    }

    // POST /gyms/:gymId/extend-trial
    async extendTrial(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;
            const days      = parseInt(req.body.days, 10);

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            if (!days || days < 1) {
                res.status(400).json({ success: false, message: 'A positive number of days is required' });
                return;
            }

            const gym = await Tenant.findById(gymId);
            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            const currentEnd = gym.subscription.endDate
                ? new Date(gym.subscription.endDate)
                : new Date();

            currentEnd.setDate(currentEnd.getDate() + days);
            gym.subscription.endDate = currentEnd;
            await gym.save();

            res.status(200).json({
                success: true,
                message: `Trial extended by ${days} day(s)`,
                data:    { newEndDate: currentEnd },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to extend trial' });
        }
    }

    // POST /gyms/:gymId/change-plan
    async changePlan(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;
            const { plan, customPrice, billingCycle, discountType, discountValue, reason } = req.body;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            if (!plan) {
                res.status(400).json({ success: false, message: 'Plan is required' });
                return;
            }

            // Compute next renewal date from billing cycle
            const cycleMonths: Record<string, number> = {
                monthly: 1, quarterly: 3, semi_annual: 6, yearly: 12, lifetime: 1200,
            };
            const months = cycleMonths[billingCycle || 'monthly'] ?? 1;
            const nextRenewalDate = new Date();
            nextRenewalDate.setMonth(nextRenewalDate.getMonth() + months);

            const updateFields: Record<string, any> = {
                'subscription.plan':   plan,
                'subscription.status': 'active',
                'subscription.startDate': new Date(),
                'subscription.endDate': nextRenewalDate,
                nextRenewalDate,
                lockState: 'none',
            };
            if (customPrice  !== undefined) updateFields.customPrice   = customPrice;
            if (billingCycle !== undefined) updateFields.billingCycle  = billingCycle;
            if (discountType !== undefined) updateFields.discountType  = discountType;
            if (discountValue !== undefined) updateFields.discountValue = discountValue;

            const gym = await Tenant.findByIdAndUpdate(
                gymId,
                { $set: updateFields },
                { new: true, runValidators: true }
            );

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            // Log audit + create SaaS alert for gym owner
            const description = `Plan changed to ${plan}${customPrice != null ? ` at ₹${customPrice}/${billingCycle || 'monthly'}` : ''}${reason ? `. Reason: ${reason}` : ''}`;
            await AuditLog.create({
                tenantId:   new mongoose.Types.ObjectId(gymId),
                userId:     (req as any).user?._id,
                action:     'other',
                resource:   'Tenant',
                resourceId: new mongoose.Types.ObjectId(gymId),
                severity:   'info',
                description,
                metadata: { ipAddress: req.ip || '', userAgent: req.headers['user-agent'] || '', method: req.method, endpoint: req.originalUrl, statusCode: 200 },
            }).catch(() => {});

            // Notify the gym owner via SaaSAlert
            try {
                const SaaSAlert = (await import('../models/SaaSAlert.model')).default;
                await SaaSAlert.create({
                    tenantId: new mongoose.Types.ObjectId(gymId),
                    type:     'plan_changed',
                    title:    'Subscription Plan Updated',
                    message:  description,
                    isRead:   false,
                });
            } catch { /* SaaSAlert optional */ }

            res.status(200).json({
                success: true,
                message: `Plan changed to ${plan}`,
                data:    gym,
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to change plan' });
        }
    }

    // POST /gyms/:gymId/convert-trial
    async convertTrial(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;
            const { plan = 'basic', customPrice, billingCycle = 'monthly' } = req.body;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const updateFields: Record<string, any> = {
                'subscription.plan':   plan,
                'subscription.status': 'active',
                lockState:             'none',
                billingCycle,
            };
            if (customPrice !== undefined) updateFields.customPrice = customPrice;

            const gym = await Tenant.findByIdAndUpdate(gymId, { $set: updateFields }, { new: true });

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            res.status(200).json({ success: true, message: `Trial converted to ${plan} plan`, data: gym });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to convert trial' });
        }
    }

    // POST /gyms/:gymId/pause-trial
    async pauseTrial(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const gym = await Tenant.findByIdAndUpdate(
                gymId,
                { $set: { lockState: 'soft' } },
                { new: true }
            );

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            res.status(200).json({ success: true, message: 'Trial paused (soft lock)', data: gym });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to pause trial' });
        }
    }

    // POST /gyms/:gymId/restart-trial
    async restartTrial(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const now    = new Date();
            const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

            const gym = await Tenant.findByIdAndUpdate(
                gymId,
                {
                    $set: {
                        'subscription.startDate': now,
                        'subscription.endDate':   endDate,
                        'subscription.status':    'active',
                        lockState:                'none',
                    },
                },
                { new: true }
            );

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Trial restarted (30 days from today)',
                data:    { startDate: now, endDate },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to restart trial' });
        }
    }

    // POST /gyms/:gymId/reduce-trial
    async reduceTrial(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;
            const days      = parseInt(req.body.days, 10);

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            if (!days || days < 1) {
                res.status(400).json({ success: false, message: 'A positive number of days is required' });
                return;
            }

            const gym = await Tenant.findById(gymId);
            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            const currentEnd = gym.subscription.endDate
                ? new Date(gym.subscription.endDate)
                : new Date();

            currentEnd.setDate(currentEnd.getDate() - days);
            gym.subscription.endDate = currentEnd;
            await gym.save();

            res.status(200).json({
                success: true,
                message: `Trial reduced by ${days} day(s)`,
                data:    { newEndDate: currentEnd },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to reduce trial' });
        }
    }

    // POST /gyms/:gymId/set-renewal-date
    async setRenewalDate(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;
            const { date }  = req.body;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            if (!date) {
                res.status(400).json({ success: false, message: 'Renewal date is required' });
                return;
            }

            const renewalDate = new Date(date);
            if (isNaN(renewalDate.getTime())) {
                res.status(400).json({ success: false, message: 'Invalid date format' });
                return;
            }

            const gym = await Tenant.findByIdAndUpdate(
                gymId,
                { $set: { 'subscription.endDate': renewalDate } },
                { new: true }
            );

            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Renewal date updated',
                data:    { renewalDate },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to set renewal date' });
        }
    }

    // ─── NOTES / AUDIT ────────────────────────────────────────────────────────

    // POST /gyms/:gymId/add-note
    async addNote(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;
            const { note, text } = req.body;
            const noteText = note || text;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            if (!noteText) {
                res.status(400).json({ success: false, message: 'Note content is required' });
                return;
            }

            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const addedBy = `${req.user.firstName} ${req.user.lastName}`.trim() || 'Admin';

            // Push note onto Tenant.notes array
            await Tenant.findByIdAndUpdate(gymId, {
                $push: {
                    notes: { text: noteText, addedBy, addedAt: new Date() },
                },
            });

            res.status(201).json({ success: true, message: 'Note added successfully', data: { text: noteText, addedBy, addedAt: new Date() } });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to add note' });
        }
    }

    // GET /gyms/:gymId/audit-history
    async getAuditHistory(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const page  = parseInt((req.query.page  as string) || '1',  10);
            const limit = parseInt((req.query.limit as string) || '20', 10);
            const skip  = (page - 1) * limit;

            const [logs, total] = await Promise.all([
                AuditLog.find({ tenantId: gymId })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .populate('userId', 'firstName lastName email role'),
                AuditLog.countDocuments({ tenantId: gymId }),
            ]);

            res.status(200).json({
                success: true,
                data:       logs,
                pagination: { total, page, limit, pages: Math.ceil(total / limit) },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch audit history' });
        }
    }

    // POST /gyms/:gymId/generate-invoice (stub)
    async generateInvoice(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Invoice generation queued. PDF will be emailed to the gym owner shortly.',
                data:    { gymId, generatedAt: new Date() },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to generate invoice' });
        }
    }

    // ─── IMPERSONATION ────────────────────────────────────────────────────────

    // POST /impersonate
    async impersonateGym(req: Request, res: Response): Promise<void> {
        try {
            const { gymId } = req.body;

            if (!gymId || !mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Valid gymId is required' });
                return;
            }

            // Find the gym_owner user for this tenant
            const owner = await User.findOne({ tenantId: gymId, role: 'gym_owner', isActive: true });

            if (!owner) {
                res.status(404).json({ success: false, message: 'No active gym_owner found for this gym' });
                return;
            }

            const token = generateAccessToken({
                userId:   owner._id.toString(),
                role:     owner.role,
                tenantId: gymId,
                branchId: owner.branchId?.toString(),
            });

            res.status(200).json({
                success: true,
                message: 'Impersonation token generated',
                data: {
                    token,
                    user: {
                        _id:       owner._id,
                        firstName: owner.firstName,
                        lastName:  owner.lastName,
                        email:     owner.email,
                        role:      owner.role,
                        tenantId:  gymId,
                    },
                },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to generate impersonation token' });
        }
    }

    // ─── PLATFORM REVENUE ────────────────────────────────────────────────────

    // GET /revenue
    async getPlatformRevenue(req: Request, res: Response): Promise<void> {
        try {
            const { year } = req.query;

            const matchStage: Record<string, any> = { status: 'completed' };
            if (year) {
                const y        = parseInt(year as string, 10);
                matchStage.paidAt = {
                    $gte: new Date(`${y}-01-01`),
                    $lte: new Date(`${y}-12-31T23:59:59`),
                };
            }

            const revenue = await Payment.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: {
                            tenantId: '$tenantId',
                            year:  { $year:  '$paidAt' },
                            month: { $month: '$paidAt' },
                        },
                        total:    { $sum: '$amount.total' },
                        subtotal: { $sum: '$amount.subtotal' },
                        tax:      { $sum: '$amount.taxAmount' },
                        count:    { $sum: 1 },
                    },
                },
                {
                    $group: {
                        _id:   { year: '$_id.year', month: '$_id.month' },
                        total:    { $sum: '$total' },
                        subtotal: { $sum: '$subtotal' },
                        tax:      { $sum: '$tax' },
                        count:    { $sum: '$count' },
                        gyms:     { $sum: 1 },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
                {
                    $project: {
                        _id:      0,
                        year:     '$_id.year',
                        month:    '$_id.month',
                        total:    1,
                        subtotal: 1,
                        tax:      1,
                        count:    1,
                        gyms:     1,
                    },
                },
            ]);

            const grandTotal = revenue.reduce((acc: number, r: any) => acc + r.total, 0);

            res.status(200).json({
                success: true,
                data:    { monthly: revenue, grandTotal },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch platform revenue' });
        }
    }

    // ─── WHATSAPP LOGS ───────────────────────────────────────────────────────

    // POST /gyms/:gymId/log-whatsapp
    async logWhatsApp(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;
            // Accept both new shape { templateType, variables, customMessage } and legacy { message, type }
            const { templateType, variables = {}, customMessage, message: legacyMessage, type: legacyType } = req.body;
            const resolvedType = templateType || legacyType || 'custom';

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const gym = await Tenant.findById(gymId).select('name contactInfo ownerName ownerMobile');
            if (!gym) {
                res.status(404).json({ success: false, message: 'Gym not found' });
                return;
            }

            const owner = await User.findOne({ tenantId: gymId, role: 'gym_owner' }).select('firstName lastName mobile');
            const gymObj  = gym.toObject() as any;
            const ownerName  = gymObj.ownerName || (owner ? `${owner.firstName} ${owner.lastName}`.trim() : gym.name);
            const ownerPhone = gymObj.ownerMobile || (owner as any)?.mobile || gym.contactInfo?.phone || '';

            // Build message text — substitute {{vars}} in templates
            const TEMPLATES: Record<string, string> = {
                welcome:              `Hello {{ownerName}}, Welcome to GymBodyFlow! Your gym *{{gymName}}* is now active. Login: https://app.gymbodyflow.com/dashboard`,
                trial_ending:         `Hi {{ownerName}}, your FREE trial for *{{gymName}}* ends soon. Upgrade now to keep access.`,
                trial_expired:        `Hi {{ownerName}}, your trial for *{{gymName}}* has expired. Upgrade to restore full access.`,
                upgrade_offer:        `Hi {{ownerName}}, special upgrade offer for *{{gymName}}*! Reply to know more.`,
                plan_activated:       `Hello {{ownerName}}, your *{{gymName}}* plan is now active. Thank you!`,
                renewal_reminder:     `Hi {{ownerName}}, reminder: *{{gymName}}* plan renewal is coming up. Please ensure timely payment.`,
                payment_reminder:     `Hi {{ownerName}}, payment due for *{{gymName}}*. Please complete to avoid service interruption.`,
                payment_received:     `Hi {{ownerName}}, payment received for *{{gymName}}*. Your subscription is active!`,
                feature_announcement: `Hi {{ownerName}}, exciting new features are live on your *{{gymName}}* dashboard!`,
                support_followup:     `Hi {{ownerName}}, following up on your *{{gymName}}* support request. Has your issue been resolved?`,
                discount_offer:       `Hi {{ownerName}}, exclusive discount available for *{{gymName}}*! Reply to avail.`,
                festival_offer:       `Hi {{ownerName}}, festival special offer for *{{gymName}}*!`,
                custom:               `{{customMessage}}`,
            };

            const template = TEMPLATES[resolvedType] ?? TEMPLATES.custom;
            const allVars: Record<string, string> = {
                ownerName,
                gymName: gym.name,
                customMessage: customMessage || legacyMessage || '',
                ...variables,
            };
            const resolvedMessage = template.replace(/\{\{(\w+)\}\}/g, (_: string, key: string) => allVars[key] ?? `{{${key}}}`);

            // Build wa.me deep link
            const cleaned = ownerPhone.replace(/\D/g, '');
            const e164 = cleaned ? (cleaned.startsWith('91') ? cleaned : `91${cleaned}`) : '';
            const deepLink = e164
                ? `https://wa.me/${e164}?text=${encodeURIComponent(resolvedMessage)}`
                : `https://wa.me/?text=${encodeURIComponent(resolvedMessage)}`;

            const log = await AdminWhatsAppLog.create({
                tenantId:     new mongoose.Types.ObjectId(gymId),
                gymName:      gym.name,
                ownerName,
                phone:        ownerPhone,
                templateType: resolvedType,
                message:      resolvedMessage,
                sentBy:       `${req.user.firstName} ${req.user.lastName}`,
                sentByRole:   req.user.role,
                status:       'sent',
                deepLink,
            });

            res.status(201).json({ success: true, message: 'WhatsApp log created', data: log, deepLink });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to log WhatsApp message' });
        }
    }

    // GET /gyms/:gymId/whatsapp-history
    async getWhatsAppHistory(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const page  = parseInt((req.query.page  as string) || '1',  10);
            const limit = parseInt((req.query.limit as string) || '20', 10);
            const skip  = (page - 1) * limit;

            const [logs, total] = await Promise.all([
                AdminWhatsAppLog.find({ tenantId: gymId })
                    .sort({ sentAt: -1 })
                    .skip(skip)
                    .limit(limit),
                AdminWhatsAppLog.countDocuments({ tenantId: gymId }),
            ]);

            res.status(200).json({
                success: true,
                data:       logs,
                pagination: { total, page, limit, pages: Math.ceil(total / limit) },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch WhatsApp history' });
        }
    }

    // ─── TICKETS ─────────────────────────────────────────────────────────────

    // GET /gyms/:gymId/tickets
    async getGymTickets(req: Request, res: Response): Promise<void> {
        try {
            const gymId = req.params.gymId as string;

            if (!mongoose.Types.ObjectId.isValid(gymId)) {
                res.status(400).json({ success: false, message: 'Invalid gym ID' });
                return;
            }

            const page   = parseInt((req.query.page   as string) || '1',  10);
            const limit  = parseInt((req.query.limit  as string) || '20', 10);
            const skip   = (page - 1) * limit;
            const status = req.query.status as string | undefined;

            const filter: Record<string, any> = { tenantId: gymId };
            if (status) filter.status = status;

            const [tickets, total] = await Promise.all([
                SaaSTicket.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit),
                SaaSTicket.countDocuments(filter),
            ]);

            res.status(200).json({
                success: true,
                data:       tickets,
                pagination: { total, page, limit, pages: Math.ceil(total / limit) },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch gym tickets' });
        }
    }
}

export default new AdminController();
