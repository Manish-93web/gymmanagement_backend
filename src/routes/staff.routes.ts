import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import * as staffController from '../controllers/staff.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import StaffAttendance from '../models/StaffAttendance.model';
import StaffDeductionSettings from '../models/StaffDeductionSettings.model';
import User from '../models/User.model';
import BiometricSettings from '../models/BiometricSettings.model';
import StaffPayrollService from '../services/staff-payroll.service';
import StaffAttendanceService, { StaffAttendanceError } from '../services/staff-attendance.service';
import { dayBoundsUTC, monthBoundsUTC } from '../utils/tz.utils';

function safeObjectId(val: any): mongoose.Types.ObjectId | undefined {
    return val && mongoose.Types.ObjectId.isValid(val) ? new mongoose.Types.ObjectId(String(val)) : undefined;
}

const router = Router();

router.use(authenticate);

// Staff routes
router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffList);
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.createStaffMember);
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffStats);

// ─── Staff Clock-In/Out ───────────────────────────────────────────────────────

// Staff Clock-In (day record shared with biometric punches)
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const rawTenantId = (req as any).tenantId || (req as any).user?.tenantId?.toString();
    const rawStaffId = req.body?.staffId || (req as any).user?._id?.toString();
    if (!rawTenantId) return res.status(400).json({ success: false, message: 'Tenant not found. Please log out and log back in.' });
    if (!rawStaffId) return res.status(400).json({ success: false, message: 'Staff ID is required.' });

    const tenantId = safeObjectId(rawTenantId);
    const staffId = safeObjectId(rawStaffId);
    const branchId = safeObjectId((req as any).branchId);
    if (!tenantId) return res.status(400).json({ success: false, message: 'Invalid tenant ID. Please log out and log back in.' });
    if (!staffId) return res.status(400).json({ success: false, message: 'Invalid staff ID.' });

    const record = await StaffAttendanceService.clockIn(tenantId, staffId, branchId);
    return res.status(201).json({ success: true, data: record, message: `Clocked in at ${record.clockIn.toLocaleTimeString()}` });
  } catch (err: any) {
    if (err instanceof StaffAttendanceError) return res.status(err.status).json({ success: false, message: err.message });
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Already clocked in for today.' });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Staff Clock-Out
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const rawTenantId = (req as any).tenantId || (req as any).user?.tenantId?.toString();
    const rawStaffId = req.body?.staffId || (req as any).user?._id?.toString();
    if (!rawTenantId) return res.status(400).json({ success: false, message: 'Tenant not found. Please log out and log back in.' });
    if (!rawStaffId) return res.status(400).json({ success: false, message: 'Staff ID is required.' });

    const tenantId = safeObjectId(rawTenantId);
    const staffId = safeObjectId(rawStaffId);
    if (!tenantId) return res.status(400).json({ success: false, message: 'Invalid tenant ID. Please log out and log back in.' });
    if (!staffId) return res.status(400).json({ success: false, message: 'Invalid staff ID.' });

    const updated = await StaffAttendanceService.clockOut(tenantId, staffId);
    return res.json({ success: true, data: updated, message: `Clocked out after ${updated.hoursWorked} hours` });
  } catch (err: any) {
    if (err instanceof StaffAttendanceError) return res.status(err.status).json({ success: false, message: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get today's clock-in status for current user
router.get('/clock-status', async (req: Request, res: Response) => {
  try {
    const tenantId = safeObjectId((req as any).tenantId || (req as any).user?.tenantId?.toString());
    const staffId = safeObjectId(req.query.staffId as string || (req as any).user?._id?.toString());
    const { start: todayStart, end: todayEnd } = await StaffAttendanceService.dayWindow(tenantId as any, new Date());
    const record = await StaffAttendance.findOne({ tenantId, staffId, date: { $gte: todayStart, $lte: todayEnd } });
    if (!record) {
      return res.json({ success: true, data: { isClockedIn: false, clockInTime: null, hoursWorkedToday: 0 } });
    }
    const nowMs = Date.now();
    const hoursWorkedToday = record.clockOut
      ? (record.hoursWorked ?? 0)
      : parseFloat(((nowMs - new Date(record.clockIn).getTime()) / (1000 * 60 * 60)).toFixed(2));
    return res.json({
      success: true,
      data: {
        isClockedIn: !record.clockOut,
        clockInTime: record.clockIn,
        hoursWorkedToday,
        status: record.status,
        record,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get staff attendance records
router.get('/attendance', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { staffId, startDate, endDate, page = '1', limit = '30' } = req.query;
    const filter: any = { tenantId };
    if (staffId) filter.staffId = staffId;
    if (startDate || endDate) {
      // Plain YYYY-MM-DD values are calendar days in the tenant's timezone (records are dated at local midnight).
      const tzSettings: any = await BiometricSettings.findOne({ tenantId }).select('timezone').lean();
      const tz = tzSettings?.timezone || 'Asia/Kolkata';
      const isDay = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
      filter.date = {};
      if (startDate) filter.date.$gte = isDay(startDate) ? dayBoundsUTC(new Date(`${startDate}T12:00:00Z`), tz).start : new Date(startDate as string);
      if (endDate) filter.date.$lte = isDay(endDate) ? dayBoundsUTC(new Date(`${endDate}T12:00:00Z`), tz).end : new Date(endDate as string);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      StaffAttendance.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).populate('staffId', 'firstName lastName email role'),
      StaffAttendance.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { records, total } });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get attendance summary (for payroll)
router.get('/attendance/summary', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { staffId, month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59);
    const filter: any = { tenantId, date: { $gte: startDate, $lte: endDate } };
    if (staffId) filter.staffId = staffId;
    const records = await StaffAttendance.find(filter).populate('staffId', 'firstName lastName email role');

    // Group by staff
    const summary: Record<string, any> = {};
    records.forEach(r => {
      const sid = r.staffId?.toString() || '';
      if (!summary[sid]) {
        summary[sid] = {
          staffId: sid,
          name: (r.staffId as any)?.name || '',
          presentDays: 0,
          lateDays: 0,
          halfDays: 0,
          absentDays: 0,
          totalHours: 0,
        };
      }
      if (r.status === 'present') summary[sid].presentDays++;
      if (r.status === 'late') summary[sid].lateDays++;
      if (r.status === 'half_day') summary[sid].halfDays++;
      if (r.status === 'absent') summary[sid].absentDays++;
      summary[sid].totalHours += r.hoursWorked || 0;
    });
    return res.json({ success: true, data: Object.values(summary) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Today's live attendance board ───────────────────────────────────────────

router.get('/attendance/today', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const tzSettings: any = await BiometricSettings.findOne({ tenantId }).select('timezone').lean();
    const { start, end } = dayBoundsUTC(new Date(), tzSettings?.timezone || 'Asia/Kolkata');
    const [users, records] = await Promise.all([
      User.find({ tenantId, role: { $in: ['trainer', 'staff', 'branch_manager', 'accountant'] }, isActive: true })
        .select('firstName lastName role').lean(),
      StaffAttendance.find({ tenantId, date: { $gte: start, $lte: end } }).lean(),
    ]);
    const byStaff = new Map(records.map(r => [String(r.staffId), r]));
    const board = users.map((u: any) => {
      const r: any = byStaff.get(String(u._id));
      return {
        staffId: String(u._id),
        name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim(),
        role: u.role,
        state: !r ? 'not_in' : r.clockOut ? 'checked_out' : 'checked_in',
        clockIn: r?.clockIn ?? null,
        clockOut: r?.clockOut ?? null,
        status: r?.status ?? null,
        source: r?.source ?? null,
      };
    });
    return res.json({ success: true, data: board });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Owner corrections (missed punch, manual day, paid leave / absent) ────────

/** "09:30" on the local day starting at `dayStart` -> instant */
function atLocalTime(dayStart: Date, hhmm: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!m) return null;
  return new Date(dayStart.getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60_000);
}

const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'half_day', 'paid_leave'];

router.post('/attendance', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { staffId, date, clockIn, clockOut, status, notes } = req.body || {};
    if (!safeObjectId(staffId) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return res.status(400).json({ success: false, message: 'staffId and date (YYYY-MM-DD) are required' });
    }
    if (status && !ATTENDANCE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const staff: any = await User.findOne({ _id: staffId, tenantId }).select('branchId').lean();
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found' });

    const win = await StaffAttendanceService.dayWindow(tenantId, new Date(`${date}T12:00:00Z`));
    const dayOff = status === 'absent' || status === 'paid_leave';
    const inAt = clockIn ? atLocalTime(win.start, clockIn) : null;
    const outAt = clockOut ? atLocalTime(win.start, clockOut) : undefined;
    if (!dayOff && !inAt) return res.status(400).json({ success: false, message: 'Check-in time (HH:mm) is required' });

    const record = await StaffAttendanceService.correct({
      tenantId, staffId, branchId: staff.branchId, day: win.start,
      clockIn: inAt ?? undefined, clockOut: outAt, status, notes, adjustedBy: (req as any).user?._id?.toString(),
    });
    return res.status(201).json({ success: true, data: record });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

router.patch('/attendance/:recordId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const existing: any = await StaffAttendance.findOne({ _id: String(req.params.recordId), tenantId }).lean();
    if (!existing) return res.status(404).json({ success: false, message: 'Attendance record not found' });

    const { clockIn, clockOut, status, notes } = req.body || {};
    if (status && !ATTENDANCE_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const win = await StaffAttendanceService.dayWindow(tenantId, existing.date);
    const parse = (v: any) => (v === null || v === '' ? null : typeof v === 'string' && v.includes(':') && !v.includes('T') ? atLocalTime(win.start, v) : v ? new Date(v) : undefined);
    const inAt = parse(clockIn);
    const outAt = parse(clockOut);

    const record = await StaffAttendanceService.correct({
      tenantId, staffId: existing.staffId, recordId: String(req.params.recordId),
      clockIn: inAt ?? undefined, clockOut: outAt as any, status, notes, adjustedBy: (req as any).user?._id?.toString(),
    });
    return res.json({ success: true, data: record });
  } catch (err: any) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// ─── My attendance + pay (trainer / staff self-service) ───────────────────────

router.get('/me/attendance', async (req: Request, res: Response) => {
  try {
    const user: any = (req as any).user;
    const tenantId = (req as any).tenantId || user?.tenantId;
    const staffId = user?._id?.toString();
    if (!tenantId || !staffId) return res.status(400).json({ success: false, message: 'Tenant not found' });

    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const tz = (await StaffAttendanceService.dayWindow(tenantId, new Date())).timezone;
    const { start, end } = monthBoundsUTC(year, month, tz);
    const today = await StaffAttendanceService.dayWindow(tenantId, new Date());

    const [records, todayRecord, pay] = await Promise.all([
      StaffAttendance.find({ tenantId, staffId, date: { $gte: start, $lte: end } }).sort({ date: -1 }).lean(),
      StaffAttendance.findOne({ tenantId, staffId, date: { $gte: today.start, $lte: today.end } }).lean(),
      StaffPayrollService.getForStaff(tenantId, staffId, month, year),
    ]);
    return res.json({
      success: true,
      data: {
        today: todayRecord
          ? { state: (todayRecord as any).clockOut ? 'checked_out' : 'checked_in', clockIn: (todayRecord as any).clockIn, clockOut: (todayRecord as any).clockOut ?? null, status: (todayRecord as any).status, source: (todayRecord as any).source }
          : { state: 'not_in', clockIn: null, clockOut: null, status: null, source: null },
        records,
        pay,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Payroll ──────────────────────────────────────────────────────────────────

// Attendance-based payroll for all staff for a month (draft until generated, then saved / paid)
router.get('/payroll', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const month = Number(req.query.month) || new Date().getMonth() + 1;
    const year = Number(req.query.year) || new Date().getFullYear();
    const rows = await StaffPayrollService.listForMonth(tenantId, month, year);
    return res.json({ success: true, data: rows });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Generate payslips for a month from attendance
router.post('/payroll/run', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const month = Number(req.body?.month);
    const year = Number(req.body?.year);
    if (!(month >= 1 && month <= 12) || !year) {
      return res.status(400).json({ success: false, message: 'month (1-12) and year are required' });
    }
    const result = await StaffPayrollService.run(tenantId, month, year, (req as any).user?._id?.toString());
    return res.json({ success: true, data: result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/payroll/:payrollId/paid', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const updated = await StaffPayrollService.markPaid((req as any).tenantId, String(req.params.payrollId));
    if (!updated) return res.status(404).json({ success: false, message: 'Payslip not found. Generate payroll first.' });
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id/payroll-summary', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const staffId = String(req.params.id);
    const { startDate, endDate } = req.query;
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    let data;
    if (month >= 1 && month <= 12 && year) {
      data = await StaffPayrollService.computeForMonth(tenantId, staffId, month, year);
    } else {
      const start = startDate ? new Date(startDate as string) : new Date(0);
      const end = endDate ? new Date(endDate as string) : new Date();
      data = await StaffPayrollService.compute(tenantId, staffId, { start, end, month: start.getMonth() + 1, year: start.getFullYear() });
    }
    return res.json({ success: true, data });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Deduction Settings ───────────────────────────────────────────────────────

router.get('/deduction-settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const settings = await StaffDeductionSettings.findOne({ tenantId }).lean();
    return res.json({
      success: true,
      data: settings ?? {
        deductionPerAbsentDay:      1.0,
        deductionPerLate:           50,
        deductionPerEarlyDeparture: 0,
        graceMinutes:               10,
        lateAfterTime:              '09:30',
        shiftEndTime:               '18:00',
        standardHoursPerDay:        8,
        workingDaysPerMonth:        26,
        overtimeMultiplier:         1.5,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/deduction-settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const allowed = ['deductionPerAbsentDay', 'deductionPerLate', 'deductionPerEarlyDeparture',
      'lateAfterTime', 'shiftEndTime', 'standardHoursPerDay', 'workingDaysPerMonth', 'overtimeMultiplier', 'graceMinutes'];
    const update: Record<string, any> = {};
    for (const key of allowed) if (req.body[key] !== undefined) update[key] = req.body[key];
    const updated = await StaffDeductionSettings.findOneAndUpdate(
      { tenantId },
      { $set: update },
      { upsert: true, new: true, runValidators: true }
    );
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(err.name === 'ValidationError' ? 400 : 500).json({ success: false, message: err.message });
  }
});

// ─── Parameterised staff routes (must come after fixed-path routes) ───────────

router.get('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffMember);
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.updateStaffMember);
router.delete('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.deleteStaffMember);
router.patch('/:id/status', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.updateStaffStatus);

export default router;
