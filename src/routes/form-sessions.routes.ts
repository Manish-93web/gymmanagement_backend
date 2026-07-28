import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import FormSession from '../models/FormSession.model';

const router = Router();
router.use(authenticate, tenantContext);

// ─── POST /form-sessions — Save a form session summary after workout ──────────
// Any authenticated member (or above) can save their own session.
router.post(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;

      // Resolve the memberId: members submit their own session
      const memberId = user.memberId || user._id;

      const {
        exerciseName,
        exerciseType,
        repCount,
        setCount,
        durationSeconds,
        avgFormScore,
        peakFormScore,
        errorFlags,
        feedback,
        improvements,
        sessionAt,
      } = req.body;

      if (!exerciseName || !exerciseType) {
        return res
          .status(400)
          .json({ success: false, message: 'exerciseName and exerciseType are required' });
      }

      const session = await FormSession.create({
        tenantId,
        memberId,
        exerciseName,
        exerciseType,
        repCount: repCount ?? 0,
        setCount: setCount ?? 1,
        durationSeconds: durationSeconds ?? 0,
        avgFormScore: avgFormScore ?? 0,
        peakFormScore: peakFormScore ?? 0,
        errorFlags: errorFlags ?? [],
        feedback: feedback ?? [],
        improvements: improvements ?? [],
        sessionAt: sessionAt ? new Date(sessionAt) : new Date(),
      });

      return res.status(201).json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /form-sessions/my — Member's own form sessions ──────────────────────
router.get(
  '/my',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const memberId = user.memberId || user._id;

      const { exerciseType, from, to } = req.query;

      const filter: any = { tenantId, memberId };
      if (exerciseType) filter.exerciseType = exerciseType;
      if (from || to) {
        filter.sessionAt = {};
        if (from) filter.sessionAt.$gte = new Date(String(from));
        if (to) filter.sessionAt.$lte = new Date(String(to));
      }

      const sessions = await FormSession.find(filter)
        .sort({ sessionAt: -1 })
        .limit(20)
        .lean();

      return res.json({ success: true, data: sessions });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /form-sessions/my/progress/:exerciseType — Form score over time ──────
router.get(
  '/my/progress/:exerciseType',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const memberId = user.memberId || user._id;
      const { exerciseType } = req.params;

      const sessions = await FormSession.find({ tenantId, memberId, exerciseType: exerciseType as any })
        .sort({ sessionAt: 1 })
        .limit(10)
        .select('sessionAt avgFormScore repCount')
        .lean();

      const data = sessions.map((s: any) => ({
        sessionAt: s.sessionAt,
        avgFormScore: s.avgFormScore,
        repCount: s.repCount,
      }));

      return res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /form-sessions/stats — Tenant-level stats ───────────────────────────
router.get(
  '/stats',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [totalThisMonth, aggExercise, avgScoreResult] = await Promise.all([
        FormSession.countDocuments({ tenantId, sessionAt: { $gte: startOfMonth } }),
        FormSession.aggregate([
          { $match: { tenantId } },
          { $group: { _id: '$exerciseType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 1 },
        ]),
        FormSession.aggregate([
          { $match: { tenantId } },
          { $group: { _id: null, avgScore: { $avg: '$avgFormScore' }, total: { $sum: 1 } } },
        ]),
      ]);

      const mostCommonExercise = aggExercise[0]?._id ?? null;
      const avgFormScore = Math.round(avgScoreResult[0]?.avgScore ?? 0);
      const totalSessions = avgScoreResult[0]?.total ?? 0;

      return res.json({
        success: true,
        data: {
          totalSessionsThisMonth: totalThisMonth,
          mostCommonExercise,
          avgFormScore,
          totalSessions,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /form-sessions/member/:memberId — View a member's form history ───────
router.get(
  '/member/:memberId',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const { memberId } = req.params;

      const sessions = await FormSession.find({ tenantId, memberId })
        .sort({ sessionAt: -1 })
        .limit(50)
        .lean();

      return res.json({ success: true, data: sessions });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
