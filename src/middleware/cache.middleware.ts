import { Request, Response, NextFunction } from 'express';
import { redisUtils } from '../config/redis';

// Cache GET responses with per-tenant key isolation
export const cacheMiddleware = (ttlSeconds: number) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (req.method !== 'GET') {
            next();
            return;
        }

        const tenantId = (req as any).user?.tenantId?.toString() || 'global';
        const cacheKey = `cache:${tenantId}:${req.originalUrl}`;

        try {
            const cached = await redisUtils.getJSON<any>(cacheKey);
            if (cached) {
                res.set('X-Cache', 'HIT');
                res.status(200).json(cached);
                return;
            }
        } catch {
            // Cache miss or error — proceed without cache
        }

        const originalJson = res.json.bind(res);
        res.json = function (body: any) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                redisUtils.setJSON(cacheKey, body, ttlSeconds).catch(() => {});
            }
            res.set('X-Cache', 'MISS');
            return originalJson(body);
        };

        next();
    };
};

// Invalidate all cache entries for a tenant
export const invalidateTenantCache = async (tenantId: string): Promise<void> => {
    try {
        const pattern = `cache:${tenantId}:*`;
        // Use scan-based deletion if real Redis, otherwise noop for mock
        const redisClient = (await import('../config/redis')).redis;
        if (typeof (redisClient as any).scan === 'function') {
            let cursor = '0';
            do {
                const [newCursor, keys] = await (redisClient as any).scan(cursor, 'MATCH', pattern, 'COUNT', 100);
                cursor = newCursor;
                if (keys.length > 0) {
                    await (redisClient as any).del(...keys);
                }
            } while (cursor !== '0');
        }
    } catch {
        // Non-critical — cache will expire naturally
    }
};
