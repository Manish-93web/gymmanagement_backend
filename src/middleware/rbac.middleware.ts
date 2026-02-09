import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/User.model';

// Permission matrix - maps roles to their allowed permissions
const rolePermissions: Record<UserRole, string[]> = {
    super_admin: ['*'], // All permissions
    gym_owner: [
        'tenant:*',
        'branch:*',
        'user:*',
        'member:*',
        'plan:*',
        'payment:*',
        'analytics:*',
        'settings:*',
    ],
    branch_manager: [
        'branch:read',
        'branch:update',
        'user:read',
        'user:create',
        'member:*',
        'attendance:*',
        'class:*',
        'booking:*',
        'trainer:read',
        'analytics:read',
    ],
    trainer: [
        'member:read',
        'workout:*',
        'diet:*',
        'class:read',
        'booking:read',
        'attendance:read',
    ],
    staff: [
        'member:read',
        'member:create',
        'attendance:*',
        'booking:*',
        'class:read',
        'pos:*',
    ],
    member: [
        'member:read:own',
        'workout:read:own',
        'diet:read:own',
        'booking:*:own',
        'attendance:read:own',
    ],
    accountant: [
        'payment:*',
        'subscription:read',
        'analytics:read',
        'member:read',
    ],
    auditor: [
        'audit:read',
        'member:read',
        'payment:read',
        'analytics:read',
    ],
};

// Check if user has required permission
const hasPermission = (userRole: UserRole, requiredPermission: string): boolean => {
    const permissions = rolePermissions[userRole] || [];

    // Super admin has all permissions
    if (permissions.includes('*')) {
        return true;
    }

    // Check for exact match
    if (permissions.includes(requiredPermission)) {
        return true;
    }

    // Check for wildcard match (e.g., 'member:*' matches 'member:read')
    const [resource] = requiredPermission.split(':');
    if (permissions.includes(`${resource}:*`)) {
        return true;
    }

    return false;
};

// Middleware to check if user has required role
export const requireRole = (...roles: UserRole[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }

        next();
    };
};

// Middleware to check if user has any of the required roles (alias for requireRole)
export const requireAnyRole = requireRole;

// Middleware to check if user has required permission
export const requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        if (!hasPermission(req.user.role, permission)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }

        next();
    };
};

// Middleware to check if user can access specific tenant
export const requireTenantAccess = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    // Super admin can access all tenants
    if (req.user.role === 'super_admin') {
        next();
        return;
    }

    const requestedTenantId = req.params.tenantId || req.body.tenantId || req.query.tenantId;

    if (requestedTenantId && requestedTenantId !== req.user.tenantId?.toString()) {
        res.status(403).json({ error: 'Access denied to this tenant' });
        return;
    }

    next();
};

// Middleware to check if user can access specific branch
export const requireBranchAccess = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    // Super admin and gym owner can access all branches
    if (req.user.role === 'super_admin' || req.user.role === 'gym_owner') {
        next();
        return;
    }

    const requestedBranchId = req.params.branchId || req.body.branchId || req.query.branchId;

    if (requestedBranchId && requestedBranchId !== req.user.branchId?.toString()) {
        res.status(403).json({ error: 'Access denied to this branch' });
        return;
    }

    next();
};
