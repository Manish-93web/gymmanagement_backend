import mongoose from 'mongoose';

// ── Built-in habit challenge templates ────────────────────────────────────────

export const HABIT_CHALLENGE_TEMPLATES = [
  {
    id: 'meal_tracker_7',
    name: 'I Track My Meals',
    description: 'Log your meals for 7 consecutive days',
    type: 'meal_logging' as const,
    targetDays: 7,
    durationDays: 30,
    rewardPoints: 100,
    badgeName: 'Meal Master',
    badgeEmoji: '🥗',
    verificationModel: 'NutritionLog',
    verificationField: 'date',
  },
  {
    id: 'workout_regular_20',
    name: 'I Workout Regularly',
    description: 'Complete 20 workouts in 30 days',
    type: 'workout_count' as const,
    targetDays: 20,
    durationDays: 30,
    rewardPoints: 150,
    badgeName: 'Fitness Regular',
    badgeEmoji: '💪',
    verificationModel: 'Attendance',
    verificationField: 'checkInTime',
  },
  {
    id: 'meal_tracker_streak',
    name: '14-Day Nutrition Streak',
    description: 'Log at least one meal every day for 14 consecutive days',
    type: 'meal_logging' as const,
    targetDays: 14,
    durationDays: 21,
    rewardPoints: 200,
    badgeName: 'Nutrition Ninja',
    badgeEmoji: '🥦',
    verificationModel: 'NutritionLog',
    verificationField: 'date',
  },
  {
    id: 'workout_streak_6',
    name: '6-Day Workout Week',
    description: 'Work out 6 out of 7 days in a week',
    type: 'workout_week' as const,
    targetDays: 6,
    durationDays: 7,
    rewardPoints: 75,
    badgeName: 'Weekly Warrior',
    badgeEmoji: '🔥',
    verificationModel: 'Attendance',
    verificationField: 'checkInTime',
  },
];

export type HabitChallengeType = 'meal_logging' | 'workout_count' | 'workout_week';

// ── Day-range helper ──────────────────────────────────────────────────────────

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// ── Verify whether a member completed a habit on a given calendar day ─────────
//
// Reads actual DB records — NOT self-reported.

export async function verifyHabitProgress(
  tenantId: string,
  memberId: string,
  challengeType: HabitChallengeType,
  date: Date,
): Promise<boolean> {
  const { start, end } = dayBounds(date);

  try {
    if (challengeType === 'meal_logging') {
      // NutritionLog stores the meal date in the `date` field
      const NutritionLog = require('../models/NutritionLog.model').default;
      const count = await NutritionLog.countDocuments({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        memberId: new mongoose.Types.ObjectId(memberId),
        date: { $gte: start, $lte: end },
      });
      return count > 0;
    }

    if (challengeType === 'workout_count' || challengeType === 'workout_week') {
      // Primary source: Attendance (gym check-in)
      try {
        const Attendance = require('../models/Attendance.model').default;
        const count = await Attendance.countDocuments({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          memberId: new mongoose.Types.ObjectId(memberId),
          checkInTime: { $gte: start, $lte: end },
        });
        if (count > 0) return true;
      } catch (_err) {
        // model unavailable — fall through
      }

      // Fallback: WorkoutLog (logged workout sessions)
      try {
        const WorkoutLog = require('../models/WorkoutLog.model').default;
        const count = await WorkoutLog.countDocuments({
          tenantId: new mongoose.Types.ObjectId(tenantId),
          memberId: new mongoose.Types.ObjectId(memberId),
          date: { $gte: start, $lte: end },
        });
        return count > 0;
      } catch (_err) {
        // model unavailable
      }

      return false;
    }

    return false;
  } catch (_err) {
    return false;
  }
}

// ── Nightly verification runner ───────────────────────────────────────────────
//
// Called by a cron job (via POST /api/habit-challenges/run-verification).
// Iterates all active HabitChallengeParticipation documents, verifies
// yesterday's activity, and marks the day achieved or missed.

export async function runNightlyHabitVerification(tenantId?: string): Promise<{
  processed: number;
  verified: number;
  completed: number;
}> {
  console.log(
    '[habit-challenge] Nightly verification starting for',
    tenantId ?? 'all tenants',
  );

  let processed = 0;
  let verified = 0;
  let completed = 0;

  try {
    // We require the model inline to avoid circular-dependency issues
    // (this service is imported by the routes file that also defines the model)
    const HabitChallengeParticipation =
      require('../models/HabitChallengeParticipation.model').default;
    const Member = require('../models/Member.model').default;

    const filter: Record<string, unknown> = { status: 'active' };
    if (tenantId) filter.tenantId = new mongoose.Types.ObjectId(tenantId);

    const participations = await HabitChallengeParticipation.find(filter).lean();

    // Yesterday at midnight (UTC-0)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const participation of participations) {
      processed++;
      try {
        const template = HABIT_CHALLENGE_TEMPLATES.find(
          (t) => t.id === participation.templateId,
        );
        if (!template) continue;

        // Skip if yesterday is before the challenge start
        if (yesterday < new Date(participation.startDate)) continue;
        // Skip if yesterday is after the challenge end
        if (yesterday > new Date(participation.endDate)) continue;

        // Check if we already have a calendar entry for yesterday
        const alreadyRecorded = (participation.calendarData as any[]).some(
          (d: any) =>
            new Date(d.date).toDateString() === yesterday.toDateString(),
        );
        if (alreadyRecorded) continue;

        const achieved = await verifyHabitProgress(
          String(participation.tenantId),
          String(participation.memberId),
          template.type,
          yesterday,
        );

        if (achieved) verified++;

        // Push calendar entry
        const newAchievedDays = participation.achievedDays + (achieved ? 1 : 0);
        const newCalendarData = [
          ...(participation.calendarData as any[]),
          { date: yesterday, achieved },
        ];

        // Determine if challenge is now complete
        const isComplete = newAchievedDays >= template.targetDays;
        const isPastEnd = today > new Date(participation.endDate);

        const update: Record<string, unknown> = {
          achievedDays: newAchievedDays,
          calendarData: newCalendarData,
        };

        if (isComplete) {
          update.status = 'completed';
          update.completedAt = new Date();
          completed++;

          // Award points to the member
          if (!participation.rewardGranted) {
            update.rewardGranted = true;
            try {
              await Member.findByIdAndUpdate(participation.memberId, {
                $inc: { 'gamification.totalPoints': template.rewardPoints },
              });
            } catch (_err) {
              // Points awarding is best-effort
            }
          }
        } else if (isPastEnd) {
          update.status = 'failed';
        }

        await HabitChallengeParticipation.findByIdAndUpdate(
          participation._id,
          { $set: update },
        );
      } catch (_err) {
        // Per-participation errors must not abort the whole run
      }
    }
  } catch (err) {
    console.error('[habit-challenge] Nightly verification error:', err);
  }

  console.log(
    `[habit-challenge] Done — processed=${processed} verified=${verified} completed=${completed}`,
  );
  return { processed, verified, completed };
}
