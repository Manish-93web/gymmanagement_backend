import { Router, Request, Response } from 'express';
import * as staffController from '../controllers/staff.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import StaffAttendance from '../models/StaffAttendance.model';
import StaffDeductionSettings from '../models/StaffDeductionSettings.model';
import User from '../models/User.model';

const router = Router();

router.use(authenticate);

// Staff routes
router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffList);
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.createStaffMember);
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffStats);

// ─── Staff Clock-In/Out ───────────────────────────────────────────────────────

// Staff Clock-In
router.post('/clock-in', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId?.toString();
    const staffId = req.body.staffId || (req as any).user?._id;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant not found. Please log out and log back in.' });
    if (!staffId) return res.status(400).json({ success: false, message: 'Staff ID is required.' });
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    // Check if already has a record today
    const existing = await StaffAttendance.findOne({ tenantId, staffId, date: today });
    if (existing) {
      if (!existing.clockOut) {
        return res.status(400).json({ success: false, message: 'Already clocked in. Please clock out first.' });
      }
      return res.status(400).json({ success: false, message: 'You have already completed your shift for today.' });
    }

    // Determine status (late if after 9:30 AM)
    const hour = now.getHours();
    const min = now.getMinutes();
    const status = (hour > 9 || (hour === 9 && min > 30)) ? 'late' : 'present';

    const record = await StaffAttendance.create({
      tenantId,
      branchId: (req as any).branchId,
      staffId,
      date: today,
      clockIn: now,
      status,
    });

    return res.status(201).json({ success: true, data: record, message: `Clocked in at ${now.toLocaleTimeString()}` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Staff Clock-Out
router.post('/clock-out', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId?.toString();
    const staffId = req.body.staffId || (req as any).user?._id;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant not found. Please log out and log back in.' });
    if (!staffId) return res.status(400).json({ success: false, message: 'Staff ID is required.' });
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    const record = await StaffAttendance.findOne({ tenantId, staffId, date: today, clockOut: { $exists: false } });
    if (!record) {
      return res.status(404).json({ success: false, message: 'No active clock-in found for today.' });
    }

    const hoursWorked = parseFloat(((now.getTime() - record.clockIn.getTime()) / (1000 * 60 * 60)).toFixed(2));
    const overtime = parseFloat(Math.max(0, hoursWorked - 8).toFixed(2));

    // Determine early departure: clocked out before 18:00 (configurable in future via tenant config)
    const shiftEndHour = 18;
    const shiftEndMinute = 0;
    const clockOutHour = now.getHours();
    const clockOutMinute = now.getMinutes();
    const isEarlyDeparture =
      clockOutHour < shiftEndHour ||
      (clockOutHour === shiftEndHour && clockOutMinute < shiftEndMinute);

    const updated = await StaffAttendance.findByIdAndUpdate(record._id, {
      clockOut: now,
      hoursWorked,
      overtime,
      earlyDeparture: isEarlyDeparture,
      status: hoursWorked < 4 ? 'half_day' : record.status,
    }, { new: true });

    return res.json({ success: true, data: updated, message: `Clocked out after ${hoursWorked} hours` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get today's clock-in status for current user
router.get('/clock-status', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId?.toString();
    const staffId = req.query.staffId as string || (req as any).user?._id?.toString();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const record = await StaffAttendance.findOne({ tenantId, staffId, date: today });
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
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate as string);
      if (endDate) filter.date.$lte = new Date(endDate as string);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [records, total] = await Promise.all([
      StaffAttendance.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit)).populate('staffId', 'name email'),
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
    const records = await StaffAttendance.find(filter).populate('staffId', 'name email');

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

// ─── Payroll summary ──────────────────────────────────────────────────────────

router.get('/:id/payroll-summary', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const staffId = req.params.id;
    const { startDate, endDate } = req.query;

    const filter: any = { tenantId, staffId };
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate as string);
      if (endDate) filter.date.$lte = new Date(endDate as string);
    }

    const [records, staffUser, deductionSettings] = await Promise.all([
      StaffAttendance.find(filter),
      User.findById(staffId).select('salary firstName lastName'),
      StaffDeductionSettings.findOne({ tenantId }).lean(),
    ]);

    const totalHours = records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0);
    const overtimeHours = records.reduce((sum, r) => {
      const h = r.hoursWorked || 0;
      return sum + Math.max(0, h - 8);
    }, 0);
    const workingDays = records.filter(r => r.status !== 'absent').length;
    const absentDays  = records.filter(r => r.status === 'absent').length;
    const lateCount   = records.filter(r => r.status === 'late').length;

    const monthlySalary = (staffUser as any)?.salary || 0;
    const hourlyRate = monthlySalary > 0 ? monthlySalary / (26 * 8) : 0;
    const dailyRate  = monthlySalary > 0 ? monthlySalary / 26 : 0;
    const regularHours = Math.max(0, totalHours - overtimeHours);
    const basePay      = hourlyRate * regularHours;
    const overtimePay  = hourlyRate * 1.5 * overtimeHours;

    // Deduction rates — fall back to defaults when no settings document exists
    const absentFactor      = (deductionSettings as any)?.deductionPerAbsentDay      ?? 1.0;
    const lateFixed         = (deductionSettings as any)?.deductionPerLate           ?? 50;
    const earlyDepFactor    = (deductionSettings as any)?.deductionPerEarlyDeparture ?? 0.5;

    // Absent day deduction
    const absentDayDeduction = absentDays * dailyRate * absentFactor;

    // Late deduction (fixed amount per late clock-in)
    const lateDeduction = lateCount * lateFixed;

    // Early departure deduction: only when < 4 hours were missed (≥4h short is already half_day status)
    const earlyDepartures = records.filter(r => r.earlyDeparture === true).length;
    const earlyDepartureDeduction = records.reduce((sum, r) => {
      if (!r.earlyDeparture) return sum;
      const hoursShort = 8 - (r.hoursWorked || 0);
      return hoursShort < 4 ? sum + dailyRate * earlyDepFactor : sum;
    }, 0);

    const deductions = parseFloat((absentDayDeduction + lateDeduction + earlyDepartureDeduction).toFixed(2));
    const netPay     = parseFloat(Math.max(0, basePay + overtimePay - deductions).toFixed(2));

    return res.json({
      success: true,
      data: {
        staffId,
        staffName: staffUser ? `${(staffUser as any).firstName} ${(staffUser as any).lastName}`.trim() : '',
        totalHours:    parseFloat(totalHours.toFixed(2)),
        overtimeHours: parseFloat(overtimeHours.toFixed(2)),
        workingDays,
        absentDays,
        lateCount,
        earlyDepartures,
        basePay:               parseFloat(basePay.toFixed(2)),
        overtimePay:           parseFloat(overtimePay.toFixed(2)),
        absentDayDeduction:    parseFloat(absentDayDeduction.toFixed(2)),
        lateDeduction:         parseFloat(lateDeduction.toFixed(2)),
        earlyDepartureDeduction: parseFloat(earlyDepartureDeduction.toFixed(2)),
        deductions,
        netPay,
      },
    });
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
        deductionPerEarlyDeparture: 0.5,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/deduction-settings', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { deductionPerAbsentDay, deductionPerLate, deductionPerEarlyDeparture } = req.body;
    const updated = await StaffDeductionSettings.findOneAndUpdate(
      { tenantId },
      { $set: { deductionPerAbsentDay, deductionPerLate, deductionPerEarlyDeparture } },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Parameterised staff routes (must come after fixed-path routes) ───────────

router.get('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffMember);
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.updateStaffMember);
router.patch('/:id/status', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.updateStaffStatus);

export default router;
