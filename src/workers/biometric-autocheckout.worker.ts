import cron from 'node-cron';
import mongoose from 'mongoose';
import Attendance from '../models/Attendance.model';
import BiometricSettings from '../models/BiometricSettings.model';
import logger from '../config/logger';

/**
 * BiometricAutoCheckoutWorker
 *
 * Runs at 23:59 nightly. For every tenant with autoCheckoutEnabled = true,
 * closes open attendance records by setting checkOut to:
 *   min(checkIn + autoCheckoutAfterMinutes, 23:59:59 same day)
 *
 * A safety net run at 00:05 catches any records that crossed midnight.
 */
export class BiometricAutoCheckoutWorker {
    private static instance: BiometricAutoCheckoutWorker;

    private constructor() {
        this.initializeSchedules();
    }

    public static getInstance(): BiometricAutoCheckoutWorker {
        if (!BiometricAutoCheckoutWorker.instance) {
            BiometricAutoCheckoutWorker.instance = new BiometricAutoCheckoutWorker();
        }
        return BiometricAutoCheckoutWorker.instance;
    }

    private initializeSchedules() {
        cron.schedule('59 23 * * *', () => this.runAutoCheckout());
        cron.schedule('5 0 * * *',  () => this.runAutoCheckout());
        logger.info('✅ Biometric Auto-Checkout Worker initialized (23:59 + 00:05)');
    }

    private async runAutoCheckout() {
        try {
            const enabledSettings = await BiometricSettings.find({
                autoCheckoutEnabled: true,
                branchId: null,
            }).lean();

            if (enabledSettings.length === 0) return;

            const now = new Date();
            for (const settings of enabledSettings) {
                try {
                    await this.checkoutTenant(
                        settings.tenantId.toString(),
                        (settings as any).autoCheckoutAfterMinutes ?? 480,
                        now
                    );
                } catch (err: any) {
                    logger.warn(`[AutoCheckout] Tenant ${settings.tenantId} error: ${err.message}`);
                }
            }
        } catch (err: any) {
            logger.error('[AutoCheckout] Worker error:', err.message);
        }
    }

    private async checkoutTenant(tenantId: string, autoCheckoutAfterMinutes: number, now: Date): Promise<void> {
        const cutoffStart = new Date(now);
        cutoffStart.setHours(0, 0, 0, 0);
        cutoffStart.setDate(cutoffStart.getDate() - 1); // include yesterday crossover

        const openRecords = await Attendance.find({
            tenantId:     new mongoose.Types.ObjectId(tenantId),
            checkInTime:  { $gte: cutoffStart, $lte: now },
            checkOutTime: null,
        });

        if (openRecords.length === 0) return;

        let closed = 0;
        for (const record of openRecords) {
            const checkInTime = new Date(record.checkInTime);
            const autoOut     = new Date(checkInTime.getTime() + autoCheckoutAfterMinutes * 60_000);

            const endOfDay = new Date(checkInTime);
            endOfDay.setHours(23, 59, 59, 999);

            const checkOutTime = autoOut < endOfDay ? autoOut : endOfDay;
            if (checkOutTime > now) continue;

            const durationMinutes = Math.round(
                (checkOutTime.getTime() - checkInTime.getTime()) / 60_000
            );

            await Attendance.findByIdAndUpdate(record._id, {
                checkOutTime,
                duration: durationMinutes > 0 ? durationMinutes : null,
                notes: ((record.notes as string) || '') + ' [Auto-checkout by system]',
            });
            closed++;
        }

        if (closed > 0) {
            logger.info(`[AutoCheckout] Closed ${closed} open record(s) for tenant ${tenantId}`);
        }
    }
}

export default BiometricAutoCheckoutWorker.getInstance();
