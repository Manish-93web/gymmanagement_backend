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
        // Run at 23:59 and 00:05 in IST (UTC+5:30) so it triggers at end of Indian gym day.
        // node-cron supports timezone option natively.
        cron.schedule('59 23 * * *', () => this.runAutoCheckout(), { timezone: 'Asia/Kolkata' });
        cron.schedule('5 0 * * *',   () => this.runAutoCheckout(), { timezone: 'Asia/Kolkata' });
        logger.info('✅ Biometric Auto-Checkout Worker initialized (23:59 IST + 00:05 IST)');
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
                        now,
                        (settings as any).timezone || 'Asia/Kolkata'
                    );
                } catch (err: any) {
                    logger.warn(`[AutoCheckout] Tenant ${settings.tenantId} error: ${err.message}`);
                }
            }
        } catch (err: any) {
            logger.error('[AutoCheckout] Worker error:', err.message);
        }
    }

    private async checkoutTenant(tenantId: string, autoCheckoutAfterMinutes: number, now: Date, tz = 'Asia/Kolkata'): Promise<void> {
        // Look back 2 days to catch any records that crossed midnight in the tenant's timezone
        const cutoffStart = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

        const openRecords = await Attendance.find({
            tenantId:     new mongoose.Types.ObjectId(tenantId),
            checkInTime:  { $gte: cutoffStart, $lte: now },
            checkOutTime: null,
        });

        if (openRecords.length === 0) return;

        // Compute end-of-day in the tenant's timezone
        const endOfDayUTC = (date: Date): Date => {
            try {
                const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
                const naive = new Date(`${dayStr}T23:59:59.999Z`);
                const parts = new Intl.DateTimeFormat('en-US', {
                    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                }).formatToParts(naive);
                const m: Record<string, string> = {};
                for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
                const tzInterp = new Date(`${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}Z`);
                return new Date(naive.getTime() - (tzInterp.getTime() - naive.getTime()));
            } catch {
                const d = new Date(date); d.setUTCHours(23, 59, 59, 999); return d;
            }
        };

        let closed = 0;
        for (const record of openRecords) {
            const checkInTime = new Date(record.checkInTime);
            const autoOut     = new Date(checkInTime.getTime() + autoCheckoutAfterMinutes * 60_000);
            const endOfDay    = endOfDayUTC(checkInTime);

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
