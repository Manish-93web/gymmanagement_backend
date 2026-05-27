import cron from 'node-cron';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricRawLog from '../models/BiometricRawLog.model';
import BiometricSyncJob from '../models/BiometricSyncJob.model';
import BiometricAttendanceService from '../services/biometric-attendance.service';
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
                const lastSync   = d.lastSyncAt ? new Date(d.lastSyncAt).getTime() : 0;
                const intervalMs = ((d.settings?.syncInterval as number) || 5) * 60_000;
                return now - lastSync >= intervalMs;
            });

            if (due.length === 0) return;

            logger.info(`[BiometricSync] Syncing ${due.length} device(s)`);

            for (const device of due) {
                this.syncDevice(device as any).catch((err: any) =>
                    logger.error(`[BiometricSync] Sync error for ${(device as any).name || (device as any).deviceName}: ${err.message}`)
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
        try {
            const result = await BiometricAttendanceService.processUnprocessedLogs(
                device.tenantId.toString(),
                device._id.toString()
            );

            await BiometricDevice.findByIdAndUpdate(device._id, {
                lastSyncAt:          new Date(),
                status:              'active',
                consecutiveFailures: 0,
            });

            await this.finishSyncJob(jobId, result.created, result.unmatched + result.skipped);
            if (result.created > 0) {
                logger.info(`[BiometricSync] Device ${(device as any).name || (device as any).deviceName || device._id}: ${result.created} attendance records created, ${result.unmatched} unmatched, ${result.skipped} skipped`);
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
