import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { ArticleRead, ArticleBookmark } from '../models/ArticleRead.model';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPreviousDay(dateStr: string): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calculate the current streak and longest streak for a member.
 * `distinctDates` must be sorted descending (most recent first).
 */
function calculateStreaks(distinctDates: string[]): {
  currentStreak: number;
  longestStreak: number;
  streakStartDate: string | null;
} {
  if (!distinctDates.length) {
    return { currentStreak: 0, longestStreak: 0, streakStartDate: null };
  }

  const today = getTodayStr();
  let currentStreak = 0;
  let checkDate = today;
  let streakStartDate: string | null = null;

  // Build current streak (must start from today or yesterday to stay active)
  for (const dateStr of distinctDates) {
    if (dateStr === checkDate) {
      currentStreak++;
      streakStartDate = dateStr;
      checkDate = getPreviousDay(checkDate);
    } else {
      break;
    }
  }

  // Build longest streak by scanning all dates
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate: string | null = null;

  for (const dateStr of distinctDates) {
    if (prevDate === null) {
      tempStreak = 1;
    } else if (getPreviousDay(prevDate) === dateStr) {
      tempStreak++;
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
    }
    prevDate = dateStr;
  }
  longestStreak = Math.max(longestStreak, tempStreak);

  return { currentStreak, longestStreak, streakStartDate };
}

// ─── POST /read — Mark article as read ───────────────────────────────────────

router.post('/read', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId?.toString() || '';
    const memberId = req.user!._id.toString();
    const { articleId, articleTitle, category = 'General', readDurationSeconds } = req.body;

    if (!articleId || !articleTitle) {
      return res.status(400).json({ success: false, message: 'articleId and articleTitle are required' });
    }

    const dateStr = getTodayStr();

    const read = await ArticleRead.findOneAndUpdate(
      { tenantId, memberId, articleId },
      {
        $setOnInsert: {
          tenantId,
          memberId,
          articleId,
          articleTitle,
          category,
          readAt: new Date(),
          dateStr,
          ...(readDurationSeconds !== undefined ? { readDurationSeconds } : {}),
        },
      },
      { upsert: true, new: true }
    );

    // Recalculate streak after recording
    const distinctDates = await ArticleRead.distinct('dateStr', { tenantId, memberId });
    distinctDates.sort((a, b) => (a > b ? -1 : 1)); // descending
    const { currentStreak, longestStreak } = calculateStreaks(distinctDates);

    const todayReads = await ArticleRead.countDocuments({ tenantId, memberId, dateStr });
    const allTimeTotal = await ArticleRead.countDocuments({ tenantId, memberId });

    // Determine if this is a new personal best
    const isNewRecord = currentStreak > 0 && currentStreak >= longestStreak;

    return res.json({
      success: true,
      data: read,
      streak: {
        current: currentStreak,
        best: longestStreak,
        isNewRecord,
        todayCount: todayReads,
        totalAllTime: allTimeTotal,
      },
    });
  } catch (err: any) {
    // Handle duplicate key (article already read) gracefully
    if (err.code === 11000) {
      return res.json({ success: true, message: 'Already read', alreadyRead: true });
    }
    console.error('[article-reading] POST /read error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /streak — Current reading streak ────────────────────────────────────

router.get('/streak', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId?.toString() || '';
    const memberId = req.user!._id.toString();
    const today = getTodayStr();

    const distinctDates = await ArticleRead.distinct('dateStr', { tenantId, memberId });
    distinctDates.sort((a, b) => (a > b ? -1 : 1));

    const { currentStreak, longestStreak, streakStartDate } = calculateStreaks(distinctDates);

    const todayRead = distinctDates.includes(today);
    const readsToday = todayRead
      ? await ArticleRead.countDocuments({ tenantId, memberId, dateStr: today })
      : 0;
    const totalReadsAllTime = await ArticleRead.countDocuments({ tenantId, memberId });

    return res.json({
      success: true,
      data: {
        currentStreak,
        longestStreak,
        streakStartDate,
        todayRead,
        readsToday,
        totalReadsAllTime,
      },
    });
  } catch (err) {
    console.error('[article-reading] GET /streak error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /bookmark — Bookmark an article ────────────────────────────────────

router.post('/bookmark', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId?.toString() || '';
    const memberId = req.user!._id.toString();
    const { articleId, articleTitle, articleCategory = 'General', articleThumbnail } = req.body;

    if (!articleId || !articleTitle) {
      return res.status(400).json({ success: false, message: 'articleId and articleTitle are required' });
    }

    const bookmark = await ArticleBookmark.findOneAndUpdate(
      { tenantId, memberId, articleId },
      {
        $setOnInsert: {
          tenantId,
          memberId,
          articleId,
          articleTitle,
          articleCategory,
          ...(articleThumbnail ? { articleThumbnail } : {}),
          bookmarkedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, data: bookmark });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.json({ success: true, message: 'Already bookmarked' });
    }
    console.error('[article-reading] POST /bookmark error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE /bookmark/:articleId — Remove bookmark ───────────────────────────

router.delete('/bookmark/:articleId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId?.toString() || '';
    const memberId = req.user!._id.toString();
    const { articleId } = req.params;

    await ArticleBookmark.findOneAndDelete({ tenantId, memberId, articleId });

    return res.json({ success: true, message: 'Bookmark removed' });
  } catch (err) {
    console.error('[article-reading] DELETE /bookmark error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /bookmarks — All bookmarked articles (paginated) ────────────────────

router.get('/bookmarks', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId?.toString() || '';
    const memberId = req.user!._id.toString();
    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10), 50);
    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      ArticleBookmark.find({ tenantId, memberId })
        .sort({ bookmarkedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ArticleBookmark.countDocuments({ tenantId, memberId }),
    ]);

    return res.json({
      success: true,
      data: bookmarks,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[article-reading] GET /bookmarks error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /history — Reading history (last 30 days) ───────────────────────────

router.get('/history', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId?.toString() || '';
    const memberId = req.user!._id.toString();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const history = await ArticleRead.find({
      tenantId,
      memberId,
      dateStr: { $gte: cutoffStr },
    })
      .sort({ readAt: -1 })
      .lean();

    return res.json({ success: true, data: history });
  } catch (err) {
    console.error('[article-reading] GET /history error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /stats — Reading statistics ─────────────────────────────────────────

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId?.toString() || '';
    const memberId = req.user!._id.toString();
    const today = getTodayStr();

    // Distinct dates for streak calculation
    const distinctDates = await ArticleRead.distinct('dateStr', { tenantId, memberId });
    distinctDates.sort((a, b) => (a > b ? -1 : 1));
    const { currentStreak, longestStreak } = calculateStreaks(distinctDates);

    // Total articles read
    const totalArticlesRead = await ArticleRead.countDocuments({ tenantId, memberId });

    // Category breakdown
    const categoryAgg = await ArticleRead.aggregate([
      { $match: { tenantId, memberId } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const totalCategories = categoryAgg.length;
    const favoriteCategory =
      categoryAgg.length > 0
        ? { name: categoryAgg[0]._id, count: categoryAgg[0].count }
        : null;

    // Reading minutes (sum of durations)
    const durationAgg = await ArticleRead.aggregate([
      { $match: { tenantId, memberId, readDurationSeconds: { $exists: true } } },
      { $group: { _id: null, total: { $sum: '$readDurationSeconds' } } },
    ]);
    const readingMinutes = durationAgg.length > 0 ? Math.round(durationAgg[0].total / 60) : 0;

    // Weekly reads (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);

    const weeklyAgg = await ArticleRead.aggregate([
      { $match: { tenantId, memberId, dateStr: { $gte: weekAgoStr } } },
      { $group: { _id: '$dateStr', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Fill in zeros for missing days
    const weeklyMap: Record<string, number> = {};
    weeklyAgg.forEach((w) => { weeklyMap[w._id] = w.count; });
    const weeklyReads: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      weeklyReads.push({ date: ds, count: weeklyMap[ds] ?? 0 });
    }

    return res.json({
      success: true,
      data: {
        currentStreak,
        longestStreak,
        totalArticlesRead,
        totalCategories,
        favoriteCategory,
        readingMinutes,
        weeklyReads,
      },
    });
  } catch (err) {
    console.error('[article-reading] GET /stats error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /badge-eligible — Check reading badge eligibility ───────────────────

router.get('/badge-eligible', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId?.toString() || '';
    const memberId = req.user!._id.toString();

    const distinctDates = await ArticleRead.distinct('dateStr', { tenantId, memberId });
    distinctDates.sort((a, b) => (a > b ? -1 : 1));
    const { currentStreak, longestStreak } = calculateStreaks(distinctDates);

    const effectiveStreak = Math.max(currentStreak, longestStreak);

    return res.json({
      success: true,
      data: {
        earned7DayBadge: effectiveStreak >= 7,
        earned30DayBadge: effectiveStreak >= 30,
        currentStreak,
        longestStreak,
      },
    });
  } catch (err) {
    console.error('[article-reading] GET /badge-eligible error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
