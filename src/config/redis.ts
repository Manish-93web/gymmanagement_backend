import Redis from 'ioredis';
import { config } from './config';

export const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password || undefined,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
    console.log('✅ Redis Connected');
});

redis.on('error', (err) => {
    console.error('❌ Redis connection error:', err);
});

redis.on('close', () => {
    console.warn('⚠️  Redis connection closed');
});

// Redis utility functions
export const redisUtils = {
    // Set with expiry
    async setEx(key: string, value: string, expirySeconds: number): Promise<void> {
        await redis.setex(key, expirySeconds, value);
    },

    // Get value
    async get(key: string): Promise<string | null> {
        return await redis.get(key);
    },

    // Delete key
    async del(key: string): Promise<void> {
        await redis.del(key);
    },

    // Set JSON
    async setJSON(key: string, value: any, expirySeconds?: number): Promise<void> {
        const stringValue = JSON.stringify(value);
        if (expirySeconds) {
            await redis.setex(key, expirySeconds, stringValue);
        } else {
            await redis.set(key, stringValue);
        }
    },

    // Get JSON
    async getJSON<T>(key: string): Promise<T | null> {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
    },

    // Increment
    async incr(key: string): Promise<number> {
        return await redis.incr(key);
    },

    // Check if key exists
    async exists(key: string): Promise<boolean> {
        const result = await redis.exists(key);
        return result === 1;
    },
};

export default redis;
