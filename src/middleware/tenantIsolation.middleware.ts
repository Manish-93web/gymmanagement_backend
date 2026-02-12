import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

/**
 * Middleware to enforce tenant isolation.
 * Automatically adds tenantId to req object if not present
 * and provides utility to filter queries.
 */
export const tenantIsolation = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return next();
    }

    // Super admin can see everything, skip isolation
    if (req.user.role === 'super_admin') {
        return next();
    }

    // Ensure tenantId is present for all other roles
    if (!req.user.tenantId) {
        return res.status(403).json({
            status: 'error',
            message: 'Tenant access denied: No tenant ID associated with user'
        });
    }

    next();
};

/**
 * Helper to apply tenant isolation to Mongoose queries.
 * @param query Mongoose query object
 * @param tenantId The ID of the tenant to isolate to
 */
export const isolateQuery = (query: any, tenantId: string | mongoose.Types.ObjectId) => {
    return query.where({ tenantId });
};
