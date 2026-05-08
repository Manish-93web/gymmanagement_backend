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
                    logger.warn(`[HealthCheck] Failed for device ${(device as any).deviceName}: ${err.message}`);
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
        const lastSeen         = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
        const offlineMinutes   = (Date.now() - lastSeen) / 60_000;

        if (offlineMinutes >= thresholdMinutes && device.status !== 'offline') {
            await BiometricDevice.findByIdAndUpdate(device._id, { status: 'offline' });
            this.emitToTenant(device.tenantId.toString(), 'biometric:device_offline', {
                deviceId:      device._id.toString(),
                deviceName:    device.deviceName,
                offlineMinutes: Math.round(offlineMinutes),
                message:       `Device "${device.deviceName}" has been offline for ${Math.round(offlineMinutes)} minutes`,
            });
        }

        // Alert on consecutive sync failures
        const failThreshold = (settings as any)?.alertOnSyncFailureCount ?? 3;
        if ((device.consecutiveFailures ?? 0) >= failThreshold) {
            this.emitToTenant(device.tenantId.toString(), 'biometric:sync_failure', {
                deviceId:     device._id.toString(),
                deviceName:   device.deviceName,
                failureCount: device.consecutiveFailures,
                lastError:    device.lastErrorMessage,
                message:      `Device "${device.deviceName}" has failed to sync ${device.consecutiveFailures} times in a row`,
            });
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
            if (count >= threshold) {
                this.emitToTenant(device.tenantId.toString(), 'biometric:unmatched_spike', {
                    deviceId:   device._id.toString(),
                    deviceName: device.deviceName,
                    count,
                    message:    `Device "${device.deviceName}" had ${count} unmatched scans in the last hour`,
                });
            }
        } catch (err: any) {
            logger.warn('[HealthCheck] Unmatched spike check failed:', err.message);
        }
    }
}

export default BiometricHealthCheckWorker.getInstance();
