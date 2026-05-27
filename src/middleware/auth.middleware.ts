import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import User, { IUser } from '../models/User.model';

declare global {
    namespace Express {
        interface Request {
            user?: IUser;
            tenantId?: string;
            branchId?: string;
        }
    }
}

export const authenticate = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Accept Bearer header OR ?token= query param (needed for EventSource / SSE)
        const token =
            req.headers.authorization?.replace('Bearer ', '') ||
            (req.query.token as string | undefined);

        if (!token) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }

        // Decode full JWT payload so we can use tenantId/branchId as fallback
        const decoded = jwt.verify(token, config.jwt.secret) as {
            userId: string;
            tenantId?: string;
            branchId?: string;
        };

        const user = await User.findById(decoded.userId).select('+password');

        if (!user || !user.isActive) {
            res.status(401).json({ error: 'Invalid or inactive user' });
            return;
        }

        req.user = user;
        // Use DB value if present, fall back to JWT claim (covers users whose DB record
        // was created before tenantId was backfilled)
        req.tenantId = user.tenantId?.toString() || decoded.tenantId;
        req.branchId = user.branchId?.toString() || decoded.branchId;

        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

export const optionalAuth = async (
    req: Request,
    _res: Response,
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
