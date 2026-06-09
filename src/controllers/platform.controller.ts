import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tenant from '../models/Tenant.model';
import User from '../models/User.model';
import Member from '../models/Member.model';
import Payment from '../models/Payment.model';
import Subscription from '../models/Subscription.model';
import systemConfigService from '../services/system-config.service';
import auditService from '../services/audit.service';
import backupService from '../services/backup.service';

/**
 * Get all tenants with aggregated stats
 */
export const getAllTenants = async (req: Request, res: Response) => {
    try {
        const page   = parseInt((req.query.page   as string) || '1',  10);
        const limit  = parseInt((req.query.limit  as string) || '20', 10);
        const skip   = (page - 1) * limit;
        const search = (req.query.search as string) || '';
        const status = (req.query.status as string) || '';

        const filter: Record<string, any> = {};
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } },
                { 'contactInfo.email': { $regex: search, $options: 'i' } },
            ];
        }
        if (status) filter['subscription.status'] = status;

        const [tenants, total] = await Promise.all([
            Tenant.find(filter)
                .select('name slug isActive subscription createdAt contactInfo saasPlanId customPrice billingCycle discountType discountValue ownerName ownerEmail ownerMobile')
                .populate('saasPlanId', 'name slug pricing')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Tenant.countDocuments(filter),
        ]);

        // Attach owner + member count in parallel batches
        const tenantStats = await Promise.all(
            tenants.map(async (tenant) => {
                const [memberCount, owner] = await Promise.all([
                    Member.countDocuments({ tenantId: tenant._id }),
                    User.findOne({ tenantId: tenant._id, role: 'gym_owner' }).select('firstName lastName email mobile').lean(),
                ]);
                const t = tenant.toObject() as any;
                return {
                    ...t,
                    stats: { totalMembers: memberCount },
                    owner,
                };
            })
        );

        return res.status(200).json({
            success: true,
            data: tenantStats,
            pagination: { total, page, limit, pages: Math.ceil(total / limit) },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching tenants',
            error: (error as Error).message,
        });
    }
};

/**
 * Update tenant status (Approve/Suspend)
 */
export const updateTenantStatus = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const { status, isActive } = req.body;

        const tenant = await Tenant.findByIdAndUpdate(
            tenantId,
            {
                isActive,
                'subscription.status': status,
            },
            { new: true }
        );

        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: 'Tenant not found',
            });
        }

        return res.status(200).json({
            success: true,
            data: tenant,
            message: 'Tenant status updated successfully',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error updating tenant status',
            error: (error as Error).message,
        });
    }
};

/**
 * General tenant update — handles status changes, plan assignment, and arbitrary field updates.
 * Called by frontend PlatformService.updateTenant() via PATCH /platform/tenants/:tenantId
 */
export const updateTenant = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const { action, planId, status, isActive, ...rest } = req.body;

        const updatePayload: Record<string, any> = { ...rest };

        if (status !== undefined)   updatePayload['subscription.status'] = status;
        if (isActive !== undefined) updatePayload.isActive = isActive;
        if (action === 'upgrade_plan' && planId) updatePayload.saasPlanId = planId;

        const tenant = await Tenant.findByIdAndUpdate(
            tenantId,
            { $set: updatePayload },
            { new: true }
        ).populate('saasPlanId', 'name slug pricing');

        if (!tenant) {
            return res.status(404).json({ success: false, message: 'Tenant not found' });
        }

        return res.status(200).json({ success: true, data: tenant, message: 'Tenant updated successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating tenant', error: (error as Error).message });
    }
};

/**
 * Get Platform-wide Metrics (Aggregation only)
 */
export const getPlatformMetrics = async (req: Request, res: Response) => {
    try {
        const totalTenants = await Tenant.countDocuments();
        const activeTenants = await Tenant.countDocuments({ isActive: true });
        const totalUsers = await User.countDocuments();

        // Calculate Total Platform Revenue (MRR) from Subscriptions
        const subscriptions = await Subscription.find({ status: 'active' });
        // @ts-ignore
        const mrr = subscriptions.reduce((acc: number, sub) => acc + (sub.pricing?.totalAmount || 0), 0);

        // Recent Signups (Last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSignups = await Tenant.countDocuments({
            createdAt: { $gte: thirtyDaysAgo },
        });

        return res.status(200).json({
            success: true,
            data: {
                totalTenants,
                activeTenants,
                totalUsers,
                mrr,
                recentSignups,
                churnRate: 0, // Placeholder/To be implemented
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching platform metrics',
            error: (error as Error).message,
        });
    }
};

/**
 * Get Platform Config
 */
export const getPlatformConfig = async (_req: Request, res: Response) => {
    try {
        const PlatformConfig = (await import('../models/PlatformConfig.model')).default;
        let config = await PlatformConfig.findOne().select('-integrations.razorpay.keySecret -integrations.stripe.secretKey -integrations.twilio.authToken -integrations.smtp.pass -integrations.openai.apiKey');
        if (!config) {
            config = await PlatformConfig.create({});
        }
        return res.status(200).json({ success: true, data: config });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching platform config', error: (error as Error).message });
    }
};

export const updatePlatformConfig = async (req: Request, res: Response) => {
    try {
        const PlatformConfig = (await import('../models/PlatformConfig.model')).default;
        const { section, data } = req.body;
        let updatePayload: any;
        if (section && data) {
            // Nested section update: { section: 'features', data: { maintenanceMode: true } }
            updatePayload = {};
            for (const [key, val] of Object.entries(data)) {
                updatePayload[`${section}.${key}`] = val;
            }
        } else {
            // Full or flat update
            updatePayload = req.body;
        }
        const config = await PlatformConfig.findOneAndUpdate(
            {},
            { $set: updatePayload },
            { new: true, upsert: true }
        ).select('-integrations.razorpay.keySecret -integrations.stripe.secretKey -integrations.twilio.authToken -integrations.smtp.pass -integrations.openai.apiKey');
        return res.status(200).json({ success: true, data: config, message: 'Platform configuration updated' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating platform config', error: (error as Error).message });
    }
};

/**
 * Get Audit Logs
 */
export const getPlatformAuditLogs = async (req: Request, res: Response) => {
    try {
        const logs = await auditService.getLogs(req.query as any);
        return res.status(200).json({ success: true, data: logs });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching audit logs', error: (error as Error).message });
    }
};

/**
 * List Backups
 */
export const listBackups = async (req: Request, res: Response) => {
    try {
        const backups = await backupService.listBackups();
        const stats = await backupService.getBackupStats();
        return res.status(200).json({ success: true, data: { backups, stats } });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error listing backups', error: (error as Error).message });
    }
};

/**
 * Trigger Backup
 */
export const triggerBackup = async (req: Request, res: Response) => {
    try {
        const backupFile = await backupService.performBackup();
        return res.status(200).json({ success: true, message: 'Backup completed', data: { backupFile } });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Backup failed', error: (error as Error).message });
    }
};

/**
 * List all super_admin users
 */
export const getAdmins = async (req: Request, res: Response) => {
    try {
        const admins = await User.find({ role: 'super_admin' })
            .select('firstName lastName email mobile createdAt lastLogin isActive')
            .sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: admins });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching admins', error: (error as Error).message });
    }
};

/**
 * Get all support tickets across all tenants
 */
export const getAllSupportTickets = async (req: Request, res: Response) => {
    try {
        const SupportTicket = (await import('../models/SupportTicket.model')).default;
        const { status, priority, page = '1', limit = '20' } = req.query as Record<string, string>;
        const filter: any = {};
        if (status) filter.status = status;
        if (priority) filter.priority = priority;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [tickets, total] = await Promise.all([
            SupportTicket.find(filter)
                .populate('userId', 'firstName lastName email')
                .populate('tenantId', 'name slug')
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            SupportTicket.countDocuments(filter),
        ]);
        const normalized = tickets.map(normalizeTicket);
        return res.status(200).json({ success: true, data: normalized, total, page: parseInt(page) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching tickets', error: (error as Error).message });
    }
};

/**
 * Get all subscription plans across the platform
 */
export const getPlatformPlans = async (req: Request, res: Response) => {
    try {
        const Plan = (await import('../models/SaaSPlan.model')).default;
        const plans = await Plan.find({ isActive: true }).sort({ 'pricing.monthly': 1 });
        return res.status(200).json({ success: true, data: plans });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching plans', error: (error as Error).message });
    }
};

/**
 * Normalize a member Payment doc to match the SaaSPayment shape expected by RevenueModule.
 */
const normalizeMemberPayment = (p: any) => ({
    _id: p._id,
    tenantId: p.tenantId,   // populated { name, slug }
    saasPlanId: { name: p.planId?.name || 'Member Fee', type: p.type || 'subscription' },
    type: p.type || 'subscription',
    amount: p.amount?.total ?? 0,
    currency: 'INR',
    status: p.status,
    gateway: {
        provider: p.method || 'manual',
        transactionId: p.gateway?.transactionId || p.invoiceNumber || String(p._id).slice(-10),
    },
    createdAt: p.createdAt,
});

/**
 * Get platform-wide payments.
 * Primary source: SaaSPayment (platform billing).
 * Fallback: gym member Payment records when no SaaS billing records exist.
 */
export const getPlatformPayments = async (req: Request, res: Response) => {
    try {
        const SaaSPayment = (await import('../models/SaaSPayment.model')).default;
        const { startDate, endDate, tenantId, status, page = '1', limit = '50' } = req.query as Record<string, string>;
        const filter: any = {};
        if (status) filter.status = status;
        if (tenantId) filter.tenantId = tenantId;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [saasPayments, saasTotal] = await Promise.all([
            SaaSPayment.find(filter)
                .populate('tenantId', 'name slug')
                .populate('saasPlanId', 'name type')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            SaaSPayment.countDocuments(filter),
        ]);

        // If SaaS payment records exist, return them directly
        if (saasTotal > 0) {
            return res.status(200).json({ success: true, data: { payments: saasPayments, total: saasTotal, page: parseInt(page) } });
        }

        // Fallback: gym member payment records normalized to match the SaaS payment shape
        const memberFilter: any = {};
        if (status) memberFilter.status = status;
        if (tenantId) memberFilter.tenantId = tenantId;
        if (startDate || endDate) {
            memberFilter.createdAt = {};
            if (startDate) memberFilter.createdAt.$gte = new Date(startDate);
            if (endDate) memberFilter.createdAt.$lte = new Date(endDate);
        }

        const [memberPayments, memberTotal] = await Promise.all([
            Payment.find(memberFilter)
                .populate('tenantId', 'name slug')
                .populate('planId', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Payment.countDocuments(memberFilter),
        ]);

        const payments = memberPayments.map(normalizeMemberPayment);
        return res.status(200).json({ success: true, data: { payments, total: memberTotal, page: parseInt(page) } });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching payments', error: (error as Error).message });
    }
};

/** View a specific tenant's members */
export const viewTenantMembers = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const { page = '1', limit = '20', status, search } = req.query as Record<string, string>;
        const filter: any = { tenantId };
        if (status) filter.status = status;
        if (search) filter.$or = [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { mobile: { $regex: search, $options: 'i' } }
        ];
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [members, total] = await Promise.all([
            Member.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            Member.countDocuments(filter)
        ]);
        return res.status(200).json({ success: true, data: { members, total } });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching members', error: (error as Error).message });
    }
};

/** View a specific tenant's attendance */
export const viewTenantAttendance = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const { startDate, endDate } = req.query as Record<string, string>;
        const Attendance = (await import('../models/Attendance.model')).default;
        const filter: any = { tenantId };
        if (startDate || endDate) {
            filter.checkInTime = {};
            if (startDate) filter.checkInTime.$gte = new Date(startDate);
            if (endDate) filter.checkInTime.$lte = new Date(endDate);
        }
        const records = await Attendance.find(filter)
            .populate('memberId', 'firstName lastName')
            .sort({ checkInTime: -1 }).limit(100);
        return res.status(200).json({ success: true, data: records });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching attendance', error: (error as Error).message });
    }
};

/** View a specific tenant's finance */
export const viewTenantFinance = async (req: Request, res: Response) => {
    try {
        const tenantId = req.params.tenantId as string;
        const Payment = (await import('../models/Payment.model')).default;
        const [payments, total] = await Promise.all([
            Payment.find({ tenantId, status: 'completed' })
                .populate('memberId', 'firstName lastName')
                .sort({ createdAt: -1 }).limit(50),
            Payment.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } }
            ])
        ]);
        return res.status(200).json({ success: true, data: { payments, totalRevenue: total[0]?.total || 0 } });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching finance data', error: (error as Error).message });
    }
};

/** Get a single tenant by ID */
export const getTenantById = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const tenant = await Tenant.findById(tenantId).select('-integrations.razorpayKeySecret -integrations.stripeKeySecret');
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
        const [memberCount, owner, totalRevenue] = await Promise.all([
            Member.countDocuments({ tenantId }),
            User.findOne({ tenantId, role: 'gym_owner' }).select('firstName lastName email mobile'),
            Payment.aggregate([
                { $match: { tenantId: tenant._id, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } },
            ]).then((r: any[]) => r[0]?.total ?? 0),
        ]);
        return res.status(200).json({
            success: true,
            data: {
                ...tenant.toObject(),
                owner,
                stats:   { totalMembers: memberCount },
                metrics: { memberCount, totalRevenue },
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching tenant', error: (error as Error).message });
    }
};

/** Create an impersonation session for a tenant */
export const createViewSession = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const tenant = await Tenant.findById(tenantId);
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
        const session = {
            gymId: tenantId,
            gymName: (tenant as any).name,
            gymSlug: (tenant as any).slug || '',
            sessionStartedAt: new Date().toISOString(),
            adminId: req.user!._id,
        };
        return res.status(200).json({ success: true, data: session });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error creating view session', error: (error as Error).message });
    }
};

/** End an impersonation session (audit log only) */
export const endViewSession = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        return res.status(200).json({ success: true, message: `View session for tenant ${tenantId} ended` });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error ending view session', error: (error as Error).message });
    }
};

/** Get / update platform branding config */
export const getPlatformBranding = async (req: Request, res: Response) => {
    try {
        const config = await systemConfigService.getConfig('branding') || { primaryColor: '#FF5F1F', logoUrl: '', appName: 'GYM.OS' };
        return res.status(200).json({ success: true, data: config });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching branding', error: (error as Error).message });
    }
};

export const updatePlatformBranding = async (req: Request, res: Response) => {
    try {
        await systemConfigService.updateConfig('platform', req.body);
        return res.status(200).json({ success: true, message: 'Branding updated' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating branding', error: (error as Error).message });
    }
};

/** Platform infrastructure health — consumed by OverviewModule every 30 s */
export const getPlatformHealth = async (_req: Request, res: Response) => {
    try {
        const mongoose = (await import('mongoose')).default;
        const { redis } = await import('../config/redis');
        const os = (await import('os')).default;

        // DB ping latency
        let dbStatus = 'disconnected';
        let dbLatencyMs = 0;
        try {
            const t0 = Date.now();
            await mongoose.connection.db?.command({ ping: 1 });
            dbLatencyMs = Date.now() - t0;
            dbStatus = 'connected';
        } catch {
            dbStatus = 'disconnected';
        }

        // Redis status
        let redisStatus = 'disconnected';
        try {
            await (redis as any).set('_health_ping', '1');
            redisStatus = process.env.USE_REDIS_MOCK === 'true' ? 'mock' : 'connected';
        } catch {
            redisStatus = 'disconnected';
        }

        // Memory stats
        const mem = process.memoryUsage();
        const heapUsedMB       = Math.round(mem.heapUsed  / 1024 / 1024);
        const heapTotalMB      = Math.round(mem.heapTotal / 1024 / 1024);
        const heapUsagePercent = heapTotalMB > 0 ? Math.round((heapUsedMB / heapTotalMB) * 100) : 0;
        const rssMB            = Math.round(mem.rss / 1024 / 1024);

        // System info
        const cpuCount  = os.cpus().length;
        const loadAvg   = os.loadavg();
        const freeMem   = Math.round(os.freemem() / 1024 / 1024);
        const totalMem  = Math.round(os.totalmem() / 1024 / 1024);

        // Uptime formatting
        const uptimeSec = Math.floor(process.uptime());
        const days  = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const mins  = Math.floor((uptimeSec % 3600)  / 60);
        const formattedUptime = days > 0
            ? `${days}d ${hours}h ${mins}m`
            : hours > 0
                ? `${hours}h ${mins}m`
                : `${mins}m`;

        const isHealthy = dbStatus === 'connected' && heapUsagePercent < 90;

        return res.status(200).json({
            success: true,
            data: {
                status:      isHealthy ? 'healthy' : 'degraded',
                environment: process.env.NODE_ENV || 'production',
                database: {
                    status:    dbStatus,
                    latencyMs: dbLatencyMs,
                },
                redis: {
                    status: redisStatus,
                    mode:   process.env.USE_REDIS_MOCK === 'true' ? 'mock' : 'real',
                },
                memory: {
                    heapUsedMB,
                    heapTotalMB,
                    heapUsagePercent,
                    rssMB,
                    systemFreeMB:  freeMem,
                    systemTotalMB: totalMem,
                },
                cpu: {
                    count:       cpuCount,
                    load1m:      Math.round(loadAvg[0] * 100) / 100,
                    load5m:      Math.round(loadAvg[1] * 100) / 100,
                    load15m:     Math.round(loadAvg[2] * 100) / 100,
                },
                uptime: {
                    seconds:   uptimeSec,
                    formatted: formattedUptime,
                },
                services: {
                    api:    'operational',
                    redis:  redisStatus !== 'disconnected' ? 'operational' : 'degraded',
                    workers: cpuCount > 1 ? 'multi-core' : 'single',
                },
            },
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            data: { status: 'degraded', environment: process.env.NODE_ENV || 'production' },
            message: 'Health check failed',
            error: (error as Error).message,
        });
    }
};

/** Get platform analytics — full SaaS intelligence shape for AnalyticsModule */
export const getPlatformAnalytics = async (req: Request, res: Response) => {
    try {
        const SaaSPayment = (await import('../models/SaaSPayment.model')).default;
        const SupportTicket = (await import('../models/SupportTicket.model')).default;

        const now = new Date();

        // MRR — actual SaaS subscription payments collected this month
        const mrrAgg = await SaaSPayment.aggregate([
            { $match: { status: 'completed', createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const actualMrr = mrrAgg[0]?.total || 0;

        // Total collected (all time) from SaaS payments
        const totalAgg = await SaaSPayment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const actualTotalCollected = totalAgg[0]?.total || 0;

        // Fallback: expected MRR from active non-trial tenants using customPrice + billingCycle
        // (same approach as reference gymmanagement platform-business.service.ts)
        // Then further fallback to plan pricing if customPrice not set
        const activePaidTenants = await Tenant.find({
            isActive: true,
            'subscription.status': 'active',
        } as any).select('customPrice billingCycle saasPlanId').lean();

        let expectedMrr = 0;
        const tenantsNeedingPlanPrice: string[] = [];
        for (const t of activePaidTenants) {
            const price = (t as any).customPrice;
            if (price && price > 0) {
                const cycle = (t as any).billingCycle || 'monthly';
                if (cycle === 'monthly')      expectedMrr += price;
                else if (cycle === 'quarterly')  expectedMrr += price / 3;
                else if (cycle === 'semi_annual') expectedMrr += price / 6;
                else if (cycle === 'yearly')      expectedMrr += price / 12;
                // lifetime = 0 MRR contribution
            } else if ((t as any).saasPlanId) {
                tenantsNeedingPlanPrice.push(String((t as any).saasPlanId));
            }
        }
        // For tenants without customPrice, fall back to their plan's monthly price
        if (tenantsNeedingPlanPrice.length) {
            const planPriceAgg = await Tenant.aggregate([
                { $match: { isActive: true, saasPlanId: { $exists: true, $ne: null }, customPrice: { $not: { $gt: 0 } } } },
                { $lookup: { from: 'saasplans', localField: 'saasPlanId', foreignField: '_id', as: 'plan' } },
                { $unwind: { path: '$plan', preserveNullAndEmptyArrays: false } },
                { $group: { _id: null, total: { $sum: '$plan.pricing.monthly' } } },
            ]);
            expectedMrr += planPriceAgg[0]?.total || 0;
        }
        expectedMrr = Math.round(expectedMrr);

        // Fallback total collected: sum all completed gym member payments (total volume through platform)
        const memberPaymentAgg = await Payment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount.total' } } },
        ]);
        const memberRevenue = memberPaymentAgg[0]?.total || 0;

        const mrr = actualMrr || expectedMrr;
        const totalCollected = actualTotalCollected || memberRevenue;

        // Tenant counts for conversion + churn
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const totalTenants = await Tenant.countDocuments();
        const activeTenants = await Tenant.countDocuments({ isActive: true } as any);
        const trialTenants = await Tenant.countDocuments({ 'subscription.status': 'trial' } as any);
        const trialToPaidConversion = totalTenants > 0 ? Math.round(((totalTenants - trialTenants) / totalTenants) * 100) : 0;
        // Churn = tenants deactivated in last 30 days (same as reference platform-business.service)
        const recentChurned = await Tenant.countDocuments({ isActive: false, updatedAt: { $gte: thirtyDaysAgo } } as any);
        const churnRate = totalTenants > 0 ? parseFloat(((recentChurned / totalTenants) * 100).toFixed(2)) : 0;
        const churnedTenants = await Tenant.countDocuments({ isActive: false } as any);

        // Plan distribution — prefer actual SaaS payments; fall back to active tenant plan subscriptions
        const planDistAgg = await SaaSPayment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: '$saasPlanId', count: { $sum: 1 }, revenue: { $sum: '$amount' } } },
            { $lookup: { from: 'saasplans', localField: '_id', foreignField: '_id', as: 'plan' } },
            { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
            { $project: { _id: 0, plan: { $toLower: { $ifNull: ['$plan.name', 'unknown'] } }, count: 1, revenue: 1 } },
            { $sort: { revenue: -1 } },
        ]);
        let planDistribution = planDistAgg.map(p => ({ plan: p.plan || 'basic', count: p.count, revenue: p.revenue || 0 }));

        // Fallback: count tenants per plan when no payment records exist
        if (!planDistribution.length) {
            const tenantPlanAgg = await Tenant.aggregate([
                { $match: { isActive: true, saasPlanId: { $exists: true, $ne: null } } },
                { $lookup: { from: 'saasplans', localField: 'saasPlanId', foreignField: '_id', as: 'plan' } },
                { $unwind: { path: '$plan', preserveNullAndEmptyArrays: false } },
                { $group: { _id: '$plan._id', plan: { $first: { $toLower: '$plan.name' } }, count: { $sum: 1 }, revenue: { $sum: '$plan.pricing.monthly' } } },
                { $project: { _id: 0, plan: 1, count: 1, revenue: 1 } },
                { $sort: { count: -1 } },
            ]);
            planDistribution = tenantPlanAgg.map(p => ({ plan: p.plan || 'basic', count: p.count, revenue: p.revenue || 0 }));
        }

        // Monthly revenue trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const monthlyAgg = await SaaSPayment.aggregate([
            { $match: { status: 'completed', createdAt: { $gte: sixMonthsAgo } } },
            { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$amount' } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);
        const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let monthlyTrend = monthlyAgg.map(m => ({ month: MONTH_NAMES[m._id.month - 1], revenue: m.revenue }));

        // Fallback: use member payment revenue by month when no SaaS payment trend data
        if (!monthlyTrend.length) {
            const memberMonthlyAgg = await Payment.aggregate([
                { $match: { status: 'completed', createdAt: { $gte: sixMonthsAgo } } },
                { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$amount.total' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]);
            monthlyTrend = memberMonthlyAgg.map(m => ({ month: MONTH_NAMES[m._id.month - 1], revenue: m.revenue || 0 }));
        }

        // Signups & conversions trend (last 6 months)
        const signupsAgg = await Tenant.aggregate([
            { $match: { createdAt: { $gte: sixMonthsAgo } } },
            { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, signups: { $sum: 1 } } },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);
        const signupsTrend = signupsAgg.map(s => ({
            month: MONTH_NAMES[s._id.month - 1],
            signups: s.signups,
            converted: Math.round(s.signups * (trialToPaidConversion / 100)),
        }));

        // Churn trend (mock with declining pattern if no historical data)
        const churnTrend = monthlyTrend.map((m, i) => ({ month: m.month, churnRate: Math.max(0, churnRate - i * 0.5) }));

        // Conversion funnel
        const conversionFunnel = [
            { stage: 'Registered', count: totalTenants, pct: 100 },
            { stage: 'Trial Started', count: totalTenants - churnedTenants, pct: totalTenants > 0 ? Math.round(((totalTenants - churnedTenants) / totalTenants) * 100) : 0 },
            { stage: 'Paid Subscription', count: activeTenants, pct: totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 0 },
            { stage: 'Active (30d)', count: activeTenants, pct: totalTenants > 0 ? Math.round((activeTenants / totalTenants) * 100) : 0 },
        ];

        const openTickets = await SupportTicket.countDocuments({ status: { $in: ['open', 'in_progress'] } }).catch(() => 0);

        return res.status(200).json({
            success: true,
            data: {
                // nested shape consumed by OverviewModule
                revenue: {
                    totalCollected,
                    total: totalCollected,
                    mrr,
                    churnRate,
                },
                tenants: {
                    total: totalTenants,
                    active: activeTenants,
                    trial: trialTenants,
                },
                support: {
                    openTickets,
                },
                // flat fields consumed by AnalyticsModule
                mrr,
                totalCollected,
                trialToPaidConversion,
                churnRate,
                activeTenants,
                planDistribution,
                monthlyTrend,
                signupsTrend,
                churnTrend,
                conversionFunnel,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching analytics', error: (error as Error).message });
    }
};

// ─────────────────────────────────────────────
// SaaS Plan CRUD
// ─────────────────────────────────────────────

export const createSaaSPlan = async (req: Request, res: Response) => {
    try {
        const Plan = (await import('../models/SaaSPlan.model')).default;
        const plan = await Plan.create(req.body);
        return res.status(201).json({ success: true, data: plan, message: 'Plan created' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error creating plan', error: (error as Error).message });
    }
};

export const updateSaaSPlan = async (req: Request, res: Response) => {
    try {
        const Plan = (await import('../models/SaaSPlan.model')).default;
        const { id } = req.params;
        const plan = await Plan.findByIdAndUpdate(id, req.body, { new: true });
        if (!plan) return res.status(404).json({ success: false, message: 'Plan not found' });
        return res.status(200).json({ success: true, data: plan, message: 'Plan updated' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating plan', error: (error as Error).message });
    }
};

// ─────────────────────────────────────────────
// Support Tickets
// ─────────────────────────────────────────────

/** Normalize a ticket doc so the frontend SupportModule gets `messages[].senderRole` */
const normalizeTicket = (ticket: any) => {
    const t = ticket.toObject ? ticket.toObject() : { ...ticket };
    t.messages = (t.replies || []).map((r: any) => ({
        ...r,
        senderRole: r.isStaff ? 'super_admin' : 'gym_owner',
    }));
    t.lastMessageAt = t.updatedAt;
    return t;
};

export const getSupportTicketById = async (req: Request, res: Response) => {
    try {
        const SupportTicket = (await import('../models/SupportTicket.model')).default;
        const { id } = req.params;
        const ticket = await SupportTicket.findById(id)
            .populate('userId', 'firstName lastName email')
            .populate('tenantId', 'name slug');
        if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });
        return res.status(200).json({ success: true, data: normalizeTicket(ticket) });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching ticket', error: (error as Error).message });
    }
};

export const replyToTicket = async (req: Request, res: Response) => {
    try {
        const SupportTicket = (await import('../models/SupportTicket.model')).default;
        const { id } = req.params;
        const { message, status } = req.body;
        const ticket = await SupportTicket.findById(id);
        if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found' });

        const update: any = {
            $push: { replies: { userId: req.user!._id, message, isStaff: true, createdAt: new Date() } },
        };
        if (status) update.status = status;

        const updated = await SupportTicket.findByIdAndUpdate(id, update, { new: true })
            .populate('userId', 'firstName lastName email')
            .populate('tenantId', 'name slug');

        return res.status(200).json({ success: true, data: normalizeTicket(updated), message: 'Reply sent' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error replying to ticket', error: (error as Error).message });
    }
};

// ─────────────────────────────────────────────
// Admin Promotion
// ─────────────────────────────────────────────

export const promoteToAdmin = async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase().trim() },
            { role: 'super_admin' },
            { new: true }
        ).select('firstName lastName email role');
        if (!user) return res.status(404).json({ success: false, message: 'User not found with that email' });
        return res.status(200).json({ success: true, data: user, message: `${user.email} promoted to Super Admin` });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error promoting user', error: (error as Error).message });
    }
};
