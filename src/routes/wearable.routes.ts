import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import WearableData from '../models/WearableData.model';

const router = Router();
router.use(authenticate, tenantContext);

// GET /wearable/member/:memberId — get wearable profile + recent entries
router.get('/member/:memberId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { memberId } = req.params;
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const days = parseInt(String(req.query.days || '30'));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const wearable = await WearableData.findOne({ tenantId, memberId }).lean();
    if (!wearable) return res.json({ success: true, data: null });

    const recentEntries = (wearable.entries || [])
      .filter(e => new Date(e.date) >= since)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Compute summary stats over the window
    const summary = recentEntries.reduce((acc, e) => {
      if (e.steps) { acc.totalSteps += e.steps; acc.stepDays++; }
      if (e.activeCalories) { acc.totalCalories += e.activeCalories; }
      if (e.heartRate?.avg) { acc.hrSum += e.heartRate.avg; acc.hrDays++; }
      if (e.sleep?.duration) { acc.sleepSum += e.sleep.duration; acc.sleepDays++; }
      acc.totalWorkouts += (e.workouts || []).length;
      return acc;
    }, { totalSteps: 0, stepDays: 0, totalCalories: 0, hrSum: 0, hrDays: 0, sleepSum: 0, sleepDays: 0, totalWorkouts: 0 });

    return res.json({
      success: true,
      data: {
        deviceType: wearable.deviceType,
        deviceId: wearable.deviceId,
        deviceProfile: wearable.deviceProfile,
        connected: wearable.connected,
        lastSyncAt: wearable.lastSyncAt,
        entries: recentEntries.slice(0, 30),
        summary: {
          avgDailySteps: summary.stepDays > 0 ? Math.round(summary.totalSteps / summary.stepDays) : 0,
          totalCaloriesBurned: summary.totalCalories,
          avgHeartRate: summary.hrDays > 0 ? Math.round(summary.hrSum / summary.hrDays) : 0,
          avgSleepMinutes: summary.sleepDays > 0 ? Math.round(summary.sleepSum / summary.sleepDays) : 0,
          totalWorkouts: summary.totalWorkouts,
          daysTracked: recentEntries.length,
        },
      },
    });
  } catch (err) { next(err); }
});

// POST /wearable/member/:memberId/connect — register/update device connection
router.post('/member/:memberId/connect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { memberId } = req.params;
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const { deviceType, deviceId, accessToken, refreshToken, tokenExpiresAt, deviceProfile } = req.body;
    if (!deviceType) return res.status(400).json({ success: false, message: 'deviceType is required' });

    const doc = await WearableData.findOneAndUpdate(
      { tenantId, memberId, deviceType },
      {
        $set: {
          deviceId, connected: true, lastSyncAt: new Date(), deviceProfile,
          ...(accessToken && { accessToken }),
          ...(refreshToken && { refreshToken }),
          ...(tokenExpiresAt && { tokenExpiresAt: new Date(tokenExpiresAt) }),
        },
        $setOnInsert: { entries: [] },
      },
      { new: true, upsert: true }
    );
    return res.json({ success: true, data: { _id: doc._id, deviceType: doc.deviceType, connected: doc.connected } });
  } catch (err) { next(err); }
});

// POST /wearable/member/:memberId/disconnect — mark device as disconnected
router.post('/member/:memberId/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { memberId } = req.params;
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const { deviceType } = req.body;
    await WearableData.updateMany(
      { tenantId, memberId, ...(deviceType && { deviceType }) },
      { $set: { connected: false } }
    );
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /wearable/member/:memberId/sync — push new daily data entries
router.post('/member/:memberId/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { memberId } = req.params;
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const { deviceType, entries } = req.body;
    if (!deviceType) return res.status(400).json({ success: false, message: 'deviceType is required' });
    if (!Array.isArray(entries) || entries.length === 0) return res.status(400).json({ success: false, message: 'entries array is required' });

    const doc = await WearableData.findOneAndUpdate(
      { tenantId, memberId, deviceType },
      {
        $set: { lastSyncAt: new Date(), connected: true },
        $setOnInsert: { entries: [] },
      },
      { new: true, upsert: true }
    );

    let added = 0;
    for (const entry of entries) {
      const date = new Date(entry.date);
      date.setHours(0, 0, 0, 0);
      const exists = doc.entries.some(e => {
        const ed = new Date(e.date); ed.setHours(0, 0, 0, 0);
        return ed.getTime() === date.getTime();
      });
      if (!exists) {
        doc.entries.push({ ...entry, date });
        added++;
      } else {
        // Update existing entry
        const idx = doc.entries.findIndex(e => {
          const ed = new Date(e.date); ed.setHours(0, 0, 0, 0);
          return ed.getTime() === date.getTime();
        });
        if (idx >= 0) Object.assign(doc.entries[idx], { ...entry, date });
      }
    }
    // Keep only last 365 entries
    doc.entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (doc.entries.length > 365) doc.entries = doc.entries.slice(0, 365);
    await doc.save();
    return res.json({ success: true, data: { synced: entries.length, added, total: doc.entries.length } });
  } catch (err) { next(err); }
});

// POST /wearable/member/:memberId/log — log a single manual entry (e.g. manual workout)
router.post('/member/:memberId/log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { memberId } = req.params;
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const entry = { ...req.body, date: new Date(req.body.date || Date.now()) };
    const doc = await WearableData.findOneAndUpdate(
      { tenantId, memberId, deviceType: 'manual' },
      {
        $push: { entries: { $each: [entry], $position: 0 } },
        $set: { lastSyncAt: new Date(), connected: true },
        $setOnInsert: { },
      },
      { new: true, upsert: true }
    );
    return res.json({ success: true, data: { total: doc.entries.length } });
  } catch (err) { next(err); }
});

// GET /wearable/leaderboard — top members by steps this week (tenant-wide)
router.get('/leaderboard', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const all = await WearableData.find({ tenantId, connected: true })
      .populate('memberId', 'firstName lastName')
      .lean();
    const ranked = all
      .map(w => {
        const weekSteps = (w.entries || [])
          .filter(e => new Date(e.date) >= since)
          .reduce((s, e) => s + (e.steps || 0), 0);
        return {
          memberId: w.memberId,
          deviceType: w.deviceType,
          weekSteps,
        };
      })
      .filter(x => x.weekSteps > 0)
      .sort((a, b) => b.weekSteps - a.weekSteps)
      .slice(0, 10);
    return res.json({ success: true, data: ranked });
  } catch (err) { next(err); }
});

export default router;
