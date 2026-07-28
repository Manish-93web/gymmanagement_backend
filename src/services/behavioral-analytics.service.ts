import DeviceRecord from '../models/DeviceRecord.model';
import SecurityEvent from '../models/SecurityEvent.model';

export class BehavioralAnalyticsService {

    // Register or update device on login
    async registerDevice(params: {
        tenantId: string;
        memberId: string;
        userId: string;
        deviceId: string;
        deviceName?: string;
        platform: 'ios' | 'android' | 'web';
        appVersion?: string;
        ipAddress?: string;
    }): Promise<{ isNewDevice: boolean; deviceRecord: any; requiresVerification: boolean }> {
        const existing = await DeviceRecord.findOne({
            tenantId: params.tenantId,
            userId: params.userId,
            deviceId: params.deviceId,
        });

        if (existing) {
            existing.lastSeenAt = new Date();
            existing.loginCount += 1;
            await existing.save();
            return { isNewDevice: false, deviceRecord: existing, requiresVerification: false };
        }

        // New device detected — create record
        const deviceRecord = await DeviceRecord.create({
            ...params,
            isTrusted: false,
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            loginCount: 1,
        });

        // Log security event for new device
        await SecurityEvent.create({
            tenantId: params.tenantId,
            memberId: params.memberId,
            userId: params.userId,
            eventType: 'new_device',
            severity: 'medium',
            riskScore: 40,
            details: {
                deviceId: params.deviceId,
                deviceName: params.deviceName,
                platform: params.platform,
            },
            deviceId: params.deviceId,
            isResolved: false,
        });

        return { isNewDevice: true, deviceRecord, requiresVerification: true };
    }

    // Check for concurrent logins (same member active on multiple devices in last 10 minutes)
    async checkConcurrentLogin(
        tenantId: string,
        memberId: string,
        currentDeviceId: string
    ): Promise<{ detected: boolean; deviceCount: number }> {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentDevices = await DeviceRecord.find({
            tenantId,
            memberId,
            lastSeenAt: { $gte: tenMinutesAgo },
            isBlocked: false,
        });

        const otherDevices = recentDevices.filter((d) => d.deviceId !== currentDeviceId);

        if (otherDevices.length > 0) {
            await SecurityEvent.create({
                tenantId,
                memberId,
                eventType: 'concurrent_login',
                severity: 'high',
                riskScore: 75,
                details: {
                    activeDeviceCount: recentDevices.length,
                    otherDeviceIds: otherDevices.map((d) => d.deviceId),
                },
                deviceId: currentDeviceId,
                isResolved: false,
            });
            return { detected: true, deviceCount: recentDevices.length };
        }

        return { detected: false, deviceCount: 1 };
    }

    // Impossible travel detection — flag if check-ins are geographically inconsistent
    async checkImpossibleTravel(params: {
        tenantId: string;
        memberId: string;
        currentLat?: number;
        currentLng?: number;
        currentCity?: string;
    }): Promise<{ detected: boolean; details?: any }> {
        if (!params.currentLat || !params.currentLng) return { detected: false };

        const lastDevice = await DeviceRecord.findOne({
            tenantId: params.tenantId,
            memberId: params.memberId,
            'lastLocation.lat': { $exists: true },
        }).sort({ lastSeenAt: -1 });

        if (!lastDevice?.lastLocation) return { detected: false };

        const timeDiffMinutes =
            (Date.now() - lastDevice.lastSeenAt.getTime()) / (1000 * 60);
        const distanceKm = this.haversineDistance(
            lastDevice.lastLocation.lat,
            lastDevice.lastLocation.lng,
            params.currentLat,
            params.currentLng
        );

        // Impossible if > 500km apart and < 60 minutes between events
        if (distanceKm > 500 && timeDiffMinutes < 60) {
            await SecurityEvent.create({
                tenantId: params.tenantId,
                memberId: params.memberId,
                eventType: 'impossible_travel',
                severity: 'critical',
                riskScore: 95,
                details: {
                    fromCity: lastDevice.lastLocation.city,
                    toCity: params.currentCity,
                    distanceKm: Math.round(distanceKm),
                    timeDiffMinutes: Math.round(timeDiffMinutes),
                },
                isResolved: false,
            });
            return { detected: true, details: { distanceKm, timeDiffMinutes } };
        }

        return { detected: false };
    }

    // Compute overall risk score for a member (last 7 days unresolved events)
    async computeRiskScore(tenantId: string, memberId: string): Promise<number> {
        const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const events = await SecurityEvent.find({
            tenantId,
            memberId,
            createdAt: { $gte: last7Days },
            isResolved: false,
        });

        if (events.length === 0) return 0;

        // Weighted sum capped at 100
        const score = events.reduce((sum, e) => sum + e.riskScore * 0.5, 0);
        return Math.min(100, Math.round(score));
    }

    // Haversine formula — distance in km between two lat/lng points
    private haversineDistance(
        lat1: number,
        lng1: number,
        lat2: number,
        lng2: number
    ): number {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
                Math.cos((lat2 * Math.PI) / 180) *
                Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}

export const behavioralAnalytics = new BehavioralAnalyticsService();
export default behavioralAnalytics;
