import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.model';
import Tenant from '../models/Tenant.model';

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

    // Prefer the value already set by authenticate (which applies JWT fallback)
    let tenantId = req.tenantId || req.user.tenantId?.toString();

    // gym_owner whose DB record pre-dates auto-provisioning: create tenant now and backfill
    if (!tenantId && req.user.role === 'gym_owner') {
        try {
            const gymName = `${req.user.firstName} ${req.user.lastName}'s Gym`;
            const slug = gymName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
                + '-' + Math.random().toString(36).slice(2, 7);
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 30);
            const tenant = await Tenant.create({
                name: gymName, slug, isActive: true,
                subscription: { plan: 'trial', status: 'active', startDate: new Date(), endDate: trialEnd },
            });
            tenantId = tenant._id.toString();
            await User.findByIdAndUpdate(req.user._id, { tenantId: tenant._id });
            req.user.tenantId = tenant._id as any;
            console.log(`[tenantContext] Auto-provisioned tenant "${gymName}" for gym_owner ${req.user._id}`);
        } catch (provisionErr: any) {
            console.error('[tenantContext] Failed to auto-provision tenant:', provisionErr?.message);
        }
    }

    if (!tenantId) {
        res.status(400).json({ error: 'Tenant context missing' });
        return;
    }

    req.tenantId = tenantId;

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
