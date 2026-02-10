import { Request, Response } from 'express';
import Tenant from '../models/Tenant.model';
import User from '../models/User.model';
import Member from '../models/Member.model';
import Subscription from '../models/Subscription.model';

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

        res.status(200).json({
            success: true,
            data: tenantStats,
        });
    } catch (error) {
        res.status(500).json({
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

        res.status(200).json({
            success: true,
            data: tenant,
            message: 'Tenant status updated successfully',
        });
    } catch (error) {
        res.status(500).json({
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
        // Use pricing.totalAmount as per Subscription model
        // @ts-ignore
        const mrr = subscriptions.reduce((acc: number, sub) => acc + (sub.pricing?.totalAmount || 0), 0);

        // Recent Signups (Last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentSignups = await Tenant.countDocuments({
            createdAt: { $gte: thirtyDaysAgo },
        });

        res.status(200).json({
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
        res.status(500).json({
            success: false,
            message: 'Error fetching platform metrics',
            error: (error as Error).message,
        });
    }
};
