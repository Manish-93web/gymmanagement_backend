import Redis from 'ioredis';
import { config } from './config';

// In-memory Redis Mock for local development
class RedisMock {
    private store = new Map<string, { value: string; expiry?: number }>();
    status = 'ready';

    async setex(key: string, seconds: number, value: string) {
        this.store.set(key, { value, expiry: Date.now() + seconds * 1000 });
    }

    async set(key: string, value: string) {
        this.store.set(key, { value });
    }

    async get(key: string) {
        const item = this.store.get(key);
        if (!item) return null;
        if (item.expiry && Date.now() > item.expiry) {
            this.store.delete(key);
            return null;
        }
        return item.value;
    }

    async del(key: string) {
        this.store.delete(key);
    }

    async incr(key: string) {
        const val = await this.get(key);
        const next = (parseInt(val || '0', 10) + 1).toString();
        await this.set(key, next);
        return parseInt(next, 10);
    }

    async exists(key: string) {
        const val = await this.get(key);
        return val !== null ? 1 : 0;
    }

    on(event: string, callback: any) {
        if (event === 'ready' || event === 'connect') {
            setTimeout(callback, 0);
        }
    }
}

const isMock = process.env.USE_REDIS_MOCK === 'true';

export const redis = isMock
    ? (new RedisMock() as any)
    : new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
        maxRetriesPerRequest: 3,
    });

export const connectRedis = async () => {
    if (isMock) {
        console.log('⚠️  Using In-Memory Redis Mock');
        return;
    }
    // ioredis connects automatically on instantiation
    return new Promise<void>((resolve) => {
        if (redis.status === 'ready') resolve();
        redis.on('ready', () => resolve());
    });
};

if (!isMock) {
    redis.on('connect', () => {
        console.log('✅ Redis Connected');
    });

    redis.on('error', (err: any) => {
        console.error('❌ Redis connection error:', err);
    });

    redis.on('close', () => {
        console.warn('⚠️  Redis connection closed');
    });
}

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
