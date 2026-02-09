import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import User, { IUser } from '../models/User.model';

export interface AuthRequest extends Request {
    user?: IUser;
    tenantId?: string;
    branchId?: string;
}

export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };

        const user = await User.findById(decoded.userId).select('+password');

        if (!user || !user.isActive) {
            res.status(401).json({ error: 'Invalid or inactive user' });
            return;
        }

        req.user = user;
        req.tenantId = user.tenantId?.toString();
        req.branchId = user.branchId?.toString();

        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

export const optionalAuth = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token) {
            const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
            const user = await User.findById(decoded.userId);

            if (user && user.isActive) {
                req.user = user;
                req.tenantId = user.tenantId?.toString();
                req.branchId = user.branchId?.toString();
            }
        }

        next();
    } catch (error) {
        // Continue without authentication
        next();
    }
};
