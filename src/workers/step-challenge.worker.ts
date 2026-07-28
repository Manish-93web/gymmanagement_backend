import cron from 'node-cron';
import logger from '../config/logger';
import StepChallenge from '../models/StepChallenge.model';
import StepChallengeProgress from '../models/StepChallengeProgress.model';
import WearableData from '../models/WearableData.model';
import Member from '../models/Member.model';

// ── Core verification logic (extracted for reuse) ─────────────────────────────

export async function runStepChallengeVerification(targetDateOverride?: Date): Promise<{
  verified: number;
  skipped: number;
  failed: number;
}> {
  const yesterday = targetDateOverride ? new Date(targetDateOverride) : new Date();
  if (!targetDateOverride) {
    yesterday.setDate(yesterday.getDate() - 1);
  }
  yesterday.setHours(0, 0, 0, 0);

  const tomorrowOfYesterday = new Date(yesterday);
  tomorrowOfYesterday.setDate(tomorrowOfYesterday.getDate() + 1);

  const yesterdayStr = yesterday.toISOString().slice(0, 10); // 'YYYY-MM-DD'

  logger.info(`[StepChallenge Worker] Verifying steps for date: ${yesterdayStr}`);

  // Find all currently active challenges
  const activeChallenges = await StepChallenge.find({ status: 'active' }).lean();

  logger.info(`[StepChallenge Worker] Found ${activeChallenges.length} active challenge(s)`);

  let verified = 0;
  let skipped = 0;
  let failed = 0;

  for (const challenge of activeChallenges) {
    if (!challenge.participants?.length) continue;

    const tenantId = challenge.tenantId;
    const dailyTarget = challenge.dailyTarget || 8000;
    const durationDays = challenge.durationDays || 30;

    for (const participant of challenge.participants) {
      const memberId = String(participant.memberId);

      try {
        // Skip if a progress record already exists for this date (avoid double-writing)
        const existing = await StepChallengeProgress.findOne({
          tenantId,
          challengeId: String(challenge._id),
          memberId,
          date: { $gte: yesterday, $lt: tomorrowOfYesterday },
        }).lean();

        if (existing) {
          skipped++;
          continue;
        }

        // Pull yesterday's steps from WearableData
        let stepCount = 0;
        let source = 'auto_cron';

        try {
          const wearable = await WearableData.findOne({ tenantId, memberId }).lean();

          if (wearable?.entries?.length) {
            const entry = wearable.entries.find((e) => {
              const entryDate = new Date(e.date);
              entryDate.setHours(0, 0, 0, 0);
              return entryDate.getTime() === yesterday.getTime();
            });

            if (entry?.steps) {
              stepCount = entry.steps;
              source = wearable.deviceType || 'wearable';
            }
          }
        } catch (wearableErr: any) {
          logger.warn(
            `[StepChallenge Worker] WearableData lookup failed for member ${memberId}: ${wearableErr.message}`,
          );
        }

        const achieved = stepCount >= dailyTarget;

        // Upsert the daily progress record
        await StepChallengeProgress.findOneAndUpdate(
          {
            tenantId,
            challengeId: String(challenge._id),
            memberId,
            date: yesterday,
          },
          {
            $set: {
              stepCount,
              targetSteps: dailyTarget,
              achieved,
              source,
            },
          },
          { upsert: true, new: true },
        );

        // Recompute participant totals from all records in this challenge
        const allProgress = await StepChallengeProgress.find({
          tenantId,
          challengeId: String(challenge._id),
          memberId,
        }).lean();

        const totalSteps = allProgress.reduce((sum, r) => sum + r.stepCount, 0);
        const daysAchieved = allProgress.filter((r) => r.achieved).length;

        // Update challenge's participant entry
        const challengeDoc = await StepChallenge.findById(challenge._id);
        if (!challengeDoc) {
          failed++;
          continue;
        }

        const pIdx = challengeDoc.participants.findIndex(
          (p) => String(p.memberId) === memberId,
        );

        if (pIdx >= 0) {
          challengeDoc.participants[pIdx].totalSteps = totalSteps;
          challengeDoc.participants[pIdx].daysAchieved = daysAchieved;
        }

        // Re-rank all participants by totalSteps
        const sorted = [...challengeDoc.participants].sort((a, b) => b.totalSteps - a.totalSteps);
        sorted.forEach((sp, i) => {
          const idx = challengeDoc.participants.findIndex(
            (cp) => String(cp.memberId) === String(sp.memberId),
          );
          if (idx >= 0) challengeDoc.participants[idx].rank = i + 1;
        });

        await challengeDoc.save();

        // Award points if member has now completed the challenge target days
        if (daysAchieved >= durationDays) {
          setImmediate(async () => {
            try {
              const member = await Member.findById(memberId);
              if (member && member.gamification !== undefined) {
                const pts = (member.gamification.totalPoints || 0) + (challenge.rewardPoints || 100);
                member.gamification.totalPoints = pts;
                await member.save();
                logger.info(
                  `[StepChallenge Worker] Awarded ${challenge.rewardPoints || 100} pts to member ${memberId}`,
                );
              }
            } catch (awardErr: any) {
              logger.warn(
                `[StepChallenge Worker] Point award failed for member ${memberId}: ${awardErr.message}`,
              );
            }
          });
        }

        verified++;
      } catch (err: any) {
        logger.error(
          `[StepChallenge Worker] Failed for member ${memberId} in challenge ${challenge._id}: ${err.message}`,
        );
        failed++;
      }
    }
  }

  logger.info(
    `[StepChallenge Worker] Done for ${yesterdayStr}. verified=${verified}, skipped=${skipped}, failed=${failed}`,
  );

  return { verified, skipped, failed };
}

// ── Singleton cron scheduler ──────────────────────────────────────────────────

class StepChallengeWorker {
  private static instance: StepChallengeWorker;

  private constructor() {
    this.initializeSchedule();
  }

  public static getInstance(): StepChallengeWorker {
    if (!StepChallengeWorker.instance) {
      StepChallengeWorker.instance = new StepChallengeWorker();
    }
    return StepChallengeWorker.instance;
  }

  private initializeSchedule() {
    // Run at 00:01 every day — 1 minute after midnight so wearable sync has landed
    cron.schedule('1 0 * * *', async () => {
      logger.info('[StepChallenge Worker] Midnight cron triggered');
      try {
        await runStepChallengeVerification();
      } catch (err: any) {
        logger.error('[StepChallenge Worker] Fatal cron error:', err.message);
      }
    });

    logger.info('[StepChallenge Worker] Midnight step-verification cron scheduled (01:00 daily)');
  }
}

export default StepChallengeWorker.getInstance();
