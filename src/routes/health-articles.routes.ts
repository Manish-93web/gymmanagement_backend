import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import HealthArticle from '../models/HealthArticle.model';
import { ArticleRead } from '../models/ArticleRead.model';

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────────

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

/** Average adult reading speed: 200 words per minute */
const computeReadTime = (html: string): number => {
  const text = html.replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
};

// ─── PUBLIC ROUTES (no auth) ───────────────────────────────────────────────────

/**
 * GET /api/health-articles/public
 * List published articles. Platform-wide (tenantId=null) + tenant-specific if tenantId provided.
 * Filters: category, tag, q (search). Pagination: page, limit=12. isFeatured first.
 */
router.get('/public', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { category, tag, q, tenantId, page = '1', limit = '12' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const filter: any = { status: 'published' };

    // Show platform-wide articles + gym-specific articles if tenantId query param provided
    if (tenantId) {
      filter.$or = [{ tenantId: null }, { tenantId: String(tenantId) }];
    } else {
      filter.tenantId = null;
    }

    if (category) filter.category = String(category);
    if (tag) filter.tags = String(tag);
    if (q) {
      const re = new RegExp(String(q), 'i');
      filter.$and = [
        ...(filter.$and ?? []),
        { $or: [{ title: re }, { excerpt: re }, { tags: re }, { author: re }] },
      ];
    }

    const [articles, total] = await Promise.all([
      HealthArticle.find(filter)
        .sort({ isFeatured: -1, publishedAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      HealthArticle.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        articles,
        total,
        page: parseInt(String(page)),
        pages: Math.ceil(total / parseInt(String(limit))),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health-articles/public/:slug
 * Single published article by slug. Increments viewCount.
 */
router.get('/public/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const article = await HealthArticle.findOneAndUpdate(
      { slug: req.params.slug, status: 'published' },
      { $inc: { viewCount: 1 } },
      { new: true }
    ).lean();

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }

    // Related articles: same category, different slug, published
    const related = await HealthArticle.find({
      status: 'published',
      category: article.category,
      slug: { $ne: article.slug },
    })
      .sort({ publishedAt: -1 })
      .limit(4)
      .select('title slug excerpt thumbnailUrl category readTimeMinutes publishedAt author')
      .lean();

    return res.json({ success: true, data: { article, related } });
  } catch (err) {
    next(err);
  }
});

// ─── AUTHENTICATED ROUTES ──────────────────────────────────────────────────────

router.use(authenticate, tenantContext);

/**
 * GET /api/health-articles/stats
 * Admin stats: total articles, published this month, total views this month, avg read time.
 * Must be before /:id to avoid slug collision.
 */
router.get(
  '/stats',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const tenantFilter = tenantId ? { $or: [{ tenantId }, { tenantId: null }] } : {};

      const [totalArticles, publishedThisMonth, viewAgg, topArticle, readsThisMonth] =
        await Promise.all([
          HealthArticle.countDocuments({ ...tenantFilter }),
          HealthArticle.countDocuments({
            ...tenantFilter,
            status: 'published',
            publishedAt: { $gte: startOfMonth },
          }),
          HealthArticle.aggregate([
            { $match: { ...tenantFilter, status: 'published', publishedAt: { $gte: startOfMonth } } },
            { $group: { _id: null, totalViews: { $sum: '$viewCount' }, avgReadTime: { $avg: '$readTimeMinutes' } } },
          ]),
          HealthArticle.findOne({ ...tenantFilter, status: 'published' })
            .sort({ viewCount: -1 })
            .select('title viewCount likeCount readTimeMinutes')
            .lean(),
          ArticleRead.countDocuments({
            ...(tenantId ? { tenantId } : {}),
            readAt: { $gte: startOfMonth },
          }),
        ]);

      return res.json({
        success: true,
        data: {
          totalArticles,
          publishedThisMonth,
          totalViewsThisMonth: viewAgg[0]?.totalViews ?? 0,
          avgReadTime: Math.round(viewAgg[0]?.avgReadTime ?? 0),
          topArticle,
          readsThisMonth,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/health-articles/my/streak
 * Compute current + longest reading streak for the authenticated member.
 */
router.get('/my/streak', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberId = (req as any).user?._id;
    const reads = await ArticleRead.find({ memberId })
      .sort({ readAt: -1 })
      .select('readAt')
      .lean();

    // Collect unique calendar dates (UTC)
    const daySet = new Set<string>();
    for (const r of reads) {
      const d = new Date(r.readAt);
      daySet.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
    }
    const days = Array.from(daySet).sort().reverse(); // newest first

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    const today = new Date();

    for (let i = 0; i < days.length; i++) {
      const expected = new Date(today);
      expected.setUTCDate(today.getUTCDate() - i);
      const expectedKey = `${expected.getUTCFullYear()}-${expected.getUTCMonth()}-${expected.getUTCDate()}`;
      if (days[i] === expectedKey) {
        tempStreak++;
        if (i === 0 || i <= currentStreak) currentStreak = tempStreak;
      } else {
        break;
      }
    }

    // Longest streak (all time)
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i - 1].replace(/-/g, '/'));
      const curr = new Date(days[i].replace(/-/g, '/'));
      const diff = (prev.getTime() - curr.getTime()) / 86400000;
      if (Math.round(diff) === 1) {
        run++;
        longestStreak = Math.max(longestStreak, run);
      } else {
        run = 1;
      }
    }
    longestStreak = Math.max(longestStreak, currentStreak);

    return res.json({
      success: true,
      data: { currentStreak, longestStreak, totalDaysRead: days.length },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health-articles/my/reads
 * Reading history for the authenticated member.
 */
router.get('/my/reads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const memberId = (req as any).user?._id;
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const [reads, total] = await Promise.all([
      ArticleRead.find({ memberId })
        .sort({ readAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .populate('articleId', 'title slug category thumbnailUrl readTimeMinutes publishedAt')
        .lean(),
      ArticleRead.countDocuments({ memberId }),
    ]);

    return res.json({
      success: true,
      data: {
        reads,
        total,
        page: parseInt(String(page)),
        pages: Math.ceil(total / parseInt(String(limit))),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health-articles/
 * List articles. Admins see draft+published; members see published only.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const userRole = (req as any).user?.role;
    const isAdmin = ['gym_owner', 'super_admin', 'branch_manager', 'trainer', 'staff'].includes(userRole);

    const { category, tag, q, status, isWebStory, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const filter: any = tenantId
      ? { $or: [{ tenantId }, { tenantId: null }] }
      : {};

    if (!isAdmin) {
      filter.status = 'published';
    } else if (status) {
      filter.status = String(status);
    }

    if (category) filter.category = String(category);
    if (tag) filter.tags = String(tag);
    if (isWebStory !== undefined) filter.isWebStory = isWebStory === 'true';
    if (q) {
      const re = new RegExp(String(q), 'i');
      filter.$and = [{ $or: [{ title: re }, { excerpt: re }, { tags: re }] }];
    }

    const [articles, total] = await Promise.all([
      HealthArticle.find(filter)
        .sort({ isFeatured: -1, publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      HealthArticle.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        articles,
        total,
        page: parseInt(String(page)),
        pages: Math.ceil(total / parseInt(String(limit))),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/health-articles/:id
 * Single article by MongoDB ID.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const article = await HealthArticle.findById(req.params.id).lean();
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }
    return res.json({ success: true, data: article });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/health-articles/
 * Create article. Auto-generates slug and readTimeMinutes.
 */
router.post(
  '/',
  requireAnyRole('gym_owner', 'super_admin', 'trainer', 'branch_manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const { title, body, ...rest } = req.body;

      if (!title) {
        return res.status(400).json({ success: false, message: 'title is required' });
      }

      // Auto-generate slug
      let baseSlug = slugify(title);
      let slug = baseSlug;
      let counter = 1;
      while (await HealthArticle.exists({ slug, ...(tenantId ? { tenantId } : { tenantId: null }) })) {
        slug = `${baseSlug}-${counter++}`;
      }

      // Auto-compute read time
      const readTimeMinutes = body ? computeReadTime(body) : 1;

      const article = await HealthArticle.create({
        ...rest,
        title,
        body: body ?? '',
        slug,
        readTimeMinutes: rest.readTimeMinutes ?? readTimeMinutes,
        tenantId: tenantId ?? null,
      });

      return res.status(201).json({ success: true, data: article });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/health-articles/:id
 * Update article.
 */
router.put(
  '/:id',
  requireAnyRole('gym_owner', 'super_admin', 'trainer', 'branch_manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { body, title, ...rest } = req.body;

      const updateData: any = { ...rest };
      if (title) {
        updateData.title = title;
      }
      if (body !== undefined) {
        updateData.body = body;
        // Recompute read time unless manually overridden
        if (!rest.readTimeMinutes) {
          updateData.readTimeMinutes = computeReadTime(body);
        }
      }

      const article = await HealthArticle.findByIdAndUpdate(req.params.id, updateData, {
        new: true,
        runValidators: true,
      });

      if (!article) {
        return res.status(404).json({ success: false, message: 'Article not found' });
      }
      return res.json({ success: true, data: article });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/health-articles/:id/publish
 * Publish article — set status=published, publishedAt=now.
 */
router.put(
  '/:id/publish',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const article = await HealthArticle.findByIdAndUpdate(
        req.params.id,
        { status: 'published', publishedAt: new Date() },
        { new: true }
      );
      if (!article) {
        return res.status(404).json({ success: false, message: 'Article not found' });
      }
      return res.json({ success: true, data: article });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/health-articles/:id/archive
 * Archive article.
 */
router.put(
  '/:id/archive',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const article = await HealthArticle.findByIdAndUpdate(
        req.params.id,
        { status: 'archived' },
        { new: true }
      );
      if (!article) {
        return res.status(404).json({ success: false, message: 'Article not found' });
      }
      return res.json({ success: true, data: article });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/health-articles/:id
 */
router.delete(
  '/:id',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const article = await HealthArticle.findByIdAndDelete(req.params.id);
      if (!article) {
        return res.status(404).json({ success: false, message: 'Article not found' });
      }
      // Clean up read records
      await ArticleRead.deleteMany({ articleId: req.params.id });
      return res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/health-articles/:id/like
 * Increment likeCount.
 */
router.post('/:id/like', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const article = await HealthArticle.findByIdAndUpdate(
      req.params.id,
      { $inc: { likeCount: 1 } },
      { new: true }
    ).select('likeCount');
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article not found' });
    }
    return res.json({ success: true, data: { likeCount: article.likeCount } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/health-articles/:id/read
 * Record that the current user opened/read this article. Upserts so no duplicates.
 */
router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const memberId = (req as any).user?._id;

    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId required' });
    }

    const record = await ArticleRead.findOneAndUpdate(
      { memberId, articleId: req.params.id },
      {
        $set: {
          tenantId: tenantId ?? 'platform',
          readAt: new Date(),
          readCompletedAt: req.body.completed ? new Date() : undefined,
        },
      },
      { new: true, upsert: true }
    );

    return res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
});

export default router;
