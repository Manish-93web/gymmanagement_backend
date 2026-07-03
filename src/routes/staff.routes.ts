import { Router, Request, Response } from 'express';
import * as staffController from '../controllers/staff.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import StaffAttendance from '../models/StaffAttendance.model';

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
    const tenantId = (req as any).tenantId;
    const staffId = req.body.staffId || (req as any).user?._id;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    // Check if already clocked in today
    const existing = await StaffAttendance.findOne({ tenantId, staffId, date: today });
    if (existing && !existing.clockOut) {
      return res.status(400).json({ success: false, message: 'Already clocked in. Please clock out first.' });
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
    const tenantId = (req as any).tenantId;
    const staffId = req.body.staffId || (req as any).user?._id;
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);

    const record = await StaffAttendance.findOne({ tenantId, staffId, date: today, clockOut: { $exists: false } });
    if (!record) {
      return res.status(404).json({ success: false, message: 'No active clock-in found for today.' });
    }

    const hoursWorked = parseFloat(((now.getTime() - record.clockIn.getTime()) / (1000 * 60 * 60)).toFixed(2));
    const updated = await StaffAttendance.findByIdAndUpdate(record._id, {
      clockOut: now,
      hoursWorked,
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
    const tenantId = (req as any).tenantId;
    const staffId = req.query.staffId as string || (req as any).user?._id?.toString();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const record = await StaffAttendance.findOne({ tenantId, staffId, date: today });
    return res.json({ success: true, data: record });
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

// ─── Parameterised staff routes (must come after fixed-path routes) ───────────

router.get('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.getStaffMember);
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.updateStaffMember);
router.patch('/:id/status', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), staffController.updateStaffStatus);

export default router;
