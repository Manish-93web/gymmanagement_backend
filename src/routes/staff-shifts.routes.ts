import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { requireAnyRole } from '../middleware/rbac.middleware';
import StaffShift from '../models/StaffShift.model';
import StaffShiftAssignment from '../models/StaffShiftAssignment.model';
import User from '../models/User.model';
import Trainer from '../models/Trainer.model';
import StaffAttendanceService from '../services/staff-attendance.service';
import { hhmmToMinutes, localDateString } from '../utils/tz.utils';

/** Mounted under /staff/shifts (authentication is applied by the parent router). */
const router = Router();
const OWNERS = requireAnyRole('gym_owner', 'branch_manager', 'super_admin');
const PAYABLE_ROLES = ['trainer', 'staff', 'branch_manager', 'accountant'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const isId = (v: any) => typeof v === 'string' && mongoose.Types.ObjectId.isValid(v);

/** Validates and normalises the windows of a shift. Returns an error message or the cleaned segments. */
function checkSegments(raw: any): { error: string } | { segments: { startTime: string; endTime: string }[] } {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 3) return { error: 'A shift needs 1 to 3 time windows' };
    const segments: { startTime: string; endTime: string }[] = [];
    let total = 0;
    let previousEnd = -1;
    let firstStart = 0;
    for (let i = 0; i < raw.length; i++) {
        const g = raw[i];
        if (!HHMM.test(g?.startTime || '') || !HHMM.test(g?.endTime || '')) return { error: 'Times must look like 06:00' };
        const start = hhmmToMinutes(g.startTime, 0);
        let end = hhmmToMinutes(g.endTime, 0);
        // An end at or before the start means the window runs past midnight into the next day. Only the last
        // window can, and it must be over before the first window starts again the next day.
        if (end <= start) {
            if (i !== raw.length - 1) return { error: 'Only the last window can run past midnight' };
            end += 24 * 60;
            if (end - 24 * 60 > firstStart && i > 0) return { error: 'The last window must end before the first one starts the next day' };
        }
        if (end - start < 30) return { error: 'Each window must be at least 30 minutes long' };
        if (end - start > 16 * 60) return { error: 'A window can be at most 16 hours long' };
        if (start < previousEnd) return { error: 'Windows must be in order and must not overlap' };
        if (i === 0) firstStart = start;
        previousEnd = end;
        total += end - start;
        segments.push({ startTime: g.startTime, endTime: g.endTime });
    }
    if (total < 60) return { error: 'A shift must add up to at least 1 hour' };
    return { segments };
}

async function today(tenantId: any) {
    const { timezone } = await StaffAttendanceService.dayWindow(tenantId, new Date());
    return localDateString(new Date(), timezone);
}

/** The assignment in force on `day` for each staff member, from a list sorted by effectiveFrom. */
function inForce(assignments: any[], day: string) {
    const byStaff = new Map<string, any>();
    for (const a of assignments) if (a.effectiveFrom <= day) byStaff.set(String(a.staffId), a);
    return byStaff;
}

// ─── Shift library ────────────────────────────────────────────────────────────

router.get('/', OWNERS, async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const [shifts, assignments, day] = await Promise.all([
            StaffShift.find({ tenantId, isActive: true }).sort({ createdAt: 1 }).lean(),
            StaffShiftAssignment.find({ tenantId }).sort({ effectiveFrom: 1 }).lean(),
            today(tenantId),
        ]);
        const current = inForce(assignments, day);
        const counts = new Map<string, number>();
        for (const a of current.values()) if (a.shiftId) counts.set(String(a.shiftId), (counts.get(String(a.shiftId)) ?? 0) + 1);
        return res.json({ success: true, data: shifts.map(s => ({ ...s, staffCount: counts.get(String(s._id)) ?? 0 })) });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/', OWNERS, async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const name = String(req.body?.name ?? '').trim();
        if (!name || name.length > 40) return res.status(400).json({ success: false, message: 'Give the shift a name of up to 40 characters' });
        const checked = checkSegments(req.body?.segments);
        if ('error' in checked) return res.status(400).json({ success: false, message: checked.error });
        const shift = await StaffShift.create({ tenantId, name, segments: checked.segments });
        return res.status(201).json({ success: true, data: shift });
    } catch (err: any) {
        if (err?.code === 11000) return res.status(409).json({ success: false, message: 'A shift with this name already exists' });
        return res.status(400).json({ success: false, message: err.message });
    }
});

router.put('/:id', OWNERS, async (req: Request, res: Response, next: NextFunction) => {
    if (req.params.id === 'assignments') return next();   // the bulk-assign route below
    try {
        const tenantId = (req as any).tenantId;
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid shift' });
        const update: any = {};
        if (req.body?.name !== undefined) {
            const name = String(req.body.name).trim();
            if (!name || name.length > 40) return res.status(400).json({ success: false, message: 'Give the shift a name of up to 40 characters' });
            update.name = name;
        }
        if (req.body?.segments !== undefined) {
            const checked = checkSegments(req.body.segments);
            if ('error' in checked) return res.status(400).json({ success: false, message: checked.error });
            update.segments = checked.segments;
        }
        const shift = await StaffShift.findOneAndUpdate({ _id: req.params.id, tenantId, isActive: true }, { $set: update }, { new: true });
        if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });
        return res.json({ success: true, data: shift });
    } catch (err: any) {
        if (err?.code === 11000) return res.status(409).json({ success: false, message: 'A shift with this name already exists' });
        return res.status(400).json({ success: false, message: err.message });
    }
});

router.delete('/:id', OWNERS, async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        if (!isId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid shift' });
        // A shift anyone has ever been given stays, because past days are judged by it.
        const used = await StaffShiftAssignment.countDocuments({ tenantId, shiftId: req.params.id });
        if (used > 0) {
            return res.status(409).json({ success: false, message: 'This shift is, or was, assigned to staff. Move them to another shift first; it is kept for past attendance.' });
        }
        const gone = await StaffShift.findOneAndDelete({ _id: req.params.id, tenantId });
        if (!gone) return res.status(404).json({ success: false, message: 'Shift not found' });
        return res.json({ success: true });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Who works which shift ────────────────────────────────────────────────────

router.get('/assignments', OWNERS, async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const day = await today(tenantId);
        const [users, assignments, shifts, trainers] = await Promise.all([
            User.find({ tenantId, role: { $in: PAYABLE_ROLES as any }, isActive: true }).select('firstName lastName role').sort({ firstName: 1 }).lean(),
            StaffShiftAssignment.find({ tenantId }).sort({ effectiveFrom: 1 }).lean(),
            StaffShift.find({ tenantId, isActive: true }).lean(),
            Trainer.find({ tenantId }).select('userId shift').lean(),
        ]);
        const current = inForce(assignments, day);
        const upcoming = new Map<string, any>();
        for (const a of assignments) if (a.effectiveFrom > day && !upcoming.has(String(a.staffId))) upcoming.set(String(a.staffId), a);
        const shiftById = new Map(shifts.map(s => [String(s._id), s]));
        const legacy = new Map(trainers.filter((t: any) => t.shift?.startTime && t.shift?.endTime).map((t: any) => [String(t.userId), t.shift]));

        const rows = users.map((u: any) => {
            const id = String(u._id);
            const cur = current.get(id);
            const nxt = upcoming.get(id);
            const shift = cur?.shiftId ? shiftById.get(String(cur.shiftId)) : null;
            const nextShift = nxt?.shiftId ? shiftById.get(String(nxt.shiftId)) : null;
            return {
                staffId: id,
                name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
                role: u.role,
                shiftId: shift ? String(shift._id) : null,
                shiftName: shift?.name ?? null,
                weeklyOff: cur?.weeklyOff ?? [],
                effectiveFrom: cur?.effectiveFrom ?? null,
                // an older single shift set on the trainer profile, used until a shift is assigned
                legacyShift: !cur && legacy.get(id) ? legacy.get(id) : null,
                upcoming: nxt ? { effectiveFrom: nxt.effectiveFrom, shiftName: nextShift?.name ?? null, weeklyOff: nxt.weeklyOff } : null,
            };
        });
        return res.json({ success: true, data: rows });
    } catch (err: any) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Give one or many staff members a shift and weekly off days from a date (today by default).
 * shiftId null = gym default hours. Weekly off days not sent are kept as they are.
 */
router.put('/assignments', OWNERS, async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const { staffIds, shiftId, weeklyOff, effectiveFrom } = req.body || {};

        if (!Array.isArray(staffIds) || staffIds.length < 1 || staffIds.length > 200 || !staffIds.every(isId)) {
            return res.status(400).json({ success: false, message: 'Choose at least one staff member' });
        }
        if (shiftId !== null && shiftId !== undefined && !isId(shiftId)) return res.status(400).json({ success: false, message: 'Invalid shift' });
        if (shiftId === undefined) return res.status(400).json({ success: false, message: 'Choose a shift, or "gym default"' });
        if (weeklyOff !== undefined) {
            const ok = Array.isArray(weeklyOff) && weeklyOff.every((d: any) => Number.isInteger(d) && d >= 0 && d <= 6);
            if (!ok || new Set(weeklyOff).size !== weeklyOff.length || weeklyOff.length > 6) {
                return res.status(400).json({ success: false, message: 'Weekly off must be 0 to 6 days of the week (0 = Sunday), not every day' });
            }
        }
        const day = await today(tenantId);
        if (effectiveFrom !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
            return res.status(400).json({ success: false, message: 'Start date must look like 2026-11-01' });
        }
        const from: string = effectiveFrom ?? day;

        if (shiftId) {
            const shift = await StaffShift.findOne({ _id: shiftId, tenantId, isActive: true }).select('_id').lean();
            if (!shift) return res.status(404).json({ success: false, message: 'Shift not found' });
        }
        const users = await User.find({ _id: { $in: staffIds }, tenantId, role: { $in: PAYABLE_ROLES as any } }).select('_id').lean();
        if (users.length !== new Set(staffIds).size) {
            return res.status(404).json({ success: false, message: 'Some of the chosen people are not staff of this gym' });
        }

        const existing = await StaffShiftAssignment.find({ tenantId, staffId: { $in: staffIds } }).sort({ effectiveFrom: 1 }).lean();
        const createdBy = (req as any).user?._id?.toString();
        for (const staffId of new Set<string>(staffIds)) {
            const inheritedOff = existing.filter((a: any) => String(a.staffId) === staffId && a.effectiveFrom <= from).pop()?.weeklyOff ?? [];
            await StaffShiftAssignment.findOneAndUpdate(
                { tenantId, staffId, effectiveFrom: from },
                { $set: { shiftId: shiftId ?? null, weeklyOff: weeklyOff ?? inheritedOff, ...(createdBy && { createdBy }) } },
                { upsert: true, new: true }
            );
        }
        return res.json({ success: true, data: { updated: new Set(staffIds).size, effectiveFrom: from } });
    } catch (err: any) {
        return res.status(400).json({ success: false, message: err.message });
    }
});

export default router;
