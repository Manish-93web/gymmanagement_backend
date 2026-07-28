import PointsExpiryConfig from '../models/PointsExpiryConfig.model';

let RewardPoints: any;
try { RewardPoints = require('../models/RewardPoints.model').default; } catch {}

export async function expirePointsForTenant(tenantId: string, expiryDays: number): Promise<{ expired: number; warned: number }> {
  let expired = 0, warned = 0;

  if (!RewardPoints) return { expired: 0, warned: 0 };

  try {
    const now = new Date();
    const expiryThreshold = new Date(now.getTime() - expiryDays * 24 * 60 * 60 * 1000);
    const warningThreshold = new Date(now.getTime() - (expiryDays - 7) * 24 * 60 * 60 * 1000);

    // Find points earned before expiry threshold and still active
    // Try both possible field names/structures
    const expiredPoints = await RewardPoints.updateMany(
      {
        tenantId,
        $or: [
          { earnedAt: { $lt: expiryThreshold }, status: { $ne: 'expired' } },
          { createdAt: { $lt: expiryThreshold }, status: { $ne: 'expired' } },
        ],
      },
      { $set: { status: 'expired', expiredAt: now } }
    );
    expired = expiredPoints.modifiedCount || 0;

    // Find points about to expire (within warning window)
    const warningPoints = await RewardPoints.countDocuments({
      tenantId,
      $or: [
        { earnedAt: { $lt: warningThreshold, $gt: expiryThreshold } },
        { createdAt: { $lt: warningThreshold, $gt: expiryThreshold } },
      ],
      status: { $ne: 'expired' },
    });
    warned = warningPoints;

    console.log(`[PointsExpiry] Tenant ${tenantId}: expired=${expired}, at-risk=${warned}`);
  } catch (e) {
    console.error(`[PointsExpiry] Error for tenant ${tenantId}:`, e);
  }

  return { expired, warned };
}

export async function runExpiryCheck(): Promise<void> {
  try {
    const configs = await PointsExpiryConfig.find({ enabled: true, autoExpire: true });
    for (const config of configs) {
      await expirePointsForTenant(config.tenantId, config.expiryDays);
      await PointsExpiryConfig.findByIdAndUpdate(config._id, { lastRunAt: new Date() });
    }
  } catch (e) {
    console.error('[PointsExpiry] runExpiryCheck error:', e);
  }
}

export function schedulePointsExpiry(): void {
  // Run daily at midnight
  const msToMidnight = () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0);
    return tomorrow.getTime() - now.getTime();
  };

  const scheduleNext = () => {
    setTimeout(async () => {
      await runExpiryCheck();
      scheduleNext();
    }, msToMidnight());
  };

  scheduleNext();
  console.log('[PointsExpiry] Points expiry scheduler started');
}
