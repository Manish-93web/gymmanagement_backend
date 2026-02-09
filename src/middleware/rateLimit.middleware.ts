import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config/config';
import { redisUtils } from '../config/redis';

// General API rate limiter
export const apiLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: 'Too many login attempts, please try again later',
    skipSuccessfulRequests: true,
});

// Rate limiter for OTP generation
export const otpLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3, // 3 OTPs per minute
    message: 'Too many OTP requests, please try again later',
});

// Custom Redis-based rate limiter for per-user limits
export const userRateLimiter = (maxRequests: number, windowSeconds: number) => {
    return async (req: Request, res: Response, next: Function): Promise<void> => {
        const userId = (req as any).user?.id;

        if (!userId) {
            next();
            return;
        }

        const key = `rate_limit:user:${userId}`;
        const current = await redisUtils.incr(key);

        if (current === 1) {
            await redisUtils.setEx(key, current.toString(), windowSeconds);
        }

        if (current > maxRequests) {
            res.status(429).json({
                error: 'Rate limit exceeded',
                retryAfter: windowSeconds,
            });
            return;
        }

        next();
    };
};
