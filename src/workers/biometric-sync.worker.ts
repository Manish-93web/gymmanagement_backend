import cron from 'node-cron';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricRawLog from '../models/BiometricRawLog.model';
import BiometricSyncJob from '../models/BiometricSyncJob.model';
import Attendance from '../models/Attendance.model';
import BiometricMember from '../models/BiometricMember.model';
import Member from '../models/Member.model';
import logger from '../config/logger';

/**
 * BiometricSyncWorker
 *
 * Ticks every minute. For each device whose syncIntervalMinutes has elapsed
 * since its last sync, processes pending raw logs and converts them to
 * Attendance records. Prevents overlap via `running` guard.
 */
export class BiometricSyncWorker {
    private static instance: BiometricSyncWorker;
    private running = false;

    private constructor() {
        this.initializeSchedules();
    }

    public static getInstance(): BiometricSyncWorker {
        if (!BiometricSyncWorker.instance) {
            BiometricSyncWorker.instance = new BiometricSyncWorker();
        }
        return BiometricSyncWorker.instance;
    }

    private initializeSchedules() {
        cron.schedule('* * * * *', () => this.runSync());
        logger.info('✅ Biometric Sync Worker initialized (every-minute tick)');
    }

    private async runSync() {
        if (this.running) return;
        this.running = true;
        try {
            const devices = await BiometricDevice.find({
                isActive: true,
                syncMode: { $ne: 'manual' },
            }).lean();

            const now = Date.now();
            const due = devices.filter((d: any) => {
                const lastSync    = d.lastSyncAt ? new Date(d.lastSyncAt).getTime() : 0;
                const intervalMs  = ((d.syncIntervalMinutes as number) || 5) * 60_000;
                return now - lastSync >= intervalMs;
            });

            if (due.length === 0) return;

            logger.info(`[BiometricSync] Syncing ${due.length} device(s)`);

            for (const device of due) {
                this.syncDevice(device as any).catch((err: any) =>
                    logger.error(`[BiometricSync] Sync error for ${(device as any).deviceName}: ${err.message}`)
                );
            }
        } catch (err: any) {
            logger.error('[BiometricSync] Worker error:', err.message);
        } finally {
            this.running = false;
        }
    }

    private async syncDevice(device: any): Promise<void> {
        const jobId = await this.startSyncJob(device);
        let processed = 0;
        let errors    = 0;

        try {
            const pendingLogs = await BiometricRawLog.find({
                deviceId:  device._id,
                processed: false,
            }).sort({ punchTime: 1 }).limit(500).lean();

            for (const log of pendingLogs) {
                try {
                    await this.processRawLog(log, device);
                    await BiometricRawLog.findByIdAndUpdate(log._id, { processed: true });
                    processed++;
                } catch (err: any) {
                    await BiometricRawLog.findByIdAndUpdate(log._id, {
                        processed:     true,
                        skippedReason: err.message,
                    });
                    errors++;
                }
            }

            await BiometricDevice.findByIdAndUpdate(device._id, {
                lastSyncAt:          new Date(),
                status:              'online',
                consecutiveFailures: 0,
            });

            await this.finishSyncJob(jobId, processed, errors);
            if (processed > 0) {
                logger.info(`[BiometricSync] Device ${device.deviceName}: ${processed} records synced, ${errors} skipped`);
            }
        } catch (err: any) {
            await BiometricDevice.findByIdAndUpdate(device._id, {
                $inc: { consecutiveFailures: 1 },
                lastErrorMessage: err.message,
            });
            await this.failSyncJob(jobId, err.message);
            throw err;
        }
    }

    private async processRawLog(log: any, device: any): Promise<void> {
        const mapping = await BiometricMember.findOne({
            deviceId:     device._id,
            biometricUid: log.biometricUid,
        }).lean();

        if (!mapping) {
            throw new Error('no_member_mapping');
        }

        const member = await Member.findOne({
            _id:      mapping.memberId,
            tenantId: device.tenantId,
        }).lean();

        if (!member) throw new Error('member_not_found');

        const punchTime = new Date(log.punchTime);

        // Determine if this punch is a check-in or check-out
        const openRecord = await Attendance.findOne({
            memberId:     mapping.memberId,
            tenantId:     device.tenantId,
            checkOutTime: null,
        });

        if (!openRecord) {
            // Check-in
            await Attendance.create({
                tenantId:    device.tenantId,
                branchId:    device.branchId,
                memberId:    mapping.memberId,
                checkInTime: punchTime,
                method:      'biometric' as const,
                deviceId:    device._id.toString(),
            });
            this.emitPunch(device.tenantId.toString(), {
                type:       'checkin',
                memberId:   mapping.memberId.toString(),
                memberName: (member as any).firstName + ' ' + (member as any).lastName,
                deviceName: device.deviceName,
                time:       punchTime,
            });
        } else {
            // Check-out
            const durationMinutes = Math.round(
                (punchTime.getTime() - new Date(openRecord.checkInTime).getTime()) / 60_000
            );
            await Attendance.findByIdAndUpdate(openRecord._id, {
                checkOutTime: punchTime,
                duration:     durationMinutes > 0 ? durationMinutes : null,
            });
            this.emitPunch(device.tenantId.toString(), {
                type:       'checkout',
                memberId:   mapping.memberId.toString(),
                memberName: (member as any).firstName + ' ' + (member as any).lastName,
                deviceName: device.deviceName,
                time:       punchTime,
            });
        }
    }

    private emitPunch(tenantId: string, payload: object) {
        try {
            const ws = (global as any).websocketService;
            if (ws?.broadcastToTenant) ws.broadcastToTenant(tenantId, 'biometric:punch', payload);
        } catch { /* non-critical */ }
    }

    private async startSyncJob(device: any): Promise<string> {
        const job = await BiometricSyncJob.create({
            deviceId:  device._id,
            tenantId:  device.tenantId,
            status:    'running',
            startedAt: new Date(),
        });
        return (job._id as any).toString();
    }

    private async finishSyncJob(jobId: string, processed: number, errors: number): Promise<void> {
        await BiometricSyncJob.findByIdAndUpdate(jobId, {
            status:      'completed',
            completedAt: new Date(),
            processed,
            errors,
        });
    }

    private async failSyncJob(jobId: string, error: string): Promise<void> {
        await BiometricSyncJob.findByIdAndUpdate(jobId, {
            status:      'failed',
            completedAt: new Date(),
            errorMessage: error,
        });
    }

    /** Trigger an immediate sync for a specific device (called by force-sync API). */
    public async forceSyncDevice(deviceId: string, tenantId: string): Promise<void> {
        const device = await BiometricDevice.findOne({ _id: deviceId, tenantId }).lean();
        if (!device) throw new Error('Device not found');
        await this.syncDevice(device);
    }
}

export default BiometricSyncWorker.getInstance();
