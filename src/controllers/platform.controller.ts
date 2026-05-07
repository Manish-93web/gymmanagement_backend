import { Request, Response } from 'express';
import Tenant from '../models/Tenant.model';
import User from '../models/User.model';
import Member from '../models/Member.model';
import Subscription from '../models/Subscription.model';
import systemConfigService from '../services/system-config.service';
import auditService from '../services/audit.service';
import backupService from '../services/backup.service';

/**
 * Get all tenants with aggregated stats
 */
export const getAllTenants = async (req: Request, res: Response) => {
    try {
        const tenants = await Tenant.find()
            .select('name slug isActive subscription createdAt contactInfo')
            .sort({ createdAt: -1 });

        const tenantStats = await Promise.all(
            tenants.map(async (tenant) => {
                const memberCount = await Member.countDocuments({ tenantId: tenant._id });
                const owner = await User.findOne({ tenantId: tenant._id, role: 'gym_owner' }).select(
                    'firstName lastName email mobile'
                );

                return {
                    ...tenant.toObject(),
                    stats: {
                        totalMembers: memberCount,
                    },
                    owner,
                };
            })
        );

        return res.status(200).json({
            success: true,
            data: tenantStats,
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
export const getPlatformConfig = async (req: Request, res: Response) => {
    // Use a fixed ObjectId for platform configuration
    const PLATFORM_TENANT_ID = '000000000000000000000000';

    try {
        const config = await systemConfigService.getConfig(PLATFORM_TENANT_ID);
        return res.status(200).json({ success: true, data: config });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching platform config', error: (error as Error).message });
    }
};

/**
 * Update Platform Config
 */
export const updatePlatformConfig = async (req: Request, res: Response) => {
    // Use a fixed ObjectId for platform configuration
    const PLATFORM_TENANT_ID = '000000000000000000000000';

    try {
        const config = await systemConfigService.updateConfig(PLATFORM_TENANT_ID, req.body);
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
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            SupportTicket.countDocuments(filter),
        ]);
        return res.status(200).json({ success: true, data: { tickets, total, page: parseInt(page) } });
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
 * Get platform-wide payment/revenue summary
 */
export const getPlatformPayments = async (req: Request, res: Response) => {
    try {
        const Payment = (await import('../models/Payment.model')).default;
        const { startDate, endDate, tenantId, page = '1', limit = '20' } = req.query as Record<string, string>;
        const filter: any = { status: 'completed' };
        if (tenantId) filter.tenantId = tenantId;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [payments, total] = await Promise.all([
            Payment.find(filter)
                .populate('memberId', 'firstName lastName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Payment.countDocuments(filter),
        ]);
        return res.status(200).json({ success: true, data: { payments, total, page: parseInt(page) } });
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
            filter.checkIn = {};
            if (startDate) filter.checkIn.$gte = new Date(startDate);
            if (endDate) filter.checkIn.$lte = new Date(endDate);
        }
        const records = await Attendance.find(filter)
            .populate('memberId', 'firstName lastName')
            .sort({ checkIn: -1 }).limit(100);
        return res.status(200).json({ success: true, data: records });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching attendance', error: (error as Error).message });
    }
};

/** View a specific tenant's finance */
export const viewTenantFinance = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const Payment = (await import('../models/Payment.model')).default;
        const [payments, total] = await Promise.all([
            Payment.find({ tenantId, status: 'completed' })
                .populate('memberId', 'firstName lastName')
                .sort({ createdAt: -1 }).limit(50),
            Payment.aggregate([
                { $match: { tenantId: new (require('mongoose').Types.ObjectId)(tenantId), status: 'completed' } },
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
        const tenant = await Tenant.findById(tenantId).select('name slug isActive subscription contactInfo createdAt');
        if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
        const [memberCount, owner] = await Promise.all([
            Member.countDocuments({ tenantId }),
            User.findOne({ tenantId, role: 'gym_owner' }).select('firstName lastName email mobile')
        ]);
        return res.status(200).json({ success: true, data: { ...tenant.toObject(), stats: { totalMembers: memberCount }, owner } });
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

/** Get platform analytics */
export const getPlatformAnalytics = async (req: Request, res: Response) => {
    try {
        const { period = '30d' } = req.query;
        const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const Payment = (await import('../models/Payment.model')).default;
        const [newTenants, newMembers, revenue] = await Promise.all([
            Tenant.countDocuments({ createdAt: { $gte: startDate } }),
            Member.countDocuments({ createdAt: { $gte: startDate } }),
            Payment.aggregate([
                { $match: { status: 'completed', createdAt: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: '$amount.total' } } }
            ])
        ]);

        return res.status(200).json({
            success: true,
            data: {
                period: `Last ${days} days`,
                newTenants,
                newMembers,
                revenue: revenue[0]?.total || 0
            }
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching analytics', error: (error as Error).message });
    }
};
