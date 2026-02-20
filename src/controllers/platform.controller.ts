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
