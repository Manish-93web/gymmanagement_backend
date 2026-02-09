import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant.model';
import SaaSPlan from '../models/SaaSPlan.model';
import { FEATURES } from '../utils/FeatureRegistry';

/**
 * Middleware to check if the tenant has access to a specific feature
 */
export const requireFeature = (featureId: string) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = req.user?.tenantId;
            if (!tenantId) {
                return res.status(403).json({ error: 'Tenant context required' });
            }

            const tenant = await Tenant.findById(tenantId).populate('saasPlanId');
            if (!tenant) {
                return res.status(404).json({ error: 'Tenant not found' });
            }

            // 1. Check for Hard Lock
            if (tenant.lockState === 'hard') {
                return res.status(403).json({
                    error: 'ACCOUNT_LOCKED',
                    message: 'Your account is locked due to billing issues. Please contact support.'
                });
            }

            // 2. Check Overrides (Highest Priority)
            const override = tenant.usageOverrides.find(o => o.featureId === featureId);
            if (override) {
                if (override.enabled) return next();
                return res.status(403).json({ error: 'FEATURE_DISABLED', message: 'Feature disabled for your gym' });
            }

            // 3. Check Plan Features
            const plan = tenant.saasPlanId as any;
            if (plan) {
                const feature = plan.features.find((f: any) => f.id === featureId);
                if (feature && feature.enabled) {
                    // Check if write operation is allowed during Soft Lock
                    if (tenant.lockState === 'soft' && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                        return res.status(403).json({
                            error: 'READ_ONLY_MODE',
                            message: 'Account in read-only mode. Upgrade to perform this action.'
                        });
                    }
                    return next();
                }
            }

            // 4. Default to legacy feature flags if plan not set (backward compatibility)
            const legacyFlags: any = tenant.features;
            const featureDef = FEATURES[featureId];

            // Map new feature IDs to legacy flags where applicable
            const legacyMap: Record<string, string> = {
                'AI_BASE': 'aiEnabled',
                'POS_BASE': 'pos',
                'CUSTOM_DOMAIN': 'customDomain'
            };

            const flagName = legacyMap[featureId];
            if (flagName && legacyFlags[flagName]) {
                return next();
            }

            return res.status(403).json({
                error: 'FEATURE_NOT_IN_PLAN',
                message: `Upgrade your plan to access ${featureDef?.name || featureId}`
            });

        } catch (error) {
            console.error('Feature Gating Error:', error);
            res.status(500).json({ error: 'Internal server error checking feature access' });
        }
    };
};

/**
 * Middleware to enforce resource quotas (Members, Branches, etc.)
 */
export const enforceQuota = (resourceType: 'branches' | 'members' | 'trainers') => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = req.user?.tenantId;
            const tenant = await Tenant.findById(tenantId).populate('saasPlanId');
            if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

            const plan = tenant.saasPlanId as any;
            if (!plan) return next(); // Fallback if no SaaS plan linked

            let currentUsage = 0;
            let limit = plan.limits[resourceType];

            // Check for specific limit overrides
            const override = tenant.usageOverrides.find(o => o.featureId === `LIMIT_${resourceType.toUpperCase()}`);
            if (override && override.limit) {
                limit = override.limit;
            }

            // Dynamic usage check (mock implementation, real app would count docs)
            // In a real app, this would be injected via a service
            // For now, allow next() as this requires specific model counts
            next();

        } catch (error) {
            next(error);
        }
    };
};
