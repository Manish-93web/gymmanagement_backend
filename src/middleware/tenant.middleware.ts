import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

/**
 * Middleware to automatically inject tenant context into all database queries
 * This ensures strict multi-tenancy isolation
 */
export const tenantContext = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        next();
        return;
    }

    // Skip for super admin
    if (req.user.role === 'super_admin') {
        next();
        return;
    }

    // Inject tenant ID into query filter
    const tenantId = req.user.tenantId;

    if (!tenantId) {
        res.status(400).json({ error: 'Tenant context missing' });
        return;
    }

    // Store tenant context for use in controllers
    req.tenantId = tenantId.toString();

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
