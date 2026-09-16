import cron from 'node-cron';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricSyncJob from '../models/BiometricSyncJob.model';
import BiometricAttendanceService from '../services/biometric-attendance.service';
import logger from '../config/logger';

/**
 * BiometricSyncWorker — ticks every minute.
 *
 * All supported devices are ADMS/push (the device dials out to this backend and
 * POSTs punches to /iclock/cdata; see essl-adms.controller.ts). There is no pull
 * path — a cloud-hosted backend has no route into a gym's private LAN/WiFi network,
 * so "poll the device's IP" can never work here regardless of brand or sync mode.
 * This worker's only job is to process whatever BiometricRawLog rows the ADMS
 * handler has already inserted since the last tick.
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
                isDeleted: { $ne: true },
            }).lean();

            const now = Date.now();
            const due = devices.filter((d: any) => {
                const lastSync = d.lastSyncAt ? new Date(d.lastSyncAt).getTime() : 0;
                const intervalMs = (d.syncIntervalMinutes || d.settings?.syncInterval || 5) * 60_000;
                return now - lastSync >= intervalMs;
            });

            if (due.length === 0) return;
            logger.info(`[BiometricSync] ${due.length} device(s) due for sync`);

            await Promise.allSettled(due.map(d => this.syncDevice(d as any)));
        } catch (err: any) {
            logger.error('[BiometricSync] Worker error:', err.message);
        } finally {
            this.running = false;
        }
    }

    private async syncDevice(device: any): Promise<void> {
        const jobId = await this.startSyncJob(device);

        try {
            // Process whatever pending raw logs the ADMS push handler already inserted
            // for this device since the last tick — nothing to fetch, nothing to pull.
            const result = await BiometricAttendanceService.processUnprocessedLogs(
                device.tenantId.toString(),
                device._id.toString()
            );
            const recordsCreated = result.created;
            const recordsUnmatched = result.unmatched;
            const recordsFetched = result.created + result.unmatched + result.skipped;

            await BiometricDevice.findByIdAndUpdate(device._id, {
                lastSyncAt: new Date(),
                status: 'active',
                consecutiveFailures: 0,
                $inc: { totalRecordsFetched: recordsFetched },
            });

            await this.finishSyncJob(jobId, recordsFetched, recordsCreated, recordsUnmatched);

            if (recordsCreated > 0 || recordsFetched > 0) {
                logger.info(`[BiometricSync] ${device.deviceName || device.name || device._id}: fetched=${recordsFetched} created=${recordsCreated} unmatched=${recordsUnmatched}`);
            }
        } catch (err: any) {
            await BiometricDevice.findByIdAndUpdate(device._id, {
                $inc: { consecutiveFailures: 1 },
                lastErrorMessage: err.message,
            });
            await this.failSyncJob(jobId, err.message);
            logger.error(`[BiometricSync] Error for device ${device._id}: ${err.message}`);
        }
    }

    private async startSyncJob(device: any): Promise<string> {
        const job = await BiometricSyncJob.create({
            deviceId: device._id,
            tenantId: device.tenantId,
            status: 'running',
            startedAt: new Date(),
            trigger: 'scheduled',
        });
        return (job._id as any).toString();
    }

    private async finishSyncJob(jobId: string, fetched: number, created: number, unmatched: number) {
        await BiometricSyncJob.findByIdAndUpdate(jobId, {
            status: 'completed',
            endedAt: new Date(),
            durationSeconds: Math.round((Date.now() - Date.parse((await BiometricSyncJob.findById(jobId).select('startedAt').lean() as any)?.startedAt || new Date().toISOString())) / 1000),
            recordsFetched: fetched,
            recordsCreated: created,
            recordsUnmatched: unmatched,
        });
    }

    private async failSyncJob(jobId: string, error: string) {
        await BiometricSyncJob.findByIdAndUpdate(jobId, {
            status: 'failed',
            endedAt: new Date(),
            errorMessage: error,
        });
    }

    public async forceSyncDevice(deviceId: string, tenantId: string): Promise<void> {
        const device = await BiometricDevice.findOne({ _id: deviceId, tenantId }).lean();
        if (!device) throw new Error('Device not found');
        await this.syncDevice(device);
    }
}

export default BiometricSyncWorker.getInstance();
