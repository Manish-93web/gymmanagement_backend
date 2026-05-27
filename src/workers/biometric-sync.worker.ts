import cron from 'node-cron';
import mongoose from 'mongoose';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricRawLog from '../models/BiometricRawLog.model';
import BiometricSyncJob from '../models/BiometricSyncJob.model';
import BiometricAttendanceService from '../services/biometric-attendance.service';
import { getDeviceAdapter } from '../services/device-adapters/adapter.factory';
import logger from '../config/logger';

/**
 * BiometricSyncWorker — ticks every minute.
 *
 * For ADMS/push devices: just processes any unprocessed BiometricRawLog entries
 * (they were already inserted by the ADMS HTTP handler).
 *
 * For scheduled/pull devices: uses the device adapter to fetch new punches from
 * the device's REST API, saves them to BiometricRawLog, then processes them.
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
        let recordsFetched = 0, recordsCreated = 0, recordsUnmatched = 0;

        try {
            const syncMode: string = device.syncMode || 'realtime';
            const isAdmsPush = syncMode === 'realtime';

            if (!isAdmsPush) {
                // Pull mode: fetch from device REST API
                const adapter = getDeviceAdapter(device.deviceBrand || device.vendor || 'essl');
                const creds = {
                    ipAddress: device.ipAddress || '',
                    port: device.port || 4370,
                    password: device.password || '',
                    apiKey: device.apiKey || '',
                    timezone: device.timezone || device.settings?.timezone || 'Asia/Kolkata',
                };

                const { records, newCursor, clockDriftSeconds } = await adapter.pullLogs(
                    creds, device.lastSyncCursor || undefined
                );

                if (clockDriftSeconds && Math.abs(clockDriftSeconds) > 300) {
                    logger.warn(`[BiometricSync] Device ${device._id}: clock drift = ${clockDriftSeconds}s`);
                }

                recordsFetched = records.length;

                // Bulk-insert raw logs, skip exact duplicates via unique index
                for (const r of records) {
                    try {
                        await BiometricRawLog.create({
                            tenantId:        new mongoose.Types.ObjectId(device.tenantId),
                            branchId:        device.branchId ? new mongoose.Types.ObjectId(device.branchId) : undefined,
                            deviceId:        new mongoose.Types.ObjectId(device._id),
                            biometricUserId: r.biometricUserId,
                            eventType:       r.eventType,
                            punchTime:       r.punchTime,
                            deviceLocalTime: r.deviceLocalTime,
                            rawPayload:      r.rawPayload,
                            processed:       false,
                        });
                    } catch (e: any) {
                        if (e?.code !== 11000) throw e; // swallow duplicates only
                    }
                }

                // Persist new cursor
                if (newCursor) {
                    await BiometricDevice.findByIdAndUpdate(device._id, { lastSyncCursor: newCursor });
                }
            }

            // Process all pending raw logs for this device
            const result = await BiometricAttendanceService.processUnprocessedLogs(
                device.tenantId.toString(),
                device._id.toString()
            );
            recordsCreated = result.created;
            recordsUnmatched = result.unmatched;

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
