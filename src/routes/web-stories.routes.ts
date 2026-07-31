import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import WebStory from '../models/WebStory.model';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const randomSuffix = (): string =>
  Math.random().toString(36).substring(2, 6);

// ─── Unauthenticated endpoints ────────────────────────────────────────────────

/**
 * POST /api/web-stories/:id/view
 * Increment views counter — open for members, no auth required.
 */
router.post('/:id/view', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const story = await WebStory.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).select('views');

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    return res.json({ success: true, data: { views: story.views } });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/web-stories/:id/complete
 * Log a completion. Recalculates completionRate as a rolling average.
 * completionRate = (prevRate * (views-1) + 100) / views
 */
router.post('/:id/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const story = await WebStory.findById(req.params.id).select('views completionRate');

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    const totalViews = Math.max(story.views, 1);
    const newRate = ((story.completionRate * (totalViews - 1)) + 100) / totalViews;

    story.completionRate = Math.min(100, Math.round(newRate * 10) / 10);
    await story.save();

    return res.json({ success: true, data: { completionRate: story.completionRate } });
  } catch (err) {
    next(err);
  }
});

// ─── Authenticated routes ─────────────────────────────────────────────────────

router.use(authenticate, tenantContext);

/**
 * GET /api/web-stories/published
 * All published stories — member-facing feed, sorted by views desc.
 */
router.get('/published', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const { category, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const filter: any = { tenantId, isPublished: true };
    if (category) filter.category = String(category);

    const [stories, total] = await Promise.all([
      WebStory.find(filter)
        .sort({ views: -1, publishedAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      WebStory.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        stories,
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
 * GET /api/web-stories/stats
 * Admin stats: total, published, totalViews, avgCompletion.
 * Must be declared before /:idOrSlug to avoid routing collision.
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const filter: any = { tenantId };

    const [total, published, agg] = await Promise.all([
      WebStory.countDocuments(filter),
      WebStory.countDocuments({ ...filter, isPublished: true }),
      WebStory.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$views' },
            avgCompletion: { $avg: '$completionRate' },
          },
        },
      ]),
    ]);

    return res.json({
      success: true,
      data: {
        total,
        published,
        totalViews: agg[0]?.totalViews ?? 0,
        avgCompletion: Math.round((agg[0]?.avgCompletion ?? 0) * 10) / 10,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/web-stories/
 * List all stories for a tenant. Supports ?category, ?published, pagination.
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const { category, published, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));

    const filter: any = { tenantId };
    if (category) filter.category = String(category);
    if (published !== undefined) filter.isPublished = published === 'true';

    const [stories, total] = await Promise.all([
      WebStory.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      WebStory.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: {
        stories,
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
 * GET /api/web-stories/:idOrSlug
 * Get a single story by MongoDB _id or by slug.
 */
router.get('/:idOrSlug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const idOrSlug = req.params.idOrSlug as string;

    const isId = /^[a-f\d]{24}$/i.test(idOrSlug);
    const query = isId
      ? { _id: idOrSlug, tenantId }
      : { slug: idOrSlug, tenantId };

    const story = await WebStory.findOne(query).lean();

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    return res.json({ success: true, data: story });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/web-stories/
 * Create a new story. Auto-generates slug; sets slideCount.
 */
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const userId = (req as any).user?._id;
    const { title, category, slides = [], tags = [], coverEmoji, coverImage, googleWebStoryUrl } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }
    if (!category) {
      return res.status(400).json({ success: false, message: 'category is required' });
    }

    // Build slug with 4-char random suffix to ensure uniqueness
    const base = slugify(title);
    const slug = `${base}-${randomSuffix()}`;

    // Assign slideIndex if not set
    const normalizedSlides = (slides as any[]).map((s, i) => ({
      ...s,
      slideIndex: s.slideIndex ?? i,
    }));

    const story = await WebStory.create({
      tenantId,
      title,
      slug,
      category,
      slides: normalizedSlides,
      slideCount: normalizedSlides.length,
      tags: Array.isArray(tags) ? tags : String(tags).split(',').map((t: string) => t.trim()).filter(Boolean),
      coverEmoji,
      coverImage,
      googleWebStoryUrl,
      author: (req as any).user?.name ?? (req as any).user?.email ?? 'Admin',
    });

    return res.status(201).json({ success: true, data: story });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/web-stories/:id
 * Update a story.
 */
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const { slides, tags, ...rest } = req.body;

    const updateData: any = { ...rest };

    if (slides !== undefined) {
      const normalizedSlides = (slides as any[]).map((s, i) => ({
        ...s,
        slideIndex: s.slideIndex ?? i,
      }));
      updateData.slides = normalizedSlides;
      updateData.slideCount = normalizedSlides.length;
    }

    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags)
        ? tags
        : String(tags).split(',').map((t: string) => t.trim()).filter(Boolean);
    }

    const story = await WebStory.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      updateData,
      { new: true, runValidators: true }
    );

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    return res.json({ success: true, data: story });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/web-stories/:id/publish
 * Toggle isPublished. Sets publishedAt on first publish.
 */
router.patch('/:id/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const story = await WebStory.findOne({ _id: req.params.id, tenantId });

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    story.isPublished = !story.isPublished;
    if (story.isPublished && !story.publishedAt) {
      story.publishedAt = new Date();
    }
    await story.save();

    return res.json({ success: true, data: { isPublished: story.isPublished, publishedAt: story.publishedAt } });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/web-stories/:id
 */
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const story = await WebStory.findOneAndDelete({ _id: req.params.id, tenantId });

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }
    return res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
