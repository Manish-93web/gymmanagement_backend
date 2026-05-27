import cron from 'node-cron';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricSettings from '../models/BiometricSettings.model';
import BiometricRawLog from '../models/BiometricRawLog.model';
import logger from '../config/logger';

/**
 * BiometricHealthCheckWorker
 *
 * Every 5 minutes: marks devices as offline if no heartbeat was received
 * within the tenant's alertOnDeviceOfflineMinutes threshold, and fires
 * WebSocket alerts. Also checks for consecutive sync failures and
 * unmatched-fingerprint spikes.
 */
export class BiometricHealthCheckWorker {
    private static instance: BiometricHealthCheckWorker;
    // Cooldown: don't re-alert the same device+event within 60 minutes
    private lastAlertAt = new Map<string, number>();

    private shouldAlert(key: string, cooldownMs = 60 * 60_000): boolean {
        const last = this.lastAlertAt.get(key) ?? 0;
        if (Date.now() - last < cooldownMs) return false;
        this.lastAlertAt.set(key, Date.now());
        return true;
    }

    private constructor() {
        this.initializeSchedules();
    }

    public static getInstance(): BiometricHealthCheckWorker {
        if (!BiometricHealthCheckWorker.instance) {
            BiometricHealthCheckWorker.instance = new BiometricHealthCheckWorker();
        }
        return BiometricHealthCheckWorker.instance;
    }

    private initializeSchedules() {
        cron.schedule('*/5 * * * *', () => this.runHealthChecks());
        logger.info('✅ Biometric Health-Check Worker initialized (every 5 min)');
    }

    private async runHealthChecks() {
        try {
            const devices = await BiometricDevice.find({
                isActive: true,
                syncMode: { $ne: 'manual' },
            }).lean();

            for (const device of devices) {
                try {
                    await this.checkDevice(device);
                } catch (err: any) {
                    logger.warn(`[HealthCheck] Failed for device ${(device as any).name || (device as any).deviceName || (device as any)._id}: ${err.message}`);
                }
            }
        } catch (err: any) {
            logger.error('[HealthCheck] Worker error:', err.message);
        }
    }

    private async checkDevice(device: any) {
        const settings = await BiometricSettings.findOne({
            tenantId: device.tenantId,
            branchId: null,
        }).lean();

        const thresholdMinutes = (settings as any)?.alertOnDeviceOfflineMinutes ?? 10;
        // Model stores last heartbeat in `lastPing` (not `lastSeenAt`)
        const lastPingTime     = device.lastPing ?? device.lastSeenAt ?? null;
        if (!lastPingTime) return; // Never pinged — skip offline alert (device just added)
        const lastSeen         = new Date(lastPingTime).getTime();
        const offlineMinutes   = (Date.now() - lastSeen) / 60_000;

        if (offlineMinutes >= thresholdMinutes) {
            const displayName = device.name || device.deviceName || device.deviceId || device._id.toString();
            // Update status if not already offline
            if (device.status !== 'offline') {
                await BiometricDevice.findByIdAndUpdate(device._id, { status: 'offline' });
            }
            // Only emit alert once per hour per device
            if (this.shouldAlert(`offline:${device._id}`)) {
                const payload = {
                    deviceId:       device._id.toString(),
                    deviceName:     displayName,
                    offlineMinutes: Math.round(offlineMinutes),
                    message:        `Device "${displayName}" has been offline for ${Math.round(offlineMinutes)} minutes`,
                };
                this.emitToTenant(device.tenantId.toString(), 'biometric:device_offline', payload);
            }
        }

        // Alert on consecutive sync failures (once per hour per device)
        const failThreshold = (settings as any)?.alertOnSyncFailureCount ?? 3;
        if ((device.consecutiveFailures ?? 0) >= failThreshold) {
            if (this.shouldAlert(`syncfail:${device._id}`)) {
                const displayName = device.name || device.deviceName || device.deviceId || device._id.toString();
                const payload = {
                    deviceId:     device._id.toString(),
                    deviceName:   displayName,
                    failureCount: device.consecutiveFailures,
                    lastError:    device.lastErrorMessage,
                    message:      `Device "${displayName}" has failed to sync ${device.consecutiveFailures} times in a row`,
                };
                this.emitToTenant(device.tenantId.toString(), 'biometric:sync_failure', payload);
            }
        }

        // Alert on unmatched-fingerprint spike
        const unmatchedThreshold = (settings as any)?.alertOnUnmatchedSpike ?? 10;
        await this.checkUnmatchedSpike(device, unmatchedThreshold);
    }

    private emitToTenant(tenantId: string, event: string, payload: object) {
        try {
            const ws = (global as any).websocketService;
            if (ws?.broadcastToTenant) {
                ws.broadcastToTenant(tenantId, event, payload);
            }
        } catch (err) {
            logger.warn('[HealthCheck] WebSocket emit failed:', err);
        }
    }

    private async checkUnmatchedSpike(device: any, threshold: number) {
        try {
            const oneHourAgo = new Date(Date.now() - 3_600_000);
            const count = await BiometricRawLog.countDocuments({
                deviceId:      device._id,
                processed:     true,
                skippedReason: 'no_member_mapping',
                createdAt:     { $gte: oneHourAgo },
            });
            if (count >= threshold && this.shouldAlert(`spike:${device._id}`)) {
                const displayName = device.name || device.deviceName || device.deviceId || device._id.toString();
                this.emitToTenant(device.tenantId.toString(), 'biometric:unmatched_spike', {
                    deviceId:   device._id.toString(),
                    deviceName: displayName,
                    count,
                    message:    `Device "${displayName}" had ${count} unmatched scans in the last hour`,
                });
            }
        } catch (err: any) {
            logger.warn('[HealthCheck] Unmatched spike check failed:', err.message);
        }
    }
}

export default BiometricHealthCheckWorker.getInstance();
