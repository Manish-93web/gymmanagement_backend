import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import ProgressiveChallenge from '../models/ProgressiveChallenge.model';
import Attendance from '../models/Attendance.model';
import NutritionLog from '../models/NutritionLog.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ── helpers ───────────────────────────────────────────────────────────────────

function monthBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end   = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

// Default phase config for the 6-7-8 progressive challenge
const DEFAULT_PHASES = [
  { phaseNumber: 1, targetCount: 6, durationDays: 30, badgeName: 'Phase 1 — Six Strong',  badgeEmoji: '🥉', rewardPoints: 50  },
  { phaseNumber: 2, targetCount: 7, durationDays: 30, badgeName: 'Phase 2 — Seven Solid', badgeEmoji: '🥈', rewardPoints: 75  },
  { phaseNumber: 3, targetCount: 8, durationDays: 30, badgeName: 'Phase 3 — Eight Elite', badgeEmoji: '🥇', rewardPoints: 100 },
];

// ── GET /leaderboard — must precede GET /:id ──────────────────────────────────
router.get('/leaderboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;

    const challenges = await ProgressiveChallenge.find({
      tenantId,
      status: 'active',
    }).lean();

    // Aggregate totalCompleted across all active challenges per member
    const memberTotals: Record<string, number> = {};
    for (const c of challenges) {
      for (const p of c.participants) {
        const key = String(p.memberId);
        memberTotals[key] = (memberTotals[key] ?? 0) + (p.totalCompleted ?? 0);
      }
    }

    const sorted = Object.entries(memberTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    const memberIds = sorted.map(([id]) => id);
    const members   = await Member.find({ _id: { $in: memberIds } })
      .select('firstName lastName membershipNumber')
      .lean();

    const memberMap: Record<string, any> = {};
    members.forEach(m => { memberMap[String(m._id)] = m; });

    const leaderboard = sorted.map(([memberId, total], i) => ({
      rank:           i + 1,
      memberId,
      member:         memberMap[memberId] ?? null,
      totalCompleted: total,
    }));

    return res.json({ success: true, data: leaderboard });
  } catch (err) { next(err); }
});

// ── GET / — list all challenges ───────────────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId  = (req as any).tenantId;
    const userRole  = (req as any).user?.role;
    const { status } = req.query;

    const filter: any = { tenantId };
    if (status) {
      filter.status = status;
    }
    if (userRole === 'member') {
      filter.isPublic = true;
      filter.status   = 'active';
    }

    const challenges = await ProgressiveChallenge.find(filter)
      .sort({ startDate: -1 })
      .lean();

    const data = challenges.map(c => ({
      ...c,
      participantCount: c.participants?.length ?? 0,
    }));

    return res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── POST / — create challenge ─────────────────────────────────────────────────
router.post(
  '/',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const {
        title,
        description,
        challengeType,
        phases: customPhases,
        monthlyTarget,
        startDate,
        endDate,
        isPublic,
      } = req.body;

      if (!title || !challengeType || !startDate) {
        return res.status(400).json({
          success: false,
          message: 'title, challengeType, and startDate are required',
        });
      }

      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      // For progressive_workout, auto-calculate 90-day endDate if not provided
      let end: Date;
      if (endDate) {
        end = new Date(endDate);
      } else if (challengeType === 'progressive_workout') {
        end = new Date(start);
        end.setDate(end.getDate() + 90);
      } else {
        // Monthly challenges end at end of month
        end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
      }

      const now    = new Date();
      const status = now < start ? 'upcoming' : now <= end ? 'active' : 'completed';

      // Auto-populate phases for progressive_workout
      let phases = customPhases;
      if (challengeType === 'progressive_workout') {
        phases = DEFAULT_PHASES;
      }

      // Default monthlyTarget per type
      let target = monthlyTarget;
      if (challengeType === 'monthly_workout_consistency' && !target) target = 6;
      if (challengeType === 'monthly_meal_consistency'    && !target) target = 7;

      const challenge = await ProgressiveChallenge.create({
        tenantId,
        title,
        description: description ?? '',
        challengeType,
        phases:        phases ?? [],
        monthlyTarget: target  ?? 0,
        startDate:     start,
        endDate:       end,
        status,
        isPublic:      isPublic !== false,
        participants:  [],
      });

      return res.status(201).json({ success: true, data: challenge });
    } catch (err) { next(err); }
  }
);

// ── GET /:id — detail ─────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const challenge = await ProgressiveChallenge.findOne({
      _id: req.params.id,
      tenantId,
    }).lean();

    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    return res.json({
      success: true,
      data: { ...challenge, participantCount: challenge.participants?.length ?? 0 },
    });
  } catch (err) { next(err); }
});

// ── POST /:id/join ────────────────────────────────────────────────────────────
router.post('/:id/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId is required' });
    }

    const challenge = await ProgressiveChallenge.findOne({ _id: req.params.id, tenantId });
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }
    if (!['active', 'upcoming'].includes(challenge.status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot join a challenge that is not active or upcoming',
      });
    }

    const alreadyJoined = challenge.participants.some(
      p => String(p.memberId) === String(memberId)
    );
    if (alreadyJoined) {
      return res.status(400).json({ success: false, message: 'Already enrolled in this challenge' });
    }

    // Initialise phaseProgress for progressive_workout
    const phaseProgress = challenge.challengeType === 'progressive_workout'
      ? challenge.phases.map(ph => ({
          phase:          ph.phaseNumber,
          completedCount: 0,
          earnedBadge:    false,
        }))
      : [];

    challenge.participants.push({
      memberId:      new mongoose.Types.ObjectId(memberId),
      enrolledAt:    new Date(),
      currentPhase:  1,
      phaseProgress,
      totalCompleted: 0,
      isFinished:    false,
    });

    await challenge.save();

    return res.json({ success: true, data: { message: 'Enrolled in challenge successfully' } });
  } catch (err) { next(err); }
});

// ── POST /:id/sync-progress ───────────────────────────────────────────────────
router.post('/:id/sync-progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { memberId } = req.body;

    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId is required' });
    }

    const challenge = await ProgressiveChallenge.findOne({ _id: req.params.id, tenantId });
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    const pIdx = challenge.participants.findIndex(
      p => String(p.memberId) === String(memberId)
    );
    if (pIdx === -1) {
      return res.status(400).json({ success: false, message: 'Not enrolled in this challenge' });
    }

    const participant = challenge.participants[pIdx];
    const now         = new Date();

    // ── Monthly types ─────────────────────────────────────────────────────────
    if (
      challenge.challengeType === 'monthly_workout_consistency' ||
      challenge.challengeType === 'monthly_meal_consistency'
    ) {
      const { start: monthStart, end: monthEnd } = monthBounds(now);

      let count = 0;

      if (challenge.challengeType === 'monthly_workout_consistency') {
        // Count distinct workout days (Attendance check-ins) this month
        const records = await Attendance.find({
          tenantId,
          memberId,
          checkInTime: { $gte: monthStart, $lte: monthEnd },
        }).select('checkInTime').lean();

        const daySet = new Set<string>();
        records.forEach(r => {
          daySet.add(new Date(r.checkInTime).toISOString().slice(0, 10));
        });
        count = daySet.size;
      } else {
        // Count distinct meal-log days this month
        const logs = await NutritionLog.find({
          tenantId,
          memberId,
          date: { $gte: monthStart, $lte: monthEnd },
        }).select('date').lean();

        const daySet = new Set<string>();
        logs.forEach(l => {
          daySet.add(new Date(l.date).toISOString().slice(0, 10));
        });
        count = daySet.size;
      }

      participant.totalCompleted  = count;
      participant.isFinished      = count >= (challenge.monthlyTarget ?? 1);

    // ── Progressive workout ───────────────────────────────────────────────────
    } else {
      const phases = challenge.phases ?? [];
      let currentPhaseIdx = participant.currentPhase - 1;

      // Process phases sequentially
      let keepGoing = true;
      while (keepGoing && currentPhaseIdx < phases.length) {
        const phase     = phases[currentPhaseIdx];
        const ppIdx     = participant.phaseProgress.findIndex(pp => pp.phase === phase.phaseNumber);

        // Phase window: start from challenge startDate + sum of previous phase durations
        const phaseOffsetDays = phases
          .slice(0, currentPhaseIdx)
          .reduce((s, ph) => s + ph.durationDays, 0);

        const phaseStart = new Date(challenge.startDate);
        phaseStart.setDate(phaseStart.getDate() + phaseOffsetDays);
        phaseStart.setHours(0, 0, 0, 0);

        const phaseEnd = new Date(phaseStart);
        phaseEnd.setDate(phaseEnd.getDate() + phase.durationDays);
        phaseEnd.setHours(23, 59, 59, 999);

        // Count distinct workout days within phase window
        const records = await Attendance.find({
          tenantId,
          memberId,
          checkInTime: { $gte: phaseStart, $lte: phaseEnd },
        }).select('checkInTime').lean();

        const daySet = new Set<string>();
        records.forEach(r => {
          daySet.add(new Date(r.checkInTime).toISOString().slice(0, 10));
        });
        const completedCount = daySet.size;

        if (ppIdx >= 0) {
          participant.phaseProgress[ppIdx].completedCount = completedCount;
        } else {
          participant.phaseProgress.push({
            phase:          phase.phaseNumber,
            completedCount,
            earnedBadge:    false,
          });
        }

        const ppIdxNow = participant.phaseProgress.findIndex(pp => pp.phase === phase.phaseNumber);

        // Check if this phase is earned
        if (completedCount >= phase.targetCount) {
          if (!participant.phaseProgress[ppIdxNow].earnedBadge) {
            participant.phaseProgress[ppIdxNow].earnedBadge   = true;
            participant.phaseProgress[ppIdxNow].completedAt   = new Date();
          }

          // Advance to next phase if there is one
          if (currentPhaseIdx + 1 < phases.length) {
            currentPhaseIdx++;
            participant.currentPhase = currentPhaseIdx + 1;
          } else {
            // All phases done
            participant.isFinished = true;
            keepGoing = false;

            // Award total points
            const totalPoints = phases.reduce((s, ph) => s + (ph.rewardPoints ?? 0), 0);
            if (totalPoints > 0) {
              await Member.findByIdAndUpdate(memberId, {
                $inc: { 'gamification.totalPoints': totalPoints },
              });
            }
          }
        } else {
          // Current phase not yet complete — stop advancing
          keepGoing = false;
        }
      }

      participant.totalCompleted = participant.phaseProgress.reduce(
        (s, pp) => s + pp.completedCount,
        0
      );
    }

    await challenge.save();

    return res.json({
      success: true,
      data: {
        currentPhase:   participant.currentPhase,
        totalCompleted: participant.totalCompleted,
        isFinished:     participant.isFinished,
        phaseProgress:  participant.phaseProgress,
      },
    });
  } catch (err) { next(err); }
});

// ── GET /:id/my-progress ──────────────────────────────────────────────────────
router.get('/:id/my-progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { memberId } = req.query;

    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId query param is required' });
    }

    const challenge = await ProgressiveChallenge.findOne({ _id: req.params.id, tenantId }).lean();
    if (!challenge) {
      return res.status(404).json({ success: false, message: 'Challenge not found' });
    }

    const participant = challenge.participants.find(
      p => String(p.memberId) === String(memberId)
    );

    if (!participant) {
      return res.status(404).json({ success: false, message: 'Not enrolled in this challenge' });
    }

    return res.json({ success: true, data: { challenge, participant } });
  } catch (err) { next(err); }
});

// ── DELETE /:id — cancel challenge ────────────────────────────────────────────
router.delete(
  '/:id',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const challenge = await ProgressiveChallenge.findOne({ _id: req.params.id, tenantId });

      if (!challenge) {
        return res.status(404).json({ success: false, message: 'Challenge not found' });
      }

      challenge.status = 'cancelled';
      await challenge.save();

      return res.json({ success: true });
    } catch (err) { next(err); }
  }
);

export default router;
