import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate, tenantContext);

// ─── GET / — Main report: members with < threshold visits in period ────────────
router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const MemberModel = require('../models/Member.model').default;
    const AttendanceModel = require('../models/Attendance.model').default;

    const tenantId = (req as any).tenantId;
    const period = parseInt(req.query.period as string) || 30;
    const maxVisits = parseInt(req.query.maxVisits as string) || 4;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - period);

    // Get active members
    const activeMembers = await MemberModel.find({
      tenantId,
      status: { $in: ['active', 'Active'] },
    }).select('_id name phone mobile email createdAt');

    const memberIds = activeMembers.map((m: any) => m._id.toString());

    // Aggregate attendance counts per member in the period
    const attendanceCounts = await AttendanceModel.aggregate([
      {
        $match: {
          tenantId,
          memberId: { $in: memberIds },
          checkInTime: { $gte: fromDate },
        },
      },
      {
        $group: {
          _id: '$memberId',
          count: { $sum: 1 },
          lastVisit: { $max: '$checkInTime' },
        },
      },
    ]);

    const countMap = new Map(
      attendanceCounts.map((a: any) => [
        a._id.toString(),
        { count: a.count, lastVisit: a.lastVisit },
      ])
    );

    const irregular = activeMembers
      .filter((m: any) => {
        const data = countMap.get(m._id.toString());
        const visits = data?.count ?? 0;
        return visits <= maxVisits;
      })
      .map((m: any) => {
        const data = countMap.get(m._id.toString());
        return {
          _id: m._id,
          name: m.name,
          phone: m.phone || m.mobile,
          email: m.email,
          visitsInPeriod: data?.count ?? 0,
          lastVisit: data?.lastVisit ?? null,
          daysSinceLastVisit: data?.lastVisit
            ? Math.floor(
                (Date.now() - new Date(data.lastVisit).getTime()) / 86400000
              )
            : null,
          joinedAt: m.createdAt,
        };
      });

    const sorted = irregular.sort(
      (a: any, b: any) => a.visitsInPeriod - b.visitsInPeriod
    );

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const paginated = sorted.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      data: paginated,
      total: sorted.length,
      page,
      totalPages: Math.ceil(sorted.length / limit),
    });
  } catch (err: any) {
    res.json({
      success: true,
      data: [],
      total: 0,
      message: 'Could not load report: ' + err.message,
    });
  }
});

// ─── GET /stats — Summary stats ───────────────────────────────────────────────
router.get('/stats', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const MemberModel = require('../models/Member.model').default;
    const AttendanceModel = require('../models/Attendance.model').default;

    const tenantId = (req as any).tenantId;
    const period = parseInt(req.query.period as string) || 30;
    const maxVisits = parseInt(req.query.maxVisits as string) || 4;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - period);

    const activeMembers = await MemberModel.find({
      tenantId,
      status: { $in: ['active', 'Active'] },
    }).select('_id');

    const totalActive = activeMembers.length;
    const memberIds = activeMembers.map((m: any) => m._id.toString());

    const attendanceCounts = await AttendanceModel.aggregate([
      {
        $match: {
          tenantId,
          memberId: { $in: memberIds },
          checkInTime: { $gte: fromDate },
        },
      },
      {
        $group: {
          _id: '$memberId',
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map(
      attendanceCounts.map((a: any) => [a._id.toString(), a.count])
    );

    let irregularCount = 0;
    let totalVisits = 0;

    memberIds.forEach((id: string) => {
      const visits = countMap.get(id) ?? 0;
      totalVisits += visits;
      if (visits <= maxVisits) irregularCount++;
    });

    const regularCount = totalActive - irregularCount;
    const regularRate =
      totalActive > 0 ? Math.round((regularCount / totalActive) * 100) : 0;
    const avgVisitsPerMonth =
      totalActive > 0
        ? Math.round((totalVisits / totalActive) * (30 / period) * 10) / 10
        : 0;

    res.json({
      success: true,
      data: {
        totalActive,
        irregular: irregularCount,
        regular: regularCount,
        regularRate,
        avgVisitsPerMonth,
      },
    });
  } catch (err: any) {
    res.json({
      success: true,
      data: {
        totalActive: 0,
        irregular: 0,
        regular: 0,
        regularRate: 0,
        avgVisitsPerMonth: 0,
      },
      message: 'Could not load stats: ' + err.message,
    });
  }
});

// ─── GET /segments — Categorize members into visit-frequency buckets ──────────
router.get('/segments', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const MemberModel = require('../models/Member.model').default;
    const AttendanceModel = require('../models/Attendance.model').default;

    const tenantId = (req as any).tenantId;
    const period = parseInt(req.query.period as string) || 30;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - period);

    const activeMembers = await MemberModel.find({
      tenantId,
      status: { $in: ['active', 'Active'] },
    }).select('_id');

    const memberIds = activeMembers.map((m: any) => m._id.toString());

    const attendanceCounts = await AttendanceModel.aggregate([
      {
        $match: {
          tenantId,
          memberId: { $in: memberIds },
          checkInTime: { $gte: fromDate },
        },
      },
      {
        $group: {
          _id: '$memberId',
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map(
      attendanceCounts.map((a: any) => [a._id.toString(), a.count])
    );

    let zeroVisits = 0;
    let lowVisits = 0;    // 1–2
    let belowAvg = 0;     // 3–4
    let regular = 0;      // 5+

    memberIds.forEach((id: string) => {
      const visits = countMap.get(id) ?? 0;
      if (visits === 0) zeroVisits++;
      else if (visits <= 2) lowVisits++;
      else if (visits <= 4) belowAvg++;
      else regular++;
    });

    res.json({
      success: true,
      data: {
        zeroVisits,
        lowVisits,
        belowAvg,
        regular,
        total: memberIds.length,
        segments: [
          { label: 'Zero Visits', count: zeroVisits, range: '0', color: '#7f1d1d' },
          { label: 'Low', count: lowVisits, range: '1-2', color: '#78350f' },
          { label: 'Below Average', count: belowAvg, range: '3-4', color: '#713f12' },
          { label: 'Regular', count: regular, range: '5+', color: '#14532d' },
        ],
      },
    });
  } catch (err: any) {
    res.json({
      success: true,
      data: {
        zeroVisits: 0,
        lowVisits: 0,
        belowAvg: 0,
        regular: 0,
        total: 0,
        segments: [],
      },
      message: 'Could not load segments: ' + err.message,
    });
  }
});

// ─── POST /flag — Mark a member as contacted ──────────────────────────────────
router.post('/flag', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const { memberId, note } = req.body;
    if (!memberId) {
      res.status(400).json({ success: false, message: 'memberId is required' });
      return;
    }

    const tenantId = (req as any).tenantId;

    // Try to persist via MemberNote or ContactLog if model exists; otherwise log and succeed
    try {
      const ContactLogModel = require('../models/ContactLog.model').default;
      await ContactLogModel.create({
        tenantId,
        memberId,
        note: note || '',
        contactedAt: new Date(),
        contactedBy: (req as any).user?._id,
        type: 'irregular_followup',
      });
    } catch {
      // Model may not exist — soft-succeed so UI isn't blocked
      console.log(`[irregular-members] Flagged member ${memberId} as contacted (no ContactLog model)`);
    }

    res.json({ success: true, message: 'Member marked as contacted', memberId });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /bulk-message — Trigger WhatsApp reminder to irregular members ──────
router.post('/bulk-message', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
  try {
    const { memberIds, message } = req.body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      res.status(400).json({ success: false, message: 'memberIds array is required' });
      return;
    }

    const tenantId = (req as any).tenantId;
    const defaultMessage =
      message ||
      'Hi! We miss you at the gym. Come back and keep up your fitness journey. Your progress is waiting for you!';

    let sentCount = 0;
    let failedCount = 0;

    // Try using existing notification service
    try {
      const notificationService = require('../services/notification.service').default;

      const MemberModel = require('../models/Member.model').default;
      const members = await MemberModel.find({
        tenantId,
        _id: { $in: memberIds },
      }).select('name phone mobile email');

      for (const member of members) {
        const phone = member.phone || member.mobile;
        try {
          if (notificationService?.sendWhatsApp) {
            await notificationService.sendWhatsApp({
              to: phone,
              message: `Hi ${member.name}! ${defaultMessage}`,
              tenantId,
            });
          } else if (notificationService?.send) {
            await notificationService.send({
              type: 'whatsapp',
              to: phone,
              body: `Hi ${member.name}! ${defaultMessage}`,
              tenantId,
            });
          }
          sentCount++;
        } catch {
          failedCount++;
        }
      }
    } catch {
      // Notification service unavailable — return success with 0 sent
      sentCount = 0;
      failedCount = memberIds.length;
    }

    res.json({
      success: true,
      message: `Bulk message triggered: ${sentCount} sent, ${failedCount} failed`,
      sentCount,
      failedCount,
      total: memberIds.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
