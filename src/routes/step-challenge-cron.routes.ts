import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { runStepChallengeVerification } from '../workers/step-challenge.worker';
import StepChallenge from '../models/StepChallenge.model';
import StepChallengeProgress from '../models/StepChallengeProgress.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ── POST /run-verification — admin-only manual trigger ────────────────────────
router.post(
  '/run-verification',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { date: dateStr } = req.body;
      const targetDate = dateStr ? new Date(dateStr) : undefined;

      const result = await runStepChallengeVerification(targetDate);

      return res.json({
        success: true,
        message: 'Step challenge verification completed',
        data: result,
      });
    } catch (err: any) {
      next(err);
    }
  },
);

// ── GET /my-calendar — member's 30-day step calendar for a challenge ──────────
router.get('/my-calendar', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const user = (req as any).user;
    const memberId = String(user._id);

    const { challengeId } = req.query;

    // Find the relevant active challenge (most recent if no id specified)
    const challengeFilter: any = { tenantId, status: { $in: ['active', 'upcoming'] } };
    if (challengeId) challengeFilter._id = String(challengeId);

    const challenge = await StepChallenge.findOne(challengeFilter)
      .sort({ startDate: -1 })
      .lean();

    if (!challenge) {
      return res.json({ success: true, data: null });
    }

    const resolvedChallengeId = String(challenge._id);

    // Participation info for this member
    const participant = challenge.participants.find(
      (p) => String(p.memberId) === memberId,
    );

    // Build 30-day window ending today
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 29);
    windowStart.setHours(0, 0, 0, 0);

    // Fetch all progress records in the window
    const records = await StepChallengeProgress.find({
      tenantId,
      challengeId: resolvedChallengeId,
      memberId,
      date: { $gte: windowStart },
    })
      .sort({ date: 1 })
      .lean();

    // Index by date string for O(1) lookup
    const recordMap: Record<string, (typeof records)[0]> = {};
    records.forEach((r) => {
      const key = new Date(r.date).toISOString().slice(0, 10);
      recordMap[key] = r;
    });

    // Build calendar array (day 0 = 29 days ago, day 29 = today)
    const calendar = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      d.setHours(0, 0, 0, 0);
      const dateStr = d.toISOString().slice(0, 10);
      const record = recordMap[dateStr];
      const isToday = i === 29;

      // A day is "future" if it's after today — should never happen in this 30-day back window,
      // but guard for timezone edge cases
      const isFuture = d.getTime() > new Date().setHours(23, 59, 59, 999);

      return {
        dateStr,
        dayLabel: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 1),
        steps: record?.stepCount ?? 0,
        target: record?.targetSteps ?? challenge.dailyTarget,
        metTarget: record?.achieved ?? false,
        isToday,
        isFuture,
      };
    });

    // Compute streaks from calendar
    let currentStreak = 0;
    let bestStreak = 0;
    let runningStreak = 0;

    for (let i = 0; i < calendar.length; i++) {
      const day = calendar[i];
      if (!day.isFuture && day.metTarget) {
        runningStreak++;
        bestStreak = Math.max(bestStreak, runningStreak);
        if (i === calendar.length - 1 || calendar.slice(i + 1).every((d) => d.isFuture)) {
          currentStreak = runningStreak;
        }
      } else if (!day.isFuture) {
        runningStreak = 0;
      }
    }

    // Also compute current streak by walking backwards from today
    currentStreak = 0;
    for (let i = calendar.length - 1; i >= 0; i--) {
      if (calendar[i].isFuture) continue;
      if (calendar[i].metTarget) {
        currentStreak++;
      } else {
        break;
      }
    }

    const totalSteps = participant?.totalSteps ?? records.reduce((s, r) => s + r.stepCount, 0);
    const daysAchieved = participant?.daysAchieved ?? records.filter((r) => r.achieved).length;

    return res.json({
      success: true,
      data: {
        challenge: {
          _id: challenge._id,
          title: challenge.title,
          dailyTarget: challenge.dailyTarget,
          durationDays: challenge.durationDays,
          startDate: challenge.startDate,
          endDate: challenge.endDate,
          status: challenge.status,
          rewardPoints: challenge.rewardPoints,
          badgeName: challenge.badgeName,
        },
        participation: participant
          ? {
              totalSteps,
              daysAchieved,
              rank: participant.rank ?? null,
              joinedAt: participant.joinedAt,
            }
          : null,
        calendar,
        streaks: { current: currentStreak, best: bestStreak },
      },
    });
  } catch (err: any) {
    next(err);
  }
});

// ── GET /leaderboard-summary — top 10 across all active challenges ─────────────
router.get('/leaderboard-summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const { challengeId } = req.query;

    const filter: any = { tenantId, status: { $in: ['active', 'upcoming', 'completed'] } };
    if (challengeId) filter._id = String(challengeId);

    const challenge = await StepChallenge.findOne(filter).sort({ startDate: -1 }).lean();

    if (!challenge) {
      return res.json({ success: true, data: [] });
    }

    const Member = require('../models/Member.model').default;

    const sorted = [...(challenge.participants || [])]
      .sort((a, b) => b.totalSteps - a.totalSteps)
      .slice(0, 10);

    const memberIds = sorted.map((p) => p.memberId);
    const members = await Member.find({ _id: { $in: memberIds } })
      .select('firstName lastName membershipNumber')
      .lean();

    const memberMap: Record<string, any> = {};
    members.forEach((m: any) => {
      memberMap[String(m._id)] = m;
    });

    const leaderboard = sorted.map((p, i) => ({
      rank: i + 1,
      memberId: String(p.memberId),
      member: memberMap[String(p.memberId)] ?? null,
      totalSteps: p.totalSteps,
      daysAchieved: p.daysAchieved,
    }));

    return res.json({ success: true, data: leaderboard });
  } catch (err: any) {
    next(err);
  }
});

export default router;
