import mongoose from 'mongoose';
import StaffAttendance from '../models/StaffAttendance.model';
import StaffDeductionSettings from '../models/StaffDeductionSettings.model';
import BiometricSettings from '../models/BiometricSettings.model';
import Trainer from '../models/Trainer.model';
import { dayBoundsUTC, localMinutesOfDay, hhmmToMinutes } from '../utils/tz.utils';

export interface ShiftRules {
    lateAfter: number;     // minutes after local midnight; check-in later than this is late
    shiftEnd: number;      // minutes after local midnight; check-out earlier than this is early
    stdHours: number;      // hours that make a full day (overtime beyond, shortfall below)
    graceMinutes: number;
    ownShift: boolean;     // true when taken from the trainer's own shift
}

export interface StaffPunchInput {
    tenantId: mongoose.Types.ObjectId | string;
    branchId?: mongoose.Types.ObjectId | string;
    staffId: mongoose.Types.ObjectId | string;
    punchTime: Date;
    timezone: string;
    deviceId?: mongoose.Types.ObjectId | string;
    dedupeMinutes: number;
}

export interface StaffPunchResult {
    created: boolean;
    action?: 'check_in' | 'check_out';
    attendanceId?: string;
    reason?: string;
}

export interface StaffCorrectionInput {
    tenantId: mongoose.Types.ObjectId | string;
    branchId?: mongoose.Types.ObjectId | string;
    staffId: mongoose.Types.ObjectId | string;
    recordId?: string;                        // edit this record; omit to create / replace the day's record
    day?: Date;                               // any instant on the local calendar day (new records)
    clockIn?: Date;
    clockOut?: Date | null;                   // null clears the check-out
    status?: 'present' | 'late' | 'absent' | 'half_day' | 'paid_leave';
    notes?: string;
    adjustedBy?: string;
}

export class StaffAttendanceError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

const toId = (v: mongoose.Types.ObjectId | string) => new mongoose.Types.ObjectId(String(v));
const round2 = (n: number) => parseFloat(n.toFixed(2));

/**
 * Staff attendance rules shared by biometric punches and owner corrections:
 * one record per staff member per local day; first punch = check-in, last punch = check-out.
 */
class StaffAttendanceService {
    /** Timezone for a tenant (biometric settings, IST by default) and the local-day window of an instant. */
    async dayWindow(tenantId: mongoose.Types.ObjectId | string, at: Date) {
        const s: any = await BiometricSettings.findOne({ tenantId }).select('timezone').lean();
        const timezone: string = s?.timezone || 'Asia/Kolkata';
        return { timezone, ...dayBoundsUTC(at, timezone) };
    }

    /**
     * Shift rules for one person. A trainer with their own shift (Trainer.shift) is judged against it:
     * late = check-in after shift start + grace, early = check-out before shift end, a full day = shift length.
     * Everyone else uses the gym-wide defaults from the attendance settings.
     */
    async rulesFor(tenantId: mongoose.Types.ObjectId | string, staffId: mongoose.Types.ObjectId | string): Promise<ShiftRules> {
        const s: any = await StaffDeductionSettings.findOne({ tenantId }).lean();
        const rules: ShiftRules = {
            lateAfter: hhmmToMinutes(s?.lateAfterTime, 9 * 60 + 30),
            shiftEnd: hhmmToMinutes(s?.shiftEndTime, 18 * 60),
            stdHours: (s?.standardHoursPerDay ?? 8) as number,
            graceMinutes: (s?.graceMinutes ?? 10) as number,
            ownShift: false,
        };
        const trainer: any = await Trainer.findOne({ tenantId, userId: staffId }).select('shift').lean();
        const start = hhmmToMinutes(trainer?.shift?.startTime, -1);
        const end = hhmmToMinutes(trainer?.shift?.endTime, -1);
        // Same-day shifts only: attendance is grouped per calendar day.
        if (start >= 0 && end - start >= 60) {
            rules.lateAfter = start + rules.graceMinutes;
            rules.shiftEnd = end;
            rules.stdHours = (end - start) / 60;
            rules.ownShift = true;
        }
        return rules;
    }

    /** Recompute hours, overtime, early departure and status from the record's times. */
    private applyTimes(record: any, rules: ShiftRules, timezone: string, forceStatus?: string) {
        const lateStatus = localMinutesOfDay(record.clockIn, timezone) > rules.lateAfter ? 'late' : 'present';
        if (record.clockOut) {
            const hours = round2((record.clockOut.getTime() - record.clockIn.getTime()) / 3_600_000);
            record.hoursWorked = hours;
            record.overtime = round2(Math.max(0, hours - rules.stdHours));
            record.earlyDeparture = localMinutesOfDay(record.clockOut, timezone) < rules.shiftEnd;
            record.status = forceStatus ?? (hours < rules.stdHours / 2 ? 'half_day' : lateStatus);
        } else {
            record.hoursWorked = undefined;
            record.overtime = 0;
            record.earlyDeparture = false;
            record.status = forceStatus ?? lateStatus;
        }
    }

    async recordPunch(input: StaffPunchInput): Promise<StaffPunchResult> {
        const tenantId = toId(input.tenantId);
        const staffId = toId(input.staffId);
        const { punchTime, timezone, dedupeMinutes } = input;

        const rules = await this.rulesFor(tenantId, staffId);
        const { start: dayStart, end: dayEnd } = dayBoundsUTC(punchTime, timezone);
        let record = await StaffAttendance.findOne({ tenantId, staffId, date: { $gte: dayStart, $lte: dayEnd } });

        if (!record) {
            try {
                const fresh: any = new StaffAttendance({
                    tenantId,
                    ...(input.branchId && { branchId: toId(input.branchId) }),
                    staffId,
                    date: dayStart,
                    clockIn: punchTime,
                    source: 'biometric',
                    ...(input.deviceId && { deviceId: toId(input.deviceId) }),
                    punchCount: 1,
                });
                this.applyTimes(fresh, rules, timezone);
                await fresh.save();
                return { created: true, action: 'check_in', attendanceId: fresh._id.toString() };
            } catch (err: any) {
                if (err?.code !== 11000) throw err;
                // Raced with another punch for the same day: fall through to the update path.
                record = await StaffAttendance.findOne({ tenantId, staffId, date: { $gte: dayStart, $lte: dayEnd } });
                if (!record) throw err;
            }
        }

        // A day the owner marked as leave or absent is not overwritten by a stray punch.
        if (['absent', 'paid_leave'].includes(record.status)) {
            return { created: false, reason: 'day_marked_' + record.status, attendanceId: record._id.toString() };
        }

        const lastActivity = record.clockOut ?? record.clockIn;
        if (Math.abs(punchTime.getTime() - lastActivity.getTime()) < dedupeMinutes * 60_000) {
            return { created: false, reason: 'duplicate_punch', attendanceId: record._id.toString() };
        }

        // Back-filled punch earlier than the recorded check-in becomes the check-in.
        if (punchTime < record.clockIn) record.clockIn = punchTime;
        else record.clockOut = punchTime;

        this.applyTimes(record, rules, timezone);
        record.source = record.source === 'manual' ? 'manual' : 'biometric';
        record.punchCount = (record.punchCount ?? 0) + 1;
        await record.save();

        return {
            created: true,
            action: record.clockOut ? 'check_out' : 'check_in',
            attendanceId: record._id.toString(),
        };
    }


    /** Self-service clock-in (web/app button). Same day record and rules as a biometric check-in. */
    async clockIn(tenantId: mongoose.Types.ObjectId | string, staffId: mongoose.Types.ObjectId | string, branchId?: mongoose.Types.ObjectId | string, now = new Date()) {
        const tId = toId(tenantId);
        const sId = toId(staffId);
        const { timezone, start, end } = await this.dayWindow(tId, now);
        const existing = await StaffAttendance.findOne({ tenantId: tId, staffId: sId, date: { $gte: start, $lte: end } });
        if (existing) {
            if (['absent', 'paid_leave'].includes(existing.status)) {
                throw new StaffAttendanceError(400, 'Today is marked as leave or absent. Ask the owner to correct it.');
            }
            throw new StaffAttendanceError(400, existing.clockOut
                ? 'You have already completed your shift for today.'
                : 'Already clocked in. Please clock out first.');
        }
        const record: any = new StaffAttendance({
            tenantId: tId, ...(branchId && { branchId: toId(branchId) }), staffId: sId,
            date: start, clockIn: now, source: 'manual', punchCount: 0,
        });
        this.applyTimes(record, await this.rulesFor(tId, sId), timezone);
        await record.save();
        return record;
    }

    /** Self-service clock-out. */
    async clockOut(tenantId: mongoose.Types.ObjectId | string, staffId: mongoose.Types.ObjectId | string, now = new Date()) {
        const tId = toId(tenantId);
        const sId = toId(staffId);
        const { timezone, start, end } = await this.dayWindow(tId, now);
        const record: any = await StaffAttendance.findOne({
            tenantId: tId, staffId: sId, date: { $gte: start, $lte: end }, clockOut: { $exists: false },
            status: { $nin: ['absent', 'paid_leave'] },
        });
        if (!record) throw new StaffAttendanceError(404, 'No active clock-in found for today.');
        record.clockOut = now;
        this.applyTimes(record, await this.rulesFor(tId, sId), timezone);
        await record.save();
        return record;
    }

    /**
     * Owner correction: fix a missed punch, add a day that has no record, or mark a day as
     * absent / paid leave. Hours, overtime and status are recalculated from the times.
     */
    async correct(input: StaffCorrectionInput) {
        const tenantId = toId(input.tenantId);
        const staffId = toId(input.staffId);
        const rules = await this.rulesFor(tenantId, staffId);

        let record: any = null;
        if (input.recordId) {
            record = await StaffAttendance.findOne({ _id: input.recordId, tenantId });
            if (!record) throw new Error('Attendance record not found');
        }

        const reference = input.clockIn ?? record?.clockIn ?? input.day;
        if (!reference) throw new Error('A date or check-in time is required');
        const { timezone, start: dayStart, end: dayEnd } = await this.dayWindow(tenantId, reference);

        if (!record) {
            record = await StaffAttendance.findOne({ tenantId, staffId, date: { $gte: dayStart, $lte: dayEnd } });
        }
        if (!record) {
            record = new StaffAttendance({
                tenantId,
                ...(input.branchId && { branchId: toId(input.branchId) }),
                staffId,
                date: dayStart,
                clockIn: input.clockIn ?? dayStart,
                source: 'manual',
                punchCount: 0,
            });
        }

        if (input.clockIn) record.clockIn = input.clockIn;
        if (input.clockOut === null) record.clockOut = undefined;
        else if (input.clockOut) record.clockOut = input.clockOut;
        if (record.clockOut && record.clockOut <= record.clockIn) {
            throw new Error('Check-out must be after check-in');
        }

        const dayOff = input.status === 'absent' || input.status === 'paid_leave';
        this.applyTimes(record, rules, timezone, dayOff ? input.status : undefined);
        if (dayOff) {
            record.hoursWorked = 0;
            record.overtime = 0;
            record.earlyDeparture = false;
        } else if (input.status === 'half_day' || input.status === 'late' || input.status === 'present') {
            record.status = input.status;
        }

        const stamp = `Adjusted${input.adjustedBy ? ' by owner' : ''} on ${new Date().toISOString().slice(0, 10)}`;
        record.notes = [input.notes, stamp].filter(Boolean).join(' · ');
        await record.save();
        return record;
    }
}

export default new StaffAttendanceService();
