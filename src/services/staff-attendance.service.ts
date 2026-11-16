import mongoose from 'mongoose';
import StaffAttendance from '../models/StaffAttendance.model';
import StaffDeductionSettings from '../models/StaffDeductionSettings.model';
import BiometricSettings from '../models/BiometricSettings.model';
import Trainer from '../models/Trainer.model';
import StaffShift from '../models/StaffShift.model';
import StaffShiftAssignment from '../models/StaffShiftAssignment.model';
import { dayBoundsUTC, localMinutesOfDay, hhmmToMinutes, localDateString, localWeekday } from '../utils/tz.utils';

export interface ShiftRules {
    lateAfter: number;     // minutes after local midnight; check-in later than this is late
    shiftEnd: number;      // minutes after local midnight; check-out earlier than this is early
    stdHours: number;      // hours that make a full day (overtime beyond, shortfall below); 0 on a weekly off
    shiftHours: number;    // length of this person's normal working day, the basis of the hourly rate
    graceMinutes: number;
    ownShift: boolean;     // true when taken from an assigned shift or the trainer's own shift
    offDay: boolean;       // the person's weekly off: everything worked is overtime
    segments: { start: number; end: number }[];  // working windows in minutes after midnight; gaps between them are unpaid
    overnight: boolean;    // the last window runs past midnight (its end is above 1440): punches after midnight belong to the shift's day
    shiftName?: string;
}

/** Shift rules for one person on any date, resolved from data loaded once. */
export interface ScheduleResolver {
    timezone: string;
    at(date: Date): ShiftRules;
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
     * Everything needed to judge one person's days, loaded once so a month of records costs no extra queries.
     * Precedence for a given day: the latest shift assignment on or before it (its shift, or the gym default
     * when assigned "none"), then the trainer's older single shift (Trainer.shift), then the gym-wide default.
     * late = check-in after the first window's start + grace, early = check-out before the last window's end,
     * a full day = the total length of the windows. A weekly off day has no lateness or shortfall and every
     * hour worked is overtime.
     */
    async schedule(tenantId: mongoose.Types.ObjectId | string, staffId: mongoose.Types.ObjectId | string): Promise<ScheduleResolver> {
        const tId = toId(tenantId);
        const sId = toId(staffId);
        const [settings, tzSettings, trainer, assignments]: any[] = await Promise.all([
            StaffDeductionSettings.findOne({ tenantId: tId }).lean(),
            BiometricSettings.findOne({ tenantId: tId }).select('timezone').lean(),
            Trainer.findOne({ tenantId: tId, userId: sId }).select('shift').lean(),
            StaffShiftAssignment.find({ tenantId: tId, staffId: sId }).sort({ effectiveFrom: 1 }).lean(),
        ]);
        const timezone: string = tzSettings?.timezone || 'Asia/Kolkata';
        const shiftIds = [...new Set<string>(assignments.map((a: any) => a.shiftId).filter(Boolean).map(String))];
        const shifts: any[] = shiftIds.length ? await StaffShift.find({ tenantId: tId, _id: { $in: shiftIds.map(toId) }, isActive: true }).lean() : [];
        const shiftById = new Map(shifts.map(s => [String(s._id), s]));

        const grace = (settings?.graceMinutes ?? 10) as number;
        const defaultRules = (): ShiftRules => {
            const stdHours = (settings?.standardHoursPerDay ?? 8) as number;
            return {
                lateAfter: hhmmToMinutes(settings?.lateAfterTime, 9 * 60 + 30),
                shiftEnd: hhmmToMinutes(settings?.shiftEndTime, 18 * 60),
                stdHours, shiftHours: stdHours, graceMinutes: grace,
                ownShift: false, offDay: false, segments: [], overnight: false,
            };
        };
        const fromSegments = (segs: { start: number; end: number }[], name?: string): ShiftRules => {
            const hours = segs.reduce((n, s) => n + (s.end - s.start), 0) / 60;
            return {
                lateAfter: segs[0].start + grace, shiftEnd: segs[segs.length - 1].end,
                stdHours: hours, shiftHours: hours, graceMinutes: grace,
                ownShift: true, offDay: false, segments: segs, shiftName: name,
                overnight: segs[segs.length - 1].end > 24 * 60,
            };
        };

        // The trainer's older single shift. Same-day only: attendance is grouped per calendar day.
        const legacyStart = hhmmToMinutes(trainer?.shift?.startTime, -1);
        const legacyEnd = hhmmToMinutes(trainer?.shift?.endTime, -1);
        const legacy = legacyStart >= 0 && legacyEnd - legacyStart >= 60 ? [{ start: legacyStart, end: legacyEnd }] : null;

        return {
            timezone,
            at: (date: Date): ShiftRules => {
                const day = localDateString(date, timezone);
                let current: any = null;
                for (const a of assignments) { if (a.effectiveFrom <= day) current = a; else break; }

                let rules: ShiftRules | null = null;
                if (current) {
                    const shift = current.shiftId ? shiftById.get(String(current.shiftId)) : null;
                    if (shift) {
                        rules = fromSegments(shift.segments.map((g: any, i: number) => {
                            const start = hhmmToMinutes(g.startTime, 0);
                            let end = hhmmToMinutes(g.endTime, 0);
                            if (end <= start && i === shift.segments.length - 1) end += 24 * 60;   // ends after midnight
                            return { start, end };
                        }), shift.name);
                    }
                } else if (legacy) {
                    rules = fromSegments(legacy);
                }
                rules = rules ?? defaultRules();

                if (current?.weeklyOff?.includes(localWeekday(date, timezone))) {
                    rules = { ...rules, offDay: true, stdHours: 0, lateAfter: 24 * 60 + 1, shiftEnd: 0 };
                }
                return rules;
            },
        };
    }

    /** Shift rules for one person on one date (now by default). */
    async rulesFor(tenantId: mongoose.Types.ObjectId | string, staffId: mongoose.Types.ObjectId | string, at: Date = new Date()): Promise<ShiftRules> {
        return (await this.schedule(tenantId, staffId)).at(at);
    }

    /** Hours between check-in and check-out, leaving out the unpaid gaps between a split shift's windows. */
    private workedHours(record: any, rules: ShiftRules, timezone: string): number {
        const elapsed = (record.clockOut.getTime() - record.clockIn.getTime()) / 60_000;
        const inMin = localMinutesOfDay(record.clockIn, timezone);
        const outMin = inMin + elapsed;
        let gap = 0;
        for (let i = 0; i + 1 < rules.segments.length; i++) {
            gap += Math.max(0, Math.min(outMin, rules.segments[i + 1].start) - Math.max(inMin, rules.segments[i].end));
        }
        return round2((elapsed - gap) / 60);
    }

    /** Recompute hours, overtime, early departure and status from the record's times. */
    private applyTimes(record: any, rules: ShiftRules, timezone: string, forceStatus?: string) {
        const lateStatus = localMinutesOfDay(record.clockIn, timezone) > rules.lateAfter ? 'late' : 'present';
        if (record.clockOut) {
            const hours = this.workedHours(record, rules, timezone);
            record.hoursWorked = hours;
            record.overtime = round2(Math.max(0, hours - rules.stdHours));
            const outMin = localMinutesOfDay(record.clockIn, timezone) + (record.clockOut.getTime() - record.clockIn.getTime()) / 60_000;
            record.earlyDeparture = outMin < rules.shiftEnd;
            record.status = forceStatus ?? (hours < rules.stdHours / 2 ? 'half_day' : lateStatus);
        } else {
            record.hoursWorked = undefined;
            record.overtime = 0;
            record.earlyDeparture = false;
            record.status = forceStatus ?? lateStatus;
        }
    }

    /**
     * A punch just after midnight belongs to the previous day when that day's shift ran past midnight
     * (up to 4 hours after the shift's end, so a late check-out or a repeat punch still lands on it).
     * Returns that day's record and its rules, or null when the punch is an ordinary one.
     */
    async overnightRecordFor(
        tenantId: mongoose.Types.ObjectId | string,
        staffId: mongoose.Types.ObjectId | string,
        at: Date,
        sched?: ScheduleResolver
    ): Promise<{ record: any; rules: ShiftRules } | null> {
        const schedule = sched ?? await this.schedule(tenantId, staffId);
        const todayStart = dayBoundsUTC(at, schedule.timezone).start;
        const prev = dayBoundsUTC(new Date(todayStart.getTime() - 3_600_000), schedule.timezone);
        const rules = schedule.at(prev.start);
        if (!rules.overnight) return null;
        if (at.getTime() > prev.start.getTime() + (rules.shiftEnd + 240) * 60_000) return null;

        const record: any = await StaffAttendance.findOne({ tenantId: toId(tenantId), staffId: toId(staffId), date: { $gte: prev.start, $lte: prev.end } });
        if (!record || ['absent', 'paid_leave'].includes(record.status) || at <= record.clockIn) return null;
        return { record, rules };
    }

    async recordPunch(input: StaffPunchInput): Promise<StaffPunchResult> {
        const tenantId = toId(input.tenantId);
        const staffId = toId(input.staffId);
        const { punchTime, timezone, dedupeMinutes } = input;

        const sched = await this.schedule(tenantId, staffId);
        const overnight = await this.overnightRecordFor(tenantId, staffId, punchTime, sched);
        const rules = overnight?.rules ?? sched.at(punchTime);
        const { start: dayStart, end: dayEnd } = dayBoundsUTC(punchTime, timezone);
        let record = overnight?.record ?? await StaffAttendance.findOne({ tenantId, staffId, date: { $gte: dayStart, $lte: dayEnd } });

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
    async clockIn(tenantId: mongoose.Types.ObjectId | string, staffId: mongoose.Types.ObjectId | string, branchId?: mongoose.Types.ObjectId | string, now = new Date(), source: 'manual' | 'face' = 'manual') {
        const tId = toId(tenantId);
        const sId = toId(staffId);
        const { timezone, start, end } = await this.dayWindow(tId, now);
        const overnight = await this.overnightRecordFor(tId, sId, now);
        if (overnight && !overnight.record.clockOut) throw new StaffAttendanceError(400, 'Already clocked in. Please clock out first.');
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
            date: start, clockIn: now, source, punchCount: 0,
        });
        this.applyTimes(record, await this.rulesFor(tId, sId, now), timezone);
        await record.save();
        return record;
    }

    /** Self-service clock-out. */
    async clockOut(tenantId: mongoose.Types.ObjectId | string, staffId: mongoose.Types.ObjectId | string, now = new Date(), source?: 'face') {
        const tId = toId(tenantId);
        const sId = toId(staffId);
        const { timezone, start, end } = await this.dayWindow(tId, now);
        const overnight = await this.overnightRecordFor(tId, sId, now);
        const record: any = (overnight && !overnight.record.clockOut ? overnight.record : null) ?? await StaffAttendance.findOne({
            tenantId: tId, staffId: sId, date: { $gte: start, $lte: end }, clockOut: { $exists: false },
            status: { $nin: ['absent', 'paid_leave'] },
        });
        if (!record) throw new StaffAttendanceError(404, 'No active clock-in found for today.');
        record.clockOut = now;
        if (source && record.source === 'manual') record.source = source;   // a biometric check-in stays biometric
        this.applyTimes(record, await this.rulesFor(tId, sId, record.clockIn), timezone);
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

        let record: any = null;
        if (input.recordId) {
            record = await StaffAttendance.findOne({ _id: input.recordId, tenantId });
            if (!record) throw new Error('Attendance record not found');
        }

        const reference = input.clockIn ?? record?.clockIn ?? input.day;
        if (!reference) throw new Error('A date or check-in time is required');
        const { timezone, start: dayStart, end: dayEnd } = await this.dayWindow(tenantId, reference);
        const rules = await this.rulesFor(tenantId, staffId, reference);

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
        if (record.clockOut && record.clockOut <= record.clockIn && rules.overnight) {
            record.clockOut = new Date(record.clockOut.getTime() + 24 * 3_600_000);   // 01:00 after a 16:00 start is the next day
        }
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
