import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import WebsiteContent, { AVAILABLE_AMENITIES } from '../models/WebsiteContent.model';

const router = Router();

router.use(authenticate, tenantContext);

// ─── GET / — fetch (or auto-create) website content ──────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      {
        $setOnInsert: {
          tenantId,
          aboutText: '',
          gallery: [],
          amenities: [],
          testimonials: [],
          serviceTags: [],
          bannerImages: [],
          socialLinks: {},
          operatingHours: {},
          showPricing: true,
          showTrainers: true,
          showGallery: true,
          showTestimonials: true,
          showMap: true,
          isPublished: true,
        },
      },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── GET /available-amenities ─────────────────────────────────────────────────
router.get('/available-amenities', (_req: Request, res: Response) => {
  return res.json({ success: true, data: AVAILABLE_AMENITIES });
});

// ─── PUT / — full replace ─────────────────────────────────────────────────────
router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const update = { ...req.body, tenantId, lastUpdatedBy: String(userId) };
    // Remove keys caller should not force
    delete update._id;
    delete update.__v;
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: update },
      { upsert: true, new: true, runValidators: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /about ─────────────────────────────────────────────────────────────
router.patch('/about', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const { aboutText, tagline, foundedYear, totalMembers, metaTitle, metaDescription } = req.body;
    const update: Record<string, unknown> = { lastUpdatedBy: String(userId) };
    if (aboutText     !== undefined) update.aboutText     = aboutText;
    if (tagline       !== undefined) update.tagline       = tagline;
    if (foundedYear   !== undefined) update.foundedYear   = foundedYear;
    if (totalMembers  !== undefined) update.totalMembers  = totalMembers;
    if (metaTitle     !== undefined) update.metaTitle     = metaTitle;
    if (metaDescription !== undefined) update.metaDescription = metaDescription;
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: update },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /gallery ───────────────────────────────────────────────────────────
router.patch('/gallery', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const { gallery, bannerImages, malePercent, femalePercent } = req.body;
    const update: Record<string, unknown> = { lastUpdatedBy: String(userId) };
    if (gallery      !== undefined) update.gallery      = gallery;
    if (bannerImages !== undefined) update.bannerImages = bannerImages;
    if (malePercent  !== undefined) update.malePercent  = malePercent;
    if (femalePercent !== undefined) update.femalePercent = femalePercent;
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: update },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /amenities ─────────────────────────────────────────────────────────
router.patch('/amenities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const { amenities } = req.body;
    if (!Array.isArray(amenities)) {
      return res.status(400).json({ success: false, message: 'amenities must be an array' });
    }
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: { amenities, lastUpdatedBy: String(userId) } },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /services ─────────────────────────────────────────────────────────
router.patch('/services', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const { serviceTags } = req.body;
    if (!Array.isArray(serviceTags)) {
      return res.status(400).json({ success: false, message: 'serviceTags must be an array' });
    }
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: { serviceTags, lastUpdatedBy: String(userId) } },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── POST /testimonial — add a testimonial ────────────────────────────────────
router.post('/testimonial', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const { memberName, memberPhoto, rating, text } = req.body;
    if (!memberName || !rating || !text) {
      return res.status(400).json({ success: false, message: 'memberName, rating, and text are required' });
    }
    const testimonial = {
      _id:        new mongoose.Types.ObjectId(),
      memberName: String(memberName).trim(),
      memberPhoto: memberPhoto ?? undefined,
      rating:     Number(rating),
      text:       String(text).trim(),
      date:       new Date(),
      isApproved: false,
    };
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      {
        $push:  { testimonials: testimonial },
        $set:   { lastUpdatedBy: String(userId) },
      },
      { upsert: true, new: true }
    );
    return res.status(201).json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /testimonial/:id/approve ──────────────────────────────────────────
router.patch('/testimonial/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const id = req.params.id as string;
    const { isApproved } = req.body;
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId, 'testimonials._id': new mongoose.Types.ObjectId(id) },
      { $set: { 'testimonials.$.isApproved': isApproved !== false } },
      { new: true }
    );
    if (!content) return res.status(404).json({ success: false, message: 'Testimonial not found' });
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── DELETE /testimonial/:id ─────────────────────────────────────────────────
router.delete('/testimonial/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const id = req.params.id as string;
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $pull: { testimonials: { _id: new mongoose.Types.ObjectId(id) } } },
      { new: true }
    );
    if (!content) return res.status(404).json({ success: false, message: 'Content not found' });
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /hours ─────────────────────────────────────────────────────────────
router.patch('/hours', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const { weekdays, weekends, notes } = req.body;
    const operatingHours: Record<string, unknown> = {};
    if (weekdays !== undefined) operatingHours.weekdays = weekdays;
    if (weekends !== undefined) operatingHours.weekends = weekends;
    if (notes    !== undefined) operatingHours.notes    = notes;
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: { operatingHours, lastUpdatedBy: String(userId) } },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /social ────────────────────────────────────────────────────────────
router.patch('/social', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const { facebook, instagram, youtube, twitter } = req.body;
    const socialLinks: Record<string, unknown> = {};
    if (facebook  !== undefined) socialLinks.facebook  = facebook;
    if (instagram !== undefined) socialLinks.instagram = instagram;
    if (youtube   !== undefined) socialLinks.youtube   = youtube;
    if (twitter   !== undefined) socialLinks.twitter   = twitter;
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: { socialLinks, lastUpdatedBy: String(userId) } },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /settings — show/hide toggles ─────────────────────────────────────
router.patch('/settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const { showPricing, showTrainers, showGallery, showTestimonials, showMap } = req.body;
    const update: Record<string, unknown> = { lastUpdatedBy: String(userId) };
    if (showPricing      !== undefined) update.showPricing      = Boolean(showPricing);
    if (showTrainers     !== undefined) update.showTrainers     = Boolean(showTrainers);
    if (showGallery      !== undefined) update.showGallery      = Boolean(showGallery);
    if (showTestimonials !== undefined) update.showTestimonials = Boolean(showTestimonials);
    if (showMap          !== undefined) update.showMap          = Boolean(showMap);
    const content = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: update },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: content });
  } catch (err) { next(err); }
});

// ─── PATCH /publish — toggle isPublished ─────────────────────────────────────
router.patch('/publish', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId as string;
    const userId   = (req as any).user?._id ?? 'unknown';
    const current  = await WebsiteContent.findOne({ tenantId });
    const next_val = current ? !current.isPublished : true;
    const content  = await WebsiteContent.findOneAndUpdate(
      { tenantId },
      { $set: { isPublished: next_val, lastUpdatedBy: String(userId) } },
      { upsert: true, new: true }
    );
    return res.json({ success: true, data: { isPublished: content?.isPublished } });
  } catch (err) { next(err); }
});

export default router;
