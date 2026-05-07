import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant.model';

/**
 * Blocks requests from tenants whose subscription has lapsed or is suspended.
 * - Super admins bypass this gate entirely.
 * - Tenants in a grace period receive a warning header but are not blocked.
 * - Tenants with status 'inactive', 'suspended', or 'cancelled' receive 402.
 * - Tenants whose endDate has passed receive 402.
 *
 * Apply AFTER `authenticate` + `tenantContext`.
 */
export const subscriptionGate = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.user) { next(); return; }

    // Super admins are never gated
    if (req.user.role === 'super_admin') { next(); return; }

    const tenantId = req.tenantId || req.user.tenantId?.toString();
    if (!tenantId) { next(); return; }

    try {
        const tenant = await Tenant.findById(tenantId).select('subscription lockState isActive').lean();

        if (!tenant) {
            res.status(404).json({ success: false, message: 'Tenant not found' });
            return;
        }

        if (!tenant.isActive || tenant.lockState === 'hard') {
            res.status(402).json({
                success: false,
                code: 'TENANT_LOCKED',
                message: 'Your gym account has been deactivated. Please contact support.',
            });
            return;
        }

        const sub = (tenant as any).subscription;
        if (!sub) { next(); return; }

        const now = new Date();

        // Check hard expiry
        if (sub.status === 'cancelled' || sub.status === 'suspended') {
            res.status(402).json({
                success: false,
                code: 'SUBSCRIPTION_INACTIVE',
                message: 'Your subscription is inactive. Please renew to continue.',
            });
            return;
        }

        if (sub.endDate && new Date(sub.endDate) < now) {
            // Check grace period (7 days)
            const graceCutoff = new Date(sub.endDate);
            graceCutoff.setDate(graceCutoff.getDate() + 7);

            if (now > graceCutoff) {
                res.status(402).json({
                    success: false,
                    code: 'SUBSCRIPTION_EXPIRED',
                    message: 'Your subscription has expired. Please renew to continue using the system.',
                });
                return;
            }

            // In grace period — allow but warn
            res.setHeader('X-Subscription-Warning', 'subscription_expired_grace_period');
        }

        next();
    } catch (err) {
        // If we cannot check the subscription, err on the side of allowing access
        // to avoid locking out users due to DB issues
        console.error('subscriptionGate error:', err);
        next();
    }
};

/**
 * Feature-flag gate — blocks access to a route if the tenant's plan doesn't
 * include the requested feature.
 *
 * Usage: router.get('/ai-insights', featureGate('aiEnabled'), controller.handler)
 */
export const featureGate = (featureKey: keyof {
    aiEnabled: boolean;
    onlineClasses: boolean;
    pos: boolean;
    whatsappIntegration: boolean;
    smsNotifications: boolean;
    emailNotifications: boolean;
    customDomain: boolean;
    multiCurrency: boolean;
}) => async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) { next(); return; }
    if (req.user.role === 'super_admin') { next(); return; }

    const tenantId = req.tenantId || req.user.tenantId?.toString();
    if (!tenantId) { next(); return; }

    try {
        const tenant = await Tenant.findById(tenantId).select('features subscription').lean();
        if (!tenant) { next(); return; }

        const features = (tenant as any).features || {};
        if (features[featureKey] === false) {
            res.status(403).json({
                success: false,
                code: 'FEATURE_NOT_AVAILABLE',
                message: `This feature (${featureKey}) is not available on your current plan. Please upgrade.`,
                upgradeRequired: true,
            });
            return;
        }

        next();
    } catch (err) {
        console.error('featureGate error:', err);
        next();
    }
};
