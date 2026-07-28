import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import GymProfile from '../models/GymProfile.model';

const router = Router();

// ─── Public routes (no auth) ──────────────────────────────────────────────────

// GET /gym-profile/directory — public business listing
router.get('/directory', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { city, q, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const filter: any = { isPublished: true };
    if (city) filter.city = new RegExp(String(city), 'i');
    if (q) {
      const re = new RegExp(String(q), 'i');
      filter.$or = [{ gymName: re }, { description: re }, { city: re }, { specializations: re }];
    }
    const [gyms, total] = await Promise.all([
      GymProfile.find(filter)
        .select('gymName tagline logoUrl coverImageUrl city state address phone amenities specializations averageRating reviewCount memberCount slug operatingHours')
        .sort({ averageRating: -1, memberCount: -1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      GymProfile.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { gyms, total, page: parseInt(String(page)), pages: Math.ceil(total / parseInt(String(limit))) } });
  } catch (err) { next(err); }
});

// GET /gym-profile/public/:slug — single public profile
router.get('/public/:slug', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await GymProfile.findOne({ slug: req.params.slug, isPublished: true }).lean();
    if (!profile) return res.status(404).json({ success: false, message: 'Gym not found' });
    return res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// ─── Authenticated routes ─────────────────────────────────────────────────────

router.use(authenticate, tenantContext);

// GET /gym-profile — current tenant's profile
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    let profile = await GymProfile.findOne({ tenantId }).lean();
    return res.json({ success: true, data: profile ?? null });
  } catch (err) { next(err); }
});

// PUT /gym-profile — create or update profile
router.put('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const {
      gymName, tagline, description, logoUrl, coverImageUrl, galleryImages,
      phone, email, website, whatsapp,
      address, city, state, pincode, country, coordinates,
      establishedYear, ownerName, gstNumber, businessCategory,
      amenities, equipment, specializations, certifications,
      operatingHours, instagram, facebook, youtube,
      isPublished, planHighlights,
    } = req.body;

    // Auto-generate slug from gymName + city if not yet set
    let slug = req.body.slug;
    if (!slug && gymName && city) {
      slug = `${gymName}-${city}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + String(tenantId).slice(-6);
    }

    const update: any = {
      gymName, tagline, description, logoUrl, coverImageUrl, galleryImages,
      phone, email, website, whatsapp,
      address, city, state, pincode, country, coordinates,
      establishedYear, ownerName, gstNumber, businessCategory,
      amenities, equipment, specializations, certifications,
      operatingHours, instagram, facebook, youtube,
      isPublished, planHighlights,
    };
    if (slug) update.slug = slug;
    // Remove undefined keys
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const profile = await GymProfile.findOneAndUpdate(
      { tenantId },
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// POST /gym-profile/publish — toggle publish
router.post('/publish', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const profile = await GymProfile.findOne({ tenantId });
    if (!profile) return res.status(404).json({ success: false, message: 'Create your profile first' });
    if (!profile.slug) {
      const slug = `${profile.gymName}-${profile.city}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + String(tenantId).slice(-6);
      profile.slug = slug;
    }
    profile.isPublished = !profile.isPublished;
    await profile.save();
    return res.json({ success: true, data: { isPublished: profile.isPublished, slug: profile.slug } });
  } catch (err) { next(err); }
});

// POST /gym-profile/gallery — add image to gallery
router.post('/gallery', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ success: false, message: 'imageUrl required' });
    const profile = await GymProfile.findOneAndUpdate(
      { tenantId },
      { $push: { galleryImages: imageUrl } },
      { new: true, upsert: true }
    );
    return res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// DELETE /gym-profile/gallery — remove image
router.delete('/gallery', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { imageUrl } = req.body;
    await GymProfile.findOneAndUpdate({ tenantId }, { $pull: { galleryImages: imageUrl } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /gym-profile/nearby — find gyms near coordinates
router.get('/nearby', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { lat, lng, radius = '10' } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, message: 'lat and lng required' });
    const latN = parseFloat(String(lat));
    const lngN = parseFloat(String(lng));
    const radiusKm = parseFloat(String(radius));
    const degPerKm = 1 / 111;
    const latDelta = radiusKm * degPerKm;
    const lngDelta = radiusKm * degPerKm / Math.cos((latN * Math.PI) / 180);
    const gyms = await GymProfile.find({
      isPublished: true,
      'coordinates.lat': { $gte: latN - latDelta, $lte: latN + latDelta },
      'coordinates.lng': { $gte: lngN - lngDelta, $lte: lngN + lngDelta },
    }).select('gymName tagline logoUrl city address phone amenities averageRating coordinates slug').lean();
    return res.json({ success: true, data: gyms });
  } catch (err) { next(err); }
});

export default router;
