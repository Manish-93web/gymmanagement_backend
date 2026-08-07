import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import VideoContent from '../models/VideoContent.model';
import WellnessLog from '../models/WellnessLog.model';
import Member from '../models/Member.model';

/**
 * Resolve the Member._id for the authenticated user. The mobile app has no
 * way to know its own Member document id (only the User id), so wellness
 * endpoints resolve it server-side the same way tele-consultation.routes.ts
 * does via `Member.findOne({ userId, tenantId })`.
 */
async function resolveSelfMemberId(req: Request): Promise<string | null> {
  const explicit = req.query.memberId || req.body?.memberId;
  if (explicit) return String(explicit);
  const tenantId = (req as any).user?.tenantId || req.tenantId;
  const userId = (req as any).user?._id;
  if (!userId) return null;
  const member = await Member.findOne({ userId, tenantId }).select('_id').lean();
  return member?._id ? String(member._id) : null;
}

const router = Router();
router.use(authenticate, tenantContext);

// ─── Video Library ─────────────────────────────────────────────────────────────

// GET /videos — list videos with filters
router.get('/videos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const { category, difficulty, q, isPremium, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const filter: any = {
      isPublished: true,
      $or: [{ tenantId }, { tenantId: null }],
    };
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (isPremium !== undefined) filter.isPremium = isPremium === 'true';
    if (q) filter.$text = { $search: String(q) };

    const [videos, total] = await Promise.all([
      VideoContent.find(filter)
        .sort({ sortOrder: 1, viewCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      VideoContent.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { videos, total, page: parseInt(String(page)), pages: Math.ceil(total / parseInt(String(limit))) } });
  } catch (err) { next(err); }
});

// GET /videos/:id — single video
router.get('/videos/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const video = await VideoContent.findById(req.params.id).lean();
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });
    // Increment view count asynchronously
    VideoContent.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec();
    return res.json({ success: true, data: video });
  } catch (err) { next(err); }
});

// POST /videos/:id/like — toggle like
router.post('/videos/:id/like', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const video = await VideoContent.findByIdAndUpdate(
      req.params.id,
      { $inc: { likeCount: 1 } },
      { new: true }
    ).lean();
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });
    return res.json({ success: true, data: { likeCount: video.likeCount } });
  } catch (err) { next(err); }
});

// POST /videos/:id/rate — submit 1–5 star rating
router.post('/videos/:id/rate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rating = parseInt(String(req.body.rating));
    if (isNaN(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'rating must be 1–5' });
    }
    const video = await VideoContent.findByIdAndUpdate(
      req.params.id,
      { $inc: { ratingSum: rating, ratingCount: 1 } },
      { new: true }
    ).lean();
    if (!video) return res.status(404).json({ success: false, message: 'Video not found' });
    const ratingAvg = video.ratingCount > 0 ? +(video.ratingSum / video.ratingCount).toFixed(1) : 0;
    return res.json({ success: true, data: { ratingAvg, ratingCount: video.ratingCount } });
  } catch (err) { next(err); }
});

// POST /videos — create video (admin/gym_owner)
router.post('/videos', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const userId = (req as any).user?._id;
    const video = await VideoContent.create({ ...req.body, tenantId, createdBy: userId });
    return res.status(201).json({ success: true, data: video });
  } catch (err) { next(err); }
});

// PUT /videos/:id — update video
router.put('/videos/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const video = await VideoContent.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!video) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: video });
  } catch (err) { next(err); }
});

// DELETE /videos/:id
router.delete('/videos/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await VideoContent.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /videos/categories/list — unique categories
router.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cats = await VideoContent.distinct('category', { isPublished: true });
    return res.json({ success: true, data: cats });
  } catch (err) { next(err); }
});

// ─── Mental Wellness / Mood Tracking ─────────────────────────────────────────

// GET /wellness/logs — member wellness history
router.get('/wellness/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const memberId = await resolveSelfMemberId(req);
    if (!memberId) {
      return res.json({ success: true, data: { logs: [], weeklyAvg: { mood: 0, energyLevel: 0, stressLevel: 0, sleepQuality: 0 } } });
    }
    const days = parseInt(String(req.query.days || '30'));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const filter: any = { tenantId, date: { $gte: since }, memberId };

    const logs = await WellnessLog.find(filter)
      .sort({ date: -1 })
      .limit(90)
      .lean();

    // Compute 7-day averages
    const last7 = logs.filter(l => new Date(l.date) >= new Date(Date.now() - 7 * 86400000));
    const avg = (field: keyof typeof logs[0]) =>
      last7.length ? Math.round(last7.reduce((s, l) => s + Number(l[field] ?? 0), 0) / last7.length * 10) / 10 : 0;

    return res.json({
      success: true,
      data: {
        logs,
        weeklyAvg: {
          mood: avg('mood'), energyLevel: avg('energyLevel'),
          stressLevel: avg('stressLevel'), sleepQuality: avg('sleepQuality'),
        },
      },
    });
  } catch (err) { next(err); }
});

// POST /wellness/logs — log daily check-in
router.post('/wellness/logs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const memberId = await resolveSelfMemberId(req);
    if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' });

    const { mood, energyLevel, stressLevel, sleepQuality, sleepHours, notes, activitiesDone, gratitudeEntry, affirmation, videoWatched } = req.body;
    if (!mood || !energyLevel || !stressLevel || !sleepQuality) {
      return res.status(400).json({ success: false, message: 'mood, energyLevel, stressLevel, sleepQuality are required' });
    }

    const date = new Date(req.body.date || Date.now());
    date.setHours(0, 0, 0, 0);
    const log = await WellnessLog.findOneAndUpdate(
      { tenantId, memberId, date },
      { $set: { mood, energyLevel, stressLevel, sleepQuality, sleepHours, notes, activitiesDone, gratitudeEntry, affirmation, videoWatched } },
      { new: true, upsert: true }
    );
    return res.status(201).json({ success: true, data: log });
  } catch (err) { next(err); }
});

// GET /wellness/affirmation — daily AI-generated affirmation
router.get('/wellness/affirmation', async (req: Request, res: Response, next: NextFunction) => {
  const AFFIRMATIONS = [
    "Every rep brings me closer to my best self.",
    "I am stronger than I was yesterday.",
    "Rest is part of the process. I recover and grow.",
    "I choose health. I choose strength. I choose me.",
    "Progress, not perfection, is my goal.",
    "My body is capable of incredible things.",
    "I am consistent, disciplined, and focused.",
    "Challenges make me stronger. I welcome them.",
    "I fuel my body with purpose and intention.",
    "Small steps daily lead to massive results.",
    "I am worthy of health, happiness, and strength.",
    "My mindset shapes my physique. I think strong.",
  ];
  const today = new Date().getDay();
  return res.json({ success: true, data: { affirmation: AFFIRMATIONS[today % AFFIRMATIONS.length] } });
});

export default router;
