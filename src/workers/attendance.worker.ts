import cron from 'node-cron';
import Tenant from '../models/Tenant.model';
import { AttendanceService } from '../services/attendance.service';
import logger from '../config/logger';

const attendanceService = new AttendanceService();

export class AttendanceWorker {
    private static instance: AttendanceWorker;

    private constructor() {
        this.initializeSchedules();
    }

    public static getInstance(): AttendanceWorker {
        if (!AttendanceWorker.instance) {
            AttendanceWorker.instance = new AttendanceWorker();
        }
        return AttendanceWorker.instance;
    }

    private initializeSchedules() {
        // Hourly: auto check-out members who exceeded the stay threshold
        cron.schedule('0 * * * *', async () => {
            logger.info('[Attendance] Running hourly auto check-out...');
            try {
                const tenants = await Tenant.find({ isActive: true }).select('_id').lean();
                let total = 0;
                for (const t of tenants) {
                    try {
                        const count = await attendanceService.autoCheckOut(t._id.toString());
                        total += count;
                    } catch (err: any) {
                        logger.warn(`[Attendance] Auto checkout failed for tenant ${t._id}: ${err.message}`);
                    }
                }
                if (total > 0) logger.info(`[Attendance] Auto checked-out ${total} member(s) across all tenants.`);
            } catch (err: any) {
                logger.error('[Attendance] Hourly auto check-out error:', err.message);
            }
        });

        // 2:00 AM daily: EOD cleanup — close any sessions still open from previous day
        cron.schedule('0 2 * * *', async () => {
            logger.info('[Attendance] Running EOD attendance cleanup...');
            try {
                const tenants = await Tenant.find({ isActive: true }).select('_id').lean();
                let total = 0;
                for (const t of tenants) {
                    try {
                        const count = await attendanceService.autoCheckOut(t._id.toString(), 1);
                        total += count;
                    } catch (err: any) {
                        logger.warn(`[Attendance] EOD cleanup failed for tenant ${t._id}: ${err.message}`);
                    }
                }
                logger.info(`[Attendance] EOD cleanup closed ${total} remaining active session(s).`);
            } catch (err: any) {
                logger.error('[Attendance] EOD cleanup error:', err.message);
            }
        });

        logger.info('✅ Attendance Worker initialized (hourly + 2AM EOD)');
    }
}

export default AttendanceWorker.getInstance();
