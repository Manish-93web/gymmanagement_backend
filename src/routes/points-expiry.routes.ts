import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import PointsExpiryConfig from '../models/PointsExpiryConfig.model';
import Member from '../models/Member.model';
import { expirePointsForTenant } from '../services/points-expiry.service';

let RewardPoints: any;
try { RewardPoints = require('../models/RewardPoints.model').default; } catch {}

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ── GET /config ─────────────────────────────────────────────────────────────
// Returns (or auto-creates) the tenant's expiry configuration
router.get('/config', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });
    const config = await PointsExpiryConfig.findOneAndUpdate(
      { tenantId },
      { $setOnInsert: { tenantId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.json({ success: true, data: config });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /config ─────────────────────────────────────────────────────────────
// Upsert the tenant's expiry configuration
router.post(
  '/config',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { enabled, expiryDays, warningDays, autoExpire, notifyMember } = req.body;

      const config = await PointsExpiryConfig.findOneAndUpdate(
        { tenantId },
        {
          $set: {
            ...(enabled !== undefined && { enabled }),
            ...(expiryDays !== undefined && { expiryDays }),
            ...(warningDays !== undefined && { warningDays }),
            ...(autoExpire !== undefined && { autoExpire }),
            ...(notifyMember !== undefined && { notifyMember }),
          },
        },
        { new: true, upsert: true, runValidators: true }
      );

      return res.json({ success: true, data: config });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── POST /run-now ─────────────────────────────────────────────────────────────
// Manually trigger expiry check for this tenant (admin only)
router.post(
  '/run-now',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

      const config = await PointsExpiryConfig.findOneAndUpdate(
        { tenantId },
        { $setOnInsert: { tenantId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      const result = await expirePointsForTenant(tenantId, config.expiryDays);

      await PointsExpiryConfig.findByIdAndUpdate(config._id, { lastRunAt: new Date() });

      return res.json({
        success: true,
        data: {
          expired: result.expired,
          warned: result.warned,
          runAt: new Date().toISOString(),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── GET /at-risk ─────────────────────────────────────────────────────────────
// Members whose points are expiring within the warning window
router.get(
  '/at-risk',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

      const config = await PointsExpiryConfig.findOneAndUpdate(
        { tenantId },
        { $setOnInsert: { tenantId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      // If a RewardPoints model exists, query it for at-risk buckets
      if (RewardPoints) {
        try {
          const now = new Date();
          const expiryThreshold = new Date(now.getTime() - config.expiryDays * 24 * 60 * 60 * 1000);
          const warningThreshold = new Date(
            now.getTime() - (config.expiryDays - config.warningDays) * 24 * 60 * 60 * 1000
          );

          const atRiskPoints = await RewardPoints.find({
            tenantId,
            status: { $ne: 'expired' },
            $or: [
              { earnedAt: { $lt: warningThreshold, $gt: expiryThreshold } },
              { createdAt: { $lt: warningThreshold, $gt: expiryThreshold } },
            ],
          })
            .populate('memberId', 'firstName lastName email mobile')
            .sort({ earnedAt: 1, createdAt: 1 })
            .limit(100)
            .lean();

          const rows = atRiskPoints.map((p: any) => {
            const earnedDate = p.earnedAt ?? p.createdAt;
            const expiryDate = new Date(
              new Date(earnedDate).getTime() + config!.expiryDays * 24 * 60 * 60 * 1000
            );
            const daysRemaining = Math.max(
              0,
              Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            );
            return {
              memberId: p.memberId?._id ?? p.memberId,
              memberName: p.memberId
                ? `${p.memberId.firstName} ${p.memberId.lastName}`
                : 'Unknown',
              email: p.memberId?.email,
              mobile: p.memberId?.mobile,
              points: p.points ?? p.amount ?? 0,
              earnedDate,
              expiryDate,
              daysRemaining,
            };
          });

          return res.json({ success: true, data: rows });
        } catch (innerErr) {
          // fall through to Member-based fallback
        }
      }

      // Fallback: surface members with positive gamification points and an estimated expiry
      // based on lastStreakUpdate (proxy for last point-earning activity)
      const now = new Date();
      const warningCutoff = new Date(
        now.getTime() - (config.expiryDays - config.warningDays) * 24 * 60 * 60 * 1000
      );

      const members = await Member.find({
        tenantId,
        'gamification.totalPoints': { $gt: 0 },
        $or: [
          { 'gamification.lastStreakUpdate': { $lt: warningCutoff } },
          { 'gamification.lastStreakUpdate': { $exists: false } },
        ],
      })
        .select('firstName lastName email mobile gamification createdAt')
        .limit(100)
        .lean();

      const rows = members.map((m: any) => {
        const baseDate: Date = m.gamification?.lastStreakUpdate ?? m.createdAt ?? now;
        const expiryDate = new Date(
          new Date(baseDate).getTime() + config!.expiryDays * 24 * 60 * 60 * 1000
        );
        const daysRemaining = Math.max(
          0,
          Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
        );
        return {
          memberId: m._id,
          memberName: `${m.firstName} ${m.lastName}`,
          email: m.email,
          mobile: m.mobile,
          points: m.gamification?.totalPoints ?? 0,
          expiryDate,
          daysRemaining,
        };
      });

      return res.json({ success: true, data: rows });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ── GET /history ─────────────────────────────────────────────────────────────
// Recent expiry events (RewardPoints where status='expired')
router.get(
  '/history',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

      if (!RewardPoints) {
        return res.json({ success: true, data: [], total: 0, page, limit });
      }

      const filter = { tenantId, status: 'expired' };
      const [total, records] = await Promise.all([
        RewardPoints.countDocuments(filter),
        RewardPoints.find(filter)
          .populate('memberId', 'firstName lastName email')
          .sort({ expiredAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
      ]);

      const data = records.map((r: any) => ({
        memberId: r.memberId?._id ?? r.memberId,
        memberName: r.memberId
          ? `${r.memberId.firstName} ${r.memberId.lastName}`
          : 'Unknown',
        email: r.memberId?.email,
        points: r.points ?? r.amount ?? 0,
        expiredAt: r.expiredAt ?? r.updatedAt,
        earnedAt: r.earnedAt ?? r.createdAt,
      }));

      return res.json({ success: true, data, total, page, limit });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }
);

export default router;
