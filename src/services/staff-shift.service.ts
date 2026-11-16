import mongoose from 'mongoose';
import StaffShift from '../models/StaffShift.model';
import StaffShiftAssignment from '../models/StaffShiftAssignment.model';
import StaffAttendanceService from './staff-attendance.service';
import { localDateString } from '../utils/tz.utils';

/** Giving a shift to someone while they are being onboarded. */
class StaffShiftService {
    /** True when the shift exists, is active and belongs to the gym. Checked before anything is created. */
    async exists(tenantId: string, shiftId: unknown): Promise<boolean> {
        if (!shiftId || !mongoose.Types.ObjectId.isValid(String(shiftId))) return false;
        return !!(await StaffShift.findOne({ _id: String(shiftId), tenantId, isActive: true }).select('_id').lean());
    }

    /** The shift applies from today (gym timezone). Weekly off days are set later on Staff > Shifts & Weekly Off. */
    async assignFromToday(tenantId: string, staffId: string, shiftId: string, by?: string) {
        const { timezone } = await StaffAttendanceService.dayWindow(tenantId, new Date());
        await StaffShiftAssignment.findOneAndUpdate(
            { tenantId, staffId, effectiveFrom: localDateString(new Date(), timezone) },
            { $set: { shiftId, weeklyOff: [], ...(by && { createdBy: by }) } },
            { upsert: true }
        );
    }
}

export default new StaffShiftService();
