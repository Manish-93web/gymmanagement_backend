import Redis from 'ioredis';
import logger from '../config/logger';

const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
});

interface PresenceData {
    userId: string;
    status: 'online' | 'offline' | 'away' | 'busy';
    lastSeen: Date;
    device?: string;
}

class PresenceService {
    private readonly PRESENCE_PREFIX = 'presence:';
    private readonly PRESENCE_TTL = 300; // 5 minutes

    /**
     * Set user online
     */
    async setOnline(userId: string, device?: string) {
        const presenceData: PresenceData = {
            userId,
            status: 'online',
            lastSeen: new Date(),
            device,
        };

        await redis.setex(
            `${this.PRESENCE_PREFIX}${userId}`,
            this.PRESENCE_TTL,
            JSON.stringify(presenceData)
        );

        logger.info('User set online', { userId });

        return presenceData;
    }

    /**
     * Set user offline
     */
    async setOffline(userId: string) {
        const presenceData: PresenceData = {
            userId,
            status: 'offline',
            lastSeen: new Date(),
        };

        await redis.setex(
            `${this.PRESENCE_PREFIX}${userId}`,
            this.PRESENCE_TTL,
            JSON.stringify(presenceData)
        );

        logger.info('User set offline', { userId });

        return presenceData;
    }

    /**
     * Set user away
     */
    async setAway(userId: string) {
        const presenceData: PresenceData = {
            userId,
            status: 'away',
            lastSeen: new Date(),
        };

        await redis.setex(
            `${this.PRESENCE_PREFIX}${userId}`,
            this.PRESENCE_TTL,
            JSON.stringify(presenceData)
        );

        return presenceData;
    }

    /**
     * Set user busy
     */
    async setBusy(userId: string) {
        const presenceData: PresenceData = {
            userId,
            status: 'busy',
            lastSeen: new Date(),
        };

        await redis.setex(
            `${this.PRESENCE_PREFIX}${userId}`,
            this.PRESENCE_TTL,
            JSON.stringify(presenceData)
        );

        return presenceData;
    }

    /**
     * Get user presence
     */
    async getPresence(userId: string): Promise<PresenceData | null> {
        const data = await redis.get(`${this.PRESENCE_PREFIX}${userId}`);

        if (!data) {
            return {
                userId,
                status: 'offline',
                lastSeen: new Date(),
            };
        }

        return JSON.parse(data);
    }

    /**
     * Get multiple users presence
     */
    async getBulkPresence(userIds: string[]): Promise<PresenceData[]> {
        const presences: PresenceData[] = [];

        for (const userId of userIds) {
            const presence = await this.getPresence(userId);
            if (presence) {
                presences.push(presence);
            }
        }

        return presences;
    }

    /**
     * Heartbeat - keep user online
     */
    async heartbeat(userId: string) {
        const presence = await this.getPresence(userId);

        if (presence && presence.status === 'online') {
            await this.setOnline(userId, presence.device);
        }

        return presence;
    }

    /**
     * Get online users count
     */
    async getOnlineCount(): Promise<number> {
        const keys = await redis.keys(`${this.PRESENCE_PREFIX}*`);
        let onlineCount = 0;

        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                const presence: PresenceData = JSON.parse(data);
                if (presence.status === 'online') {
                    onlineCount++;
                }
            }
        }

        return onlineCount;
    }

    /**
     * Get all online users
     */
    async getOnlineUsers(): Promise<PresenceData[]> {
        const keys = await redis.keys(`${this.PRESENCE_PREFIX}*`);
        const onlineUsers: PresenceData[] = [];

        for (const key of keys) {
            const data = await redis.get(key);
            if (data) {
                const presence: PresenceData = JSON.parse(data);
                if (presence.status === 'online') {
                    onlineUsers.push(presence);
                }
            }
        }

        return onlineUsers;
    }
}

export default new PresenceService();
