import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

/**
 * Middleware to automatically inject tenant context into all database queries
 * This ensures strict multi-tenancy isolation.
 *
 * Also enforces subscription gate: tenants with expired/suspended subscriptions
 * are blocked with 402. Uses Redis caching (5 min TTL) to avoid DB hit on every request.
 */
export const tenantContext = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user) {
        next();
        return;
    }

    // Skip for super admin
    if (req.user.role === 'super_admin') {
        next();
        return;
    }

    const tenantId = req.user.tenantId;

    if (!tenantId) {
        res.status(400).json({ error: 'Tenant context missing' });
        return;
    }

    req.tenantId = tenantId.toString();

    // ── Subscription gate (cached per tenant, 5 min TTL) ──────────────────────
    try {
        const cacheKey = `sub:${req.tenantId}`;
        const { redisUtils } = await import('../config/redis');
        let sub: any = null;

        try {
            sub = await redisUtils.getJSON<any>(cacheKey);
        } catch { /* cache miss */ }

        if (!sub) {
            const Tenant = (await import('../models/Tenant.model')).default;
            const tenant = await Tenant.findById(req.tenantId)
                .select('isActive lockState subscription')
                .lean();

            if (!tenant) {
                res.status(404).json({ success: false, message: 'Tenant not found' });
                return;
            }

            sub = {
                isActive: (tenant as any).isActive,
                lockState: (tenant as any).lockState,
                status: (tenant as any).subscription?.status,
                endDate: (tenant as any).subscription?.endDate,
            };

            try { await redisUtils.setJSON(cacheKey, sub, 300); } catch { /* non-critical */ }
        }

        if (!sub.isActive || sub.lockState === 'hard') {
            res.status(402).json({ success: false, code: 'TENANT_LOCKED', message: 'Your account has been deactivated. Contact support.' });
            return;
        }

        if (sub.status === 'cancelled' || sub.status === 'suspended') {
            res.status(402).json({ success: false, code: 'SUBSCRIPTION_INACTIVE', message: 'Your subscription is inactive. Please renew to continue.' });
            return;
        }

        if (sub.endDate && new Date(sub.endDate) < new Date()) {
            const grace = new Date(sub.endDate);
            grace.setDate(grace.getDate() + 7);
            if (new Date() > grace) {
                res.status(402).json({ success: false, code: 'SUBSCRIPTION_EXPIRED', message: 'Your subscription has expired. Please renew.' });
                return;
            }
            res.setHeader('X-Subscription-Warning', 'grace_period');
        }
    } catch {
        // Subscription check failed — err on the side of access to avoid locking out users
    }

    next();
};

/**
 * Middleware to automatically inject branch context
 */
export const branchContext = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        next();
        return;
    }

    // Skip for super admin and gym owner
    if (req.user.role === 'super_admin' || req.user.role === 'gym_owner') {
        next();
        return;
    }

    const branchId = req.user.branchId;

    if (branchId) {
        req.branchId = branchId.toString();
    }

    next();
};

/**
 * Helper function to add tenant filter to query
 */
export const addTenantFilter = (
    filter: any,
    tenantId: string | mongoose.Types.ObjectId
): any => {
    return {
        ...filter,
        tenantId: typeof tenantId === 'string' ? new mongoose.Types.ObjectId(tenantId) : tenantId,
    };
};

/**
 * Helper function to add branch filter to query
 */
export const addBranchFilter = (
    filter: any,
    branchId: string | mongoose.Types.ObjectId
): any => {
    return {
        ...filter,
        branchId: typeof branchId === 'string' ? new mongoose.Types.ObjectId(branchId) : branchId,
    };
};
