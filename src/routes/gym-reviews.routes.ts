import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import GymReview from '../models/GymReview.model';
import Attendance from '../models/Attendance.model';
import Subscription from '../models/Subscription.model';
import Member from '../models/Member.model';

const router = Router();

// ─── Public route (no auth) ───────────────────────────────────────────────────
// GET /gym-reviews/public?tenantId=xxx
router.get('/public', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, page = '1', limit = '20' } = req.query;
    if (!tenantId) return res.status(400).json({ success: false, message: 'tenantId required' });
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const [reviews, total] = await Promise.all([
      GymReview.find({ tenantId: String(tenantId), status: 'approved' })
        .populate('memberId', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      GymReview.countDocuments({ tenantId: String(tenantId), status: 'approved' }),
    ]);
    const masked = reviews.map((r: any) => {
      const member = r.memberId ?? {};
      const first: string = member.firstName ?? 'Member';
      const last: string = member.lastName ?? '';
      const maskedName = last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
      return {
        _id: r._id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        tags: r.tags,
        memberName: maskedName,
        isVerifiedMember: r.isVerifiedMember,
        visitCount: r.visitCount,
        adminReply: r.adminReply,
        adminRepliedAt: r.adminRepliedAt,
        createdAt: r.createdAt,
      };
    });
    return res.json({ success: true, data: { reviews: masked, total, page: parseInt(String(page)), pages: Math.ceil(total / parseInt(String(limit))) } });
  } catch (err) { next(err); }
});

// ─── Authenticated routes ─────────────────────────────────────────────────────
router.use(authenticate, tenantContext);

// GET /gym-reviews/stats — aggregate stats
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;

    const [distribution, totalDocs, verifiedCount, tagAgg] = await Promise.all([
      GymReview.aggregate([
        { $match: { tenantId: String(tenantId), status: 'approved' } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
      ]),
      GymReview.countDocuments({ tenantId: String(tenantId), status: 'approved' }),
      GymReview.countDocuments({ tenantId: String(tenantId), status: 'approved', isVerifiedMember: true }),
      GymReview.aggregate([
        { $match: { tenantId: String(tenantId), status: 'approved' } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const pendingCount = await GymReview.countDocuments({ tenantId: String(tenantId), status: 'pending' });

    const distMap: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;
    for (const d of distribution) {
      distMap[d._id] = d.count;
      totalRating += d._id * d.count;
    }
    const averageRating = totalDocs > 0 ? Math.round((totalRating / totalDocs) * 10) / 10 : 0;
    const verifiedPercent = totalDocs > 0 ? Math.round((verifiedCount / totalDocs) * 100) : 0;

    return res.json({
      success: true,
      data: {
        averageRating,
        totalReviews: totalDocs,
        pendingCount,
        verifiedPercent,
        distribution: distMap,
        topTags: tagAgg.map((t: any) => ({ tag: t._id, count: t.count })),
      },
    });
  } catch (err) { next(err); }
});

// GET /gym-reviews/my — member's own review
router.get('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?._id;
    const member = await Member.findOne({ userId, tenantId: String(tenantId) }).lean();
    if (!member) return res.json({ success: true, data: null });
    const review = await GymReview.findOne({ tenantId: String(tenantId), memberId: member._id }).lean();
    return res.json({ success: true, data: review ?? null });
  } catch (err) { next(err); }
});

// PUT /gym-reviews/my — member updates own pending/approved review
router.put('/my', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?._id;
    const member = await Member.findOne({ userId, tenantId: String(tenantId) }).lean();
    if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });

    const review = await GymReview.findOne({ tenantId: String(tenantId), memberId: member._id });
    if (!review) return res.status(404).json({ success: false, message: 'No review found to update' });
    if (review.status === 'hidden') {
      return res.status(403).json({ success: false, message: 'Hidden reviews cannot be edited' });
    }

    const { rating, title, body, tags } = req.body;
    if (rating !== undefined) {
      if (rating < 1 || rating > 5) return res.status(400).json({ success: false, message: 'Rating must be 1–5' });
      review.rating = rating;
    }
    if (title !== undefined) review.title = title;
    if (body !== undefined) review.body = body;
    if (tags !== undefined) review.tags = tags;
    // Reset to pending on edit
    review.status = 'pending';
    await review.save();
    return res.json({ success: true, data: review });
  } catch (err) { next(err); }
});

// GET /gym-reviews — admin/staff list all reviews
router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status, rating, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const filter: any = { tenantId: String(tenantId) };
    if (status) filter.status = status;
    if (rating) filter.rating = parseInt(String(rating));

    const [reviews, total] = await Promise.all([
      GymReview.find(filter)
        .populate('memberId', 'firstName lastName email mobile')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      GymReview.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { reviews, total, page: parseInt(String(page)), pages: Math.ceil(total / parseInt(String(limit))) } });
  } catch (err) { next(err); }
});

// POST /gym-reviews — member submits review
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?._id;

    const member = await Member.findOne({ userId, tenantId: String(tenantId) }).lean();
    if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });

    const { rating, title, body, tags } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Check existing review
    const existing = await GymReview.findOne({ tenantId: String(tenantId), memberId: member._id });
    if (existing && existing.status === 'approved') {
      return res.status(409).json({ success: false, message: 'You have already submitted a review for this gym' });
    }
    if (existing && existing.status === 'pending') {
      return res.status(409).json({ success: false, message: 'Your review is already pending approval' });
    }

    // Validate minimum 3 check-ins
    const visitCount = await Attendance.countDocuments({ tenantId: String(tenantId), memberId: member._id });
    if (visitCount < 3) {
      return res.status(403).json({
        success: false,
        message: 'You need at least 3 gym visits to leave a review',
        visitCount,
      });
    }

    // Check active subscription for verified member badge
    const now = new Date();
    const activeSub = await Subscription.findOne({
      tenantId: String(tenantId),
      memberId: member._id,
      status: 'active',
      endDate: { $gte: now },
    }).lean();
    const isVerifiedMember = !!activeSub;

    // If existing but hidden, update it
    if (existing) {
      existing.rating = rating;
      existing.title = title;
      existing.body = body;
      existing.tags = tags ?? [];
      existing.status = 'pending';
      existing.visitCount = visitCount;
      existing.isVerifiedMember = isVerifiedMember;
      await existing.save();
      return res.status(200).json({ success: true, data: existing });
    }

    const review = await GymReview.create({
      tenantId: String(tenantId),
      memberId: member._id,
      rating,
      title,
      body,
      tags: tags ?? [],
      status: 'pending',
      visitCount,
      isVerifiedMember,
    });
    return res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
});

// PUT /gym-reviews/:id/approve — admin approves review
router.put('/:id/approve', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const review = await GymReview.findOneAndUpdate(
      { _id: req.params.id, tenantId: String(tenantId) },
      { $set: { status: 'approved' } },
      { new: true }
    );
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    return res.json({ success: true, data: review });
  } catch (err) { next(err); }
});

// PUT /gym-reviews/:id/hide — admin hides review
router.put('/:id/hide', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const review = await GymReview.findOneAndUpdate(
      { _id: req.params.id, tenantId: String(tenantId) },
      { $set: { status: 'hidden' } },
      { new: true }
    );
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    return res.json({ success: true, data: review });
  } catch (err) { next(err); }
});

// POST /gym-reviews/:id/reply — admin sets reply
router.post('/:id/reply', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { reply } = req.body;
    if (!reply) return res.status(400).json({ success: false, message: 'reply text required' });
    if (reply.length > 500) return res.status(400).json({ success: false, message: 'Reply cannot exceed 500 characters' });
    const review = await GymReview.findOneAndUpdate(
      { _id: req.params.id, tenantId: String(tenantId) },
      { $set: { adminReply: reply, adminRepliedAt: new Date() } },
      { new: true }
    );
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    return res.json({ success: true, data: review });
  } catch (err) { next(err); }
});

export default router;
