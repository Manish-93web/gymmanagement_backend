import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import Challenge678 from '../models/Challenge678.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ── Challenge template definition ─────────────────────────────────────────────

const CHALLENGE_TEMPLATE = {
  name: '6-7-8 Challenge',
  description:
    '90-day progressive workout challenge: 6 workouts in Month 1, 7 in Month 2, 8 in Month 3',
  monthTargets: [6, 7, 8],
  totalDays: 90,
  badgeName: '90-Day Warrior',
  badgeEmoji: '🏆',
  rewardPoints: 250,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── GET /templates ────────────────────────────────────────────────────────────

router.get('/templates', (_req: Request, res: Response) => {
  return res.json({ success: true, data: CHALLENGE_TEMPLATE });
});

// ── GET /my ───────────────────────────────────────────────────────────────────

router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const memberId = String((req as any).user._id);

    const challenge = await Challenge678.findOne({
      tenantId,
      memberId,
      status: 'active',
    }).lean();

    return res.json({ success: true, data: challenge ?? null });
  } catch (err) {
    next(err);
  }
});

// ── POST /join ────────────────────────────────────────────────────────────────

router.post('/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string | undefined;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'Tenant context required' });
    }
    const user = (req as any).user;
    const memberId = String(user._id);

    // Prevent duplicate active challenge
    const existing = await Challenge678.findOne({
      tenantId,
      memberId,
      status: 'active',
    });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active 6-7-8 Challenge.',
      });
    }

    // Resolve member name
    let memberName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
    if (!memberName) {
      const member = await Member.findOne({ userId: user._id })
        .select('firstName lastName')
        .lean();
      if (member) {
        memberName = `${member.firstName} ${member.lastName}`.trim();
      }
    }

    const startDate = startOfDay(new Date());
    const month1StartDate = new Date(startDate);
    const month2StartDate = addDays(startDate, 30);
    const month3StartDate = addDays(startDate, 60);
    const endDate = addDays(startDate, 90);

    // NOTE: Challenge678.model's MonthProgressSchema requires mealLogTarget
    // (no default) plus the other pillar-2/3 fields. Omitting them here made
    // every Challenge678.create() call below throw a Mongoose ValidationError,
    // so nobody could ever join the challenge — populate them explicitly,
    // mirroring the workout targets for meals and the schema default (2) for
    // consultations.
    const monthProgress = [
      {
        month: 1 as const, target: 6 as const, achieved: 0, isComplete: false, workoutDates: [],
        mealLogTarget: 6 as const, mealLogsAchieved: 0, mealLogDates: [], mealPillarComplete: false,
        consultationTarget: 2 as const, consultationsAchieved: 0, consultationDates: [], consultationPillarComplete: false,
        allPillarsComplete: false,
      },
      {
        month: 2 as const, target: 7 as const, achieved: 0, isComplete: false, workoutDates: [],
        mealLogTarget: 7 as const, mealLogsAchieved: 0, mealLogDates: [], mealPillarComplete: false,
        consultationTarget: 2 as const, consultationsAchieved: 0, consultationDates: [], consultationPillarComplete: false,
        allPillarsComplete: false,
      },
      {
        month: 3 as const, target: 8 as const, achieved: 0, isComplete: false, workoutDates: [],
        mealLogTarget: 8 as const, mealLogsAchieved: 0, mealLogDates: [], mealPillarComplete: false,
        consultationTarget: 2 as const, consultationsAchieved: 0, consultationDates: [], consultationPillarComplete: false,
        allPillarsComplete: false,
      },
    ];

    const challenge = await Challenge678.create({
      tenantId,
      memberId,
      memberName: memberName || 'Member',
      startDate,
      month1StartDate,
      month2StartDate,
      month3StartDate,
      endDate,
      status: 'active',
      currentMonth: 1,
      monthProgress,
      totalWorkoutsCompleted: 0,
      badgeEarned: false,
      lastVerifiedAt: new Date(),
    });

    return res.status(201).json({ success: true, data: challenge });
  } catch (err) {
    next(err);
  }
});

// ── POST /verify-today ────────────────────────────────────────────────────────

router.post('/verify-today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const reqUser = (req as any).user;

    // Admin can pass memberId, otherwise use own ID
    const memberId =
      req.body?.memberId && reqUser.role !== 'member'
        ? String(req.body.memberId)
        : String(reqUser._id);

    const challenge = await Challenge678.findOne({ tenantId, memberId, status: 'active' });
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'No active 6-7-8 Challenge found.' });
    }

    // Defensive import of Attendance
    const Attendance = require('../models/Attendance.model').default;

    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    // Check if member attended today
    const attendanceToday = await Attendance.findOne({
      tenantId,
      memberId,
      checkInTime: { $gte: todayStart, $lte: todayEnd },
    }).lean();

    if (!attendanceToday) {
      return res.json({
        success: true,
        data: { verified: false, message: 'No attendance found for today.' },
      });
    }

    // Determine which month today falls into
    const daysSinceStart = Math.floor(
      (todayStart.getTime() - challenge.startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    let monthIndex: number;
    if (daysSinceStart < 30) {
      monthIndex = 0; // Month 1
    } else if (daysSinceStart < 60) {
      monthIndex = 1; // Month 2
    } else if (daysSinceStart < 90) {
      monthIndex = 2; // Month 3
    } else {
      return res.json({
        success: true,
        data: { verified: false, message: 'Challenge period has ended.' },
      });
    }

    const mp = challenge.monthProgress[monthIndex];

    // Check if today already recorded
    const alreadyRecorded = mp.workoutDates.some((d) => isSameDay(new Date(d), today));

    if (!alreadyRecorded) {
      mp.workoutDates.push(today);
      mp.achieved = mp.workoutDates.length;

      // Check month completion
      if (!mp.isComplete && mp.achieved >= mp.target) {
        mp.isComplete = true;
        mp.completedAt = new Date();
      }
    }

    // Check if ALL months complete
    const allComplete = challenge.monthProgress.every((m) => m.isComplete);
    if (allComplete && challenge.status === 'active') {
      challenge.status = 'completed';
      challenge.completedAt = new Date();
      challenge.badgeEarned = true;

      // Award badge and points to member
      try {
        await Member.findOneAndUpdate(
          { userId: memberId },
          {
            $inc: { 'gamification.totalPoints': CHALLENGE_TEMPLATE.rewardPoints },
          }
        );
      } catch {
        // Non-critical: badge/points award failure should not fail the response
      }
    }

    challenge.lastVerifiedAt = new Date();
    await challenge.save();

    return res.json({
      success: true,
      data: {
        verified: true,
        alreadyRecorded,
        monthProgress: challenge.monthProgress,
        status: challenge.status,
        badgeEarned: challenge.badgeEarned,
        totalWorkoutsCompleted: challenge.totalWorkoutsCompleted,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /leaderboard ──────────────────────────────────────────────────────────

router.get('/leaderboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;

    const challenges = await Challenge678.find({ tenantId })
      .sort({ totalWorkoutsCompleted: -1, createdAt: 1 })
      .limit(10)
      .select('memberId memberName totalWorkoutsCompleted currentMonth status startDate')
      .lean();

    const leaderboard = challenges.map((c, i) => ({
      rank: i + 1,
      memberId: c.memberId,
      memberName: c.memberName,
      totalWorkoutsCompleted: c.totalWorkoutsCompleted,
      currentMonth: c.currentMonth,
      status: c.status,
      startDate: c.startDate,
    }));

    return res.json({ success: true, data: leaderboard });
  } catch (err) {
    next(err);
  }
});

// ── GET /stats ────────────────────────────────────────────────────────────────

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;

    const [totalParticipants, totalCompleted, currentlyActive] = await Promise.all([
      Challenge678.countDocuments({ tenantId }),
      Challenge678.countDocuments({ tenantId, status: 'completed' }),
      Challenge678.countDocuments({ tenantId, status: 'active' }),
    ]);

    const avgCompletionRate =
      totalParticipants > 0
        ? Math.round((totalCompleted / totalParticipants) * 100)
        : 0;

    return res.json({
      success: true,
      data: {
        totalParticipants,
        totalCompleted,
        currentlyActive,
        avgCompletionRate,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /run-verification ─────────────────────────────────────────────────────

router.post('/run-verification', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const user = (req as any).user;

    // Only admins/owners can run bulk verification
    const allowedRoles = ['gym_owner', 'super_admin', 'branch_manager', 'staff'];
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    const Attendance = require('../models/Attendance.model').default;

    const activeChallenges = await Challenge678.find({ tenantId, status: 'active' });

    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let updated = 0;

    for (const challenge of activeChallenges) {
      // Check attendance in past 24 hours
      const recentAttendance = await Attendance.find({
        tenantId,
        memberId: challenge.memberId,
        checkInTime: { $gte: since24h, $lte: now },
      })
        .select('checkInTime')
        .lean();

      if (!recentAttendance.length) continue;

      let changed = false;

      for (const att of recentAttendance) {
        const attDate = new Date(att.checkInTime);
        const daysSinceStart = Math.floor(
          (startOfDay(attDate).getTime() - challenge.startDate.getTime()) /
            (1000 * 60 * 60 * 24)
        );

        let monthIndex: number;
        if (daysSinceStart < 30) monthIndex = 0;
        else if (daysSinceStart < 60) monthIndex = 1;
        else if (daysSinceStart < 90) monthIndex = 2;
        else continue;

        const mp = challenge.monthProgress[monthIndex];
        const alreadyRecorded = mp.workoutDates.some((d) => isSameDay(new Date(d), attDate));

        if (!alreadyRecorded) {
          mp.workoutDates.push(attDate);
          mp.achieved = mp.workoutDates.length;
          if (!mp.isComplete && mp.achieved >= mp.target) {
            mp.isComplete = true;
            mp.completedAt = new Date();
          }
          changed = true;
        }
      }

      if (changed) {
        const allComplete = challenge.monthProgress.every((m) => m.isComplete);
        if (allComplete && challenge.status === 'active') {
          challenge.status = 'completed';
          challenge.completedAt = new Date();
          challenge.badgeEarned = true;
        }
        challenge.lastVerifiedAt = new Date();
        await challenge.save();
        updated++;
      }
    }

    return res.json({ success: true, data: { processed: activeChallenges.length, updated } });
  } catch (err) {
    next(err);
  }
});

// ── POST /abandon ─────────────────────────────────────────────────────────────

router.post('/abandon', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const memberId = String((req as any).user._id);

    const challenge = await Challenge678.findOne({ tenantId, memberId, status: 'active' });
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'No active challenge found.' });
    }

    challenge.status = 'abandoned';
    await challenge.save();

    return res.json({ success: true, data: { message: 'Challenge abandoned.' } });
  } catch (err) {
    next(err);
  }
});

export default router;
