import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import WellnessCheckIn from '../models/WellnessCheckIn.model';

const router = Router();
router.use(authenticate, tenantContext);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getScoreColor(score: number): string {
  if (score >= 4.5) return 'great';
  if (score >= 3.5) return 'good';
  if (score >= 2.5) return 'okay';
  if (score >= 2)   return 'bad';
  return 'terrible';
}

function generateInsights(records: any[]): Array<{ insight: string; type: 'positive' | 'tip' | 'warning' }> {
  const insights: Array<{ insight: string; type: 'positive' | 'tip' | 'warning' }> = [];
  if (records.length < 5) {
    insights.push({ insight: 'Keep checking in daily to unlock personalised insights after 5 days.', type: 'tip' });
    return insights;
  }

  // Sleep vs energy correlation
  const withSleep = records.filter(r => r.sleepHours != null);
  if (withSleep.length >= 3) {
    const highSleep = withSleep.filter(r => r.sleepHours >= 7);
    const lowSleep  = withSleep.filter(r => r.sleepHours < 7);
    if (highSleep.length && lowSleep.length) {
      const avgEnergyHighSleep = highSleep.reduce((s: number, r: any) => s + r.energyLevel, 0) / highSleep.length;
      const avgEnergyLowSleep  = lowSleep.reduce((s: number, r: any)  => s + r.energyLevel, 0) / lowSleep.length;
      if (avgEnergyHighSleep - avgEnergyLowSleep >= 0.8) {
        insights.push({ insight: 'Your energy is consistently higher on days you log 7+ hours of sleep.', type: 'positive' });
      }
    }
  }

  // Day-of-week patterns (wellbeing)
  const byDow: Record<number, number[]> = {};
  records.forEach(r => {
    const dow = new Date(r.date).getDay();
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(r.wellbeingScore);
  });
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let minDow = -1; let minAvg = 99;
  Object.entries(byDow).forEach(([d, scores]) => {
    if (scores.length < 2) return;
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    if (avg < minAvg) { minAvg = avg; minDow = Number(d); }
  });
  if (minDow >= 0 && minAvg < 3) {
    insights.push({ insight: `Your wellbeing tends to dip on ${DOW[minDow]}s — consider a lighter workout or a recovery session.`, type: 'tip' });
  }

  // Stress trend
  const recentStress = records.slice(0, 7).map(r => r.stressLevel);
  if (recentStress.length >= 3) {
    const avgStress = recentStress.reduce((s, v) => s + v, 0) / recentStress.length;
    if (avgStress < 2.5) {
      insights.push({ insight: 'Your stress levels have been elevated this week. Consider adding a mindfulness activity.', type: 'warning' });
    }
  }

  // Motivation trend
  const recentMotivation = records.slice(0, 7).map(r => r.motivationLevel);
  if (recentMotivation.length >= 3) {
    const avgMotivation = recentMotivation.reduce((s, v) => s + v, 0) / recentMotivation.length;
    if (avgMotivation >= 4) {
      insights.push({ insight: 'You\'re on a high-motivation streak this week — great time to push new personal records!', type: 'positive' });
    }
  }

  // Hydration vs wellbeing
  const withHydration = records.filter(r => r.hydrationGlasses != null);
  if (withHydration.length >= 3) {
    const goodHydration = withHydration.filter(r => r.hydrationGlasses >= 8);
    if (goodHydration.length / withHydration.length >= 0.6) {
      insights.push({ insight: 'Staying well-hydrated — great habit! Consistent hydration supports recovery and energy.', type: 'positive' });
    } else {
      insights.push({ insight: 'Try to drink at least 8 glasses of water daily for better energy and recovery.', type: 'tip' });
    }
  }

  return insights.slice(0, 6);
}

// ─── GET /today — today's check-in for current user ───────────────────────────
router.get('/today', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user?._id ?? req.query.memberId;
    const record = await WellnessCheckIn.findOne({ tenantId, memberId, dateStr: todayStr() }).lean();
    return res.json({ success: true, data: record ?? null });
  } catch (err) { next(err); }
});

// ─── POST / — submit today's check-in (upsert) ───────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = (req as any).user?._id ?? req.body.memberId;
    const {
      energyLevel, wellbeingScore, perceivedStrength,
      sleepQuality, stressLevel, motivationLevel,
      sleepHours, hydrationGlasses, note,
    } = req.body;

    const dateStr = todayStr();
    const date    = new Date(dateStr);

    // Validate required fields
    const required = { energyLevel, wellbeingScore, perceivedStrength, sleepQuality, stressLevel, motivationLevel };
    for (const [key, val] of Object.entries(required)) {
      const n = Number(val);
      if (!val || isNaN(n) || n < 1 || n > 5) {
        return res.status(400).json({ success: false, message: `${key} must be 1-5` });
      }
    }

    const payload: any = {
      tenantId, memberId, date, dateStr,
      energyLevel: Number(energyLevel),
      wellbeingScore: Number(wellbeingScore),
      perceivedStrength: Number(perceivedStrength),
      sleepQuality: Number(sleepQuality),
      stressLevel: Number(stressLevel),
      motivationLevel: Number(motivationLevel),
    };
    if (sleepHours != null)        payload.sleepHours        = Number(sleepHours);
    if (hydrationGlasses != null)  payload.hydrationGlasses  = Number(hydrationGlasses);
    if (note)                      payload.note              = String(note).slice(0, 500);

    // Upsert — findOneAndUpdate with new doc + runValidators
    const record = await WellnessCheckIn.findOneAndUpdate(
      { tenantId, memberId, dateStr },
      payload,
      { upsert: true, new: true, runValidators: false, setDefaultsOnInsert: true },
    );

    // Trigger pre-save hook manually (findOneAndUpdate bypasses it)
    const core = [
      payload.energyLevel, payload.wellbeingScore,
      payload.perceivedStrength, payload.sleepQuality, payload.motivationLevel,
    ];
    const avg = core.reduce((s, v) => s + v, 0) / core.length;
    const overallScore = Math.round(avg * 10) / 10;
    let mood: string;
    if (avg < 2)        mood = 'terrible';
    else if (avg < 2.5) mood = 'bad';
    else if (avg < 3.5) mood = 'okay';
    else if (avg < 4.5) mood = 'good';
    else                mood = 'great';

    const finalRecord = await WellnessCheckIn.findByIdAndUpdate(
      record._id,
      { overallScore, mood },
      { new: true },
    ).lean();

    return res.status(201).json({ success: true, data: finalRecord });
  } catch (err: any) {
    if (err.code === 11000) {
      // Duplicate — just return existing
      const tenantId = (req as any).tenantId;
      const memberId = (req as any).user?._id ?? req.body.memberId;
      const existing = await WellnessCheckIn.findOne({ tenantId, memberId, dateStr: todayStr() }).lean();
      return res.json({ success: true, data: existing });
    }
    next(err);
  }
});

// ─── GET /history — last 30 days (default) ───────────────────────────────────
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = req.query.memberId ?? (req as any).user?._id;
    const limit    = Math.min(parseInt(String(req.query.limit ?? '30')), 90);
    const filter: any = { tenantId, memberId };
    if (req.query.from || req.query.to) {
      filter.date = {};
      if (req.query.from) filter.date.$gte = new Date(String(req.query.from));
      if (req.query.to)   filter.date.$lte = new Date(String(req.query.to));
    }
    const records = await WellnessCheckIn.find(filter).sort({ date: -1 }).limit(limit).lean();
    return res.json({ success: true, data: records });
  } catch (err) { next(err); }
});

// ─── GET /streak ─────────────────────────────────────────────────────────────
router.get('/streak', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = req.query.memberId ?? (req as any).user?._id;
    const records  = await WellnessCheckIn.find({ tenantId, memberId }).sort({ date: -1 }).select('dateStr').lean();

    let currentStreak = 0;
    let longestStreak = 0;
    let streak        = 0;
    let prev: string | null = null;

    for (const r of records) {
      if (!prev) {
        // Check if most recent is today or yesterday
        const diff = Math.round((new Date(todayStr()).getTime() - new Date(r.dateStr).getTime()) / 86400000);
        if (diff <= 1) { streak = 1; prev = r.dateStr; }
        else break;
      } else {
        const diff = Math.round((new Date(prev).getTime() - new Date(r.dateStr).getTime()) / 86400000);
        if (diff === 1) { streak++; prev = r.dateStr; }
        else break;
      }
    }
    currentStreak = streak;

    // Longest streak from all records (ascending order)
    const sorted = [...records].sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    let run = 0;
    let runPrev: string | null = null;
    for (const r of sorted) {
      if (!runPrev) { run = 1; runPrev = r.dateStr; }
      else {
        const diff = Math.round((new Date(r.dateStr).getTime() - new Date(runPrev).getTime()) / 86400000);
        if (diff === 1) { run++; runPrev = r.dateStr; }
        else { run = 1; runPrev = r.dateStr; }
      }
      if (run > longestStreak) longestStreak = run;
    }

    return res.json({ success: true, data: { currentStreak, longestStreak } });
  } catch (err) { next(err); }
});

// ─── GET /trends — aggregated weekly trends ───────────────────────────────────
router.get('/trends', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = req.query.memberId ?? (req as any).user?._id;
    const period   = parseInt(String(req.query.period ?? '30'));

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - period);

    const records = await WellnessCheckIn.find({
      tenantId, memberId,
      date: { $gte: fromDate },
    }).sort({ date: 1 }).lean();

    if (!records.length) {
      return res.json({ success: true, data: { weekly: [], checkInStreak: 0, totalCheckIns: 0, bestDay: null, worstDay: null } });
    }

    // Weekly aggregation
    const weeks: Record<number, any[]> = {};
    records.forEach(r => {
      const d    = new Date(r.date);
      const daysSinceFrom = Math.floor((d.getTime() - fromDate.getTime()) / 86400000);
      const weekIndex = Math.floor(daysSinceFrom / 7);
      if (!weeks[weekIndex]) weeks[weekIndex] = [];
      weeks[weekIndex].push(r);
    });

    const weekly = Object.entries(weeks).map(([idx, wRecs]) => {
      const avg = (field: string) => {
        const vals = wRecs.map((r: any) => r[field]).filter(Boolean);
        return vals.length ? +(vals.reduce((s: number, v: number) => s + v, 0) / vals.length).toFixed(2) : 0;
      };
      return {
        weekIndex: Number(idx),
        label: `Week ${Number(idx) + 1}`,
        count: wRecs.length,
        avgEnergy:     avg('energyLevel'),
        avgWellbeing:  avg('wellbeingScore'),
        avgStrength:   avg('perceivedStrength'),
        avgSleep:      avg('sleepQuality'),
        avgStress:     avg('stressLevel'),
        avgMotivation: avg('motivationLevel'),
        avgOverall:    avg('overallScore'),
      };
    });

    // Best / worst day
    const sorted = [...records].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0));
    const bestDay  = sorted[0]  ? { date: sorted[0].dateStr,  score: sorted[0].overallScore,  mood: sorted[0].mood }  : null;
    const worstDay = sorted[sorted.length - 1] ? { date: sorted[sorted.length - 1].dateStr, score: sorted[sorted.length - 1].overallScore, mood: sorted[sorted.length - 1].mood } : null;

    // Current streak (reuse same logic)
    const streakRecords = await WellnessCheckIn.find({ tenantId, memberId }).sort({ date: -1 }).select('dateStr').lean();
    let streak = 0; let prev: string | null = null;
    for (const r of streakRecords) {
      if (!prev) {
        const diff = Math.round((new Date(todayStr()).getTime() - new Date(r.dateStr).getTime()) / 86400000);
        if (diff <= 1) { streak = 1; prev = r.dateStr; }
        else break;
      } else {
        const diff = Math.round((new Date(prev).getTime() - new Date(r.dateStr).getTime()) / 86400000);
        if (diff === 1) { streak++; prev = r.dateStr; }
        else break;
      }
    }

    return res.json({
      success: true,
      data: { weekly, checkInStreak: streak, totalCheckIns: records.length, bestDay, worstDay },
    });
  } catch (err) { next(err); }
});

// ─── GET /insights — programmatic pattern insights ────────────────────────────
router.get('/insights', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const memberId = req.query.memberId ?? (req as any).user?._id;
    const records  = await WellnessCheckIn.find({ tenantId, memberId }).sort({ date: -1 }).limit(30).lean();
    const insights = generateInsights(records);
    return res.json({ success: true, data: insights });
  } catch (err) { next(err); }
});

// ─── GET /stats/admin — tenant-wide wellness overview ─────────────────────────
router.get('/stats/admin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const todayDate = todayStr();

    const [todayStats, weeklyStats] = await Promise.all([
      WellnessCheckIn.aggregate([
        { $match: { tenantId, dateStr: todayDate } },
        { $group: {
          _id: null,
          count:          { $sum: 1 },
          avgEnergy:      { $avg: '$energyLevel' },
          avgWellbeing:   { $avg: '$wellbeingScore' },
          avgStrength:    { $avg: '$perceivedStrength' },
          avgSleep:       { $avg: '$sleepQuality' },
          avgStress:      { $avg: '$stressLevel' },
          avgMotivation:  { $avg: '$motivationLevel' },
          avgOverall:     { $avg: '$overallScore' },
        }},
      ]),
      WellnessCheckIn.aggregate([
        { $match: { tenantId, date: { $gte: new Date(new Date().getTime() - 7 * 86400000) } } },
        { $group: {
          _id: null,
          count:         { $sum: 1 },
          avgEnergy:     { $avg: '$energyLevel' },
          avgWellbeing:  { $avg: '$wellbeingScore' },
          avgOverall:    { $avg: '$overallScore' },
        }},
      ]),
    ]);

    const round2 = (v: number) => Math.round(v * 100) / 100;
    const t = todayStats[0] ?? {};
    const w = weeklyStats[0] ?? {};

    return res.json({
      success: true,
      data: {
        today: {
          checkIns:      t.count ?? 0,
          avgEnergy:     round2(t.avgEnergy ?? 0),
          avgWellbeing:  round2(t.avgWellbeing ?? 0),
          avgStrength:   round2(t.avgStrength ?? 0),
          avgSleep:      round2(t.avgSleep ?? 0),
          avgStress:     round2(t.avgStress ?? 0),
          avgMotivation: round2(t.avgMotivation ?? 0),
          avgOverall:    round2(t.avgOverall ?? 0),
        },
        weekly: {
          checkIns:     w.count ?? 0,
          avgEnergy:    round2(w.avgEnergy ?? 0),
          avgWellbeing: round2(w.avgWellbeing ?? 0),
          avgOverall:   round2(w.avgOverall ?? 0),
        },
      },
    });
  } catch (err) { next(err); }
});

export default router;
