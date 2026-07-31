import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import {
  HABIT_CHALLENGE_TEMPLATES,
  verifyHabitProgress,
  runNightlyHabitVerification,
  HabitChallengeType,
} from '../services/habit-challenge.service';
import HabitChallengeParticipation from '../models/HabitChallengeParticipation.model';

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ── GET /templates — list all built-in challenge templates ────────────────────

router.get('/templates', (_req: Request, res: Response) => {
  res.json({ success: true, data: HABIT_CHALLENGE_TEMPLATES });
});

// ── GET /stats — summary for the current user ─────────────────────────────────

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user?._id?.toString();
    if (!memberId) return res.status(401).json({ success: false, message: 'Unauthorised' });

    const [active, completed, all] = await Promise.all([
      HabitChallengeParticipation.countDocuments({ tenantId, memberId, status: 'active' }),
      HabitChallengeParticipation.countDocuments({ tenantId, memberId, status: 'completed' }),
      HabitChallengeParticipation.find({ tenantId, memberId }).select('achievedDays calendarData status').lean(),
    ]);

    const totalDaysAchieved = all.reduce((sum, p) => sum + (p.achievedDays ?? 0), 0);

    // Current streak: consecutive achieved days ending today across all active participations
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeParticipations = all.filter(p => p.status === 'active');
    let currentStreaks: Record<string, number> = {};

    for (const p of activeParticipations) {
      const sortedDays = [...(p.calendarData ?? [])]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      let streak = 0;
      let cursor = new Date(today);
      cursor.setDate(cursor.getDate() - 1); // start from yesterday
      for (const day of sortedDays) {
        const dayDate = new Date(day.date);
        dayDate.setHours(0, 0, 0, 0);
        if (dayDate.getTime() === cursor.getTime() && day.achieved) {
          streak++;
          cursor.setDate(cursor.getDate() - 1);
        } else {
          break;
        }
      }
      currentStreaks[String(p._id)] = streak;
    }

    return res.json({
      success: true,
      data: { active, completed, totalDaysAchieved, currentStreaks },
    });
  } catch (err) { next(err); }
});

// ── GET /my — current user's participations ───────────────────────────────────

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user?._id?.toString();
    if (!memberId) return res.status(401).json({ success: false, message: 'Unauthorised' });

    const { status } = req.query;
    const filter: Record<string, unknown> = { tenantId, memberId };
    if (status) filter.status = status;

    const participations = await HabitChallengeParticipation.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Attach template info
    const enriched = participations.map((p) => ({
      ...p,
      template: HABIT_CHALLENGE_TEMPLATES.find((t) => t.id === p.templateId) ?? null,
    }));

    return res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
});

// ── GET /leaderboard/:templateId — top participants for a template ────────────

router.get('/leaderboard/:templateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { templateId } = req.params;

    const template = HABIT_CHALLENGE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });

    const participants = await HabitChallengeParticipation.find({ tenantId, templateId })
      .sort({ achievedDays: -1 })
      .limit(10)
      .lean();

    // Fetch member names
    let Member: any;
    try { Member = require('../models/Member.model').default; } catch (_e) { Member = null; }

    const memberIds = participants.map((p) => p.memberId);
    const members: any[] = Member
      ? await Member.find({ _id: { $in: memberIds } })
          .select('firstName lastName membershipNumber')
          .lean()
      : [];

    const memberMap: Record<string, any> = {};
    members.forEach((m) => { memberMap[String(m._id)] = m; });

    const leaderboard = participants.map((p, i) => ({
      rank: i + 1,
      memberId: p.memberId,
      member: memberMap[String(p.memberId)] ?? null,
      achievedDays: p.achievedDays,
      totalDays: p.totalDays,
      status: p.status,
    }));

    return res.json({ success: true, data: leaderboard });
  } catch (err) { next(err); }
});

// ── POST /join/:templateId — join a habit challenge ───────────────────────────

router.post('/join/:templateId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user?._id?.toString();
    if (!memberId) return res.status(401).json({ success: false, message: 'Unauthorised' });

    const templateId = req.params.templateId as string;
    const template = HABIT_CHALLENGE_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return res.status(404).json({ success: false, message: 'Challenge template not found' });

    // Prevent duplicate active participation
    const existing = await HabitChallengeParticipation.findOne({
      tenantId,
      memberId,
      templateId,
      status: 'active',
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'You are already participating in this challenge',
        data: existing,
      });
    }

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + template.durationDays);

    const participation = await HabitChallengeParticipation.create({
      tenantId,
      memberId,
      templateId,
      startDate,
      endDate,
      status: 'active',
      achievedDays: 0,
      totalDays: template.targetDays,
      calendarData: [],
      rewardGranted: false,
    });

    return res.status(201).json({
      success: true,
      data: { ...participation.toObject(), template },
    });
  } catch (err) { next(err); }
});

// ── GET /:id — single participation ──────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user?._id?.toString();

    const participation = await HabitChallengeParticipation.findOne({
      _id: req.params.id,
      tenantId,
    }).lean();

    if (!participation) {
      return res.status(404).json({ success: false, message: 'Participation not found' });
    }

    // Members can only view their own; staff/admin can view any
    const userRole = (req as any).user?.role;
    const isStaff = ['gym_owner', 'branch_manager', 'staff', 'trainer', 'super_admin'].includes(userRole);
    if (!isStaff && String(participation.memberId) !== memberId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const template = HABIT_CHALLENGE_TEMPLATES.find((t) => t.id === participation.templateId);
    return res.json({ success: true, data: { ...participation, template: template ?? null } });
  } catch (err) { next(err); }
});

// ── POST /:id/verify-today — trigger today's verification ────────────────────

router.post('/:id/verify-today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user?._id?.toString();
    if (!memberId) return res.status(401).json({ success: false, message: 'Unauthorised' });

    const participation = await HabitChallengeParticipation.findOne({
      _id: req.params.id,
      tenantId,
      memberId,
    });
    if (!participation) {
      return res.status(404).json({ success: false, message: 'Participation not found' });
    }
    if (participation.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Challenge is not active' });
    }

    const template = HABIT_CHALLENGE_TEMPLATES.find((t) => t.id === participation.templateId);
    if (!template) {
      return res.status(400).json({ success: false, message: 'Template not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if today already has an entry
    const existingEntry = participation.calendarData.find(
      (d) => new Date(d.date).toDateString() === today.toDateString(),
    );

    const achieved = await verifyHabitProgress(
      String(tenantId),
      memberId,
      template.type as HabitChallengeType,
      today,
    );

    if (existingEntry) {
      // Update existing entry
      existingEntry.achieved = achieved;
    } else {
      participation.calendarData.push({ date: today, achieved });
      if (achieved) participation.achievedDays += 1;
    }

    // Check completion
    if (participation.achievedDays >= template.targetDays) {
      participation.status = 'completed';
      participation.completedAt = new Date();

      if (!participation.rewardGranted) {
        participation.rewardGranted = true;
        try {
          const Member = require('../models/Member.model').default;
          await Member.findByIdAndUpdate(memberId, {
            $inc: { 'gamification.totalPoints': template.rewardPoints },
          });
        } catch (_e) { /* best-effort */ }
      }
    }

    await participation.save();

    return res.json({
      success: true,
      data: {
        achieved,
        achievedDays: participation.achievedDays,
        status: participation.status,
        calendarData: participation.calendarData,
      },
    });
  } catch (err) { next(err); }
});

// ── POST /:id/abandon — abandon a challenge ───────────────────────────────────

router.post('/:id/abandon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user?._id?.toString();
    if (!memberId) return res.status(401).json({ success: false, message: 'Unauthorised' });

    const participation = await HabitChallengeParticipation.findOne({
      _id: req.params.id,
      tenantId,
      memberId,
    });
    if (!participation) {
      return res.status(404).json({ success: false, message: 'Participation not found' });
    }
    if (participation.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Only active challenges can be abandoned' });
    }

    participation.status = 'abandoned';
    await participation.save();

    return res.json({ success: true, data: { status: 'abandoned' } });
  } catch (err) { next(err); }
});

// ── POST /run-verification — admin: trigger nightly verification manually ─────

router.post(
  '/run-verification',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const result = await runNightlyHabitVerification(String(tenantId));
      return res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
);

export default router;
