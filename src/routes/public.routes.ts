import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import platformLeadController from '../controllers/platform-lead.controller';
import mongoose from 'mongoose';
import GymReview from '../models/GymReview.model';
import Tenant from '../models/Tenant.model';
import publicController from '../controllers/public.controller';

const router = Router();

// All public routes — no authentication required
router.get('/gyms', publicController.getGyms.bind(publicController));
router.post('/leads', publicController.submitLead.bind(publicController));
router.get('/stats', publicController.getPublicStats.bind(publicController));

// Website "get a call back" form. Limited per visitor IP: the server does not set `trust proxy`,
// so read the forwarded address ourselves, otherwise every visitor behind Render shares one bucket.
const leadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(),
    validate: false,
    message: { success: false, message: 'Too many requests. Please try again in a little while.' },
});
router.post('/platform-leads', leadLimiter, platformLeadController.submit.bind(platformLeadController));
router.get('/pdf/:slug', publicController.getPublicPdf.bind(publicController));
router.get('/gym/:slug', publicController.getGymProfile.bind(publicController));

/**
 * GET /api/public/reviews — real, approved member reviews (4 stars and up, with written text) from gyms on the
 * platform, newest first, for the landing page. Names are masked. Returns an empty list when there are none.
 */
router.get('/reviews', async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const filter: any = { status: 'approved', rating: { $gte: 4 }, body: { $exists: true, $ne: '' } };
        const [rows, agg] = await Promise.all([
            GymReview.find(filter).populate('memberId', 'firstName lastName').sort({ createdAt: -1 }).limit(30).lean(),
            GymReview.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
        ]);

        // Written reviews only (a one-word body is not a testimonial); show the newest six.
        const written = rows.filter((r: any) => String(r.body).trim().length >= 20).slice(0, 6);
        const tenantIds = [...new Set(written.map((r: any) => String(r.tenantId)))].filter(id => mongoose.isValidObjectId(id));
        const tenants = await Tenant.find({ _id: { $in: tenantIds } }).select('name').lean();
        const gymName = new Map(tenants.map((t: any) => [String(t._id), t.name]));

        const reviews = written.map((r: any) => {
            const first: string = r.memberId?.firstName ?? 'Member';
            const last: string = r.memberId?.lastName ?? '';
            return {
                _id: r._id,
                rating: r.rating,
                title: r.title,
                body: r.body,
                memberName: last ? `${first} ${last.charAt(0).toUpperCase()}.` : first,
                gymName: gymName.get(String(r.tenantId)) ?? null,
                isVerifiedMember: !!r.isVerifiedMember,
                createdAt: r.createdAt,
            };
        });

        res.json({
            success: true,
            data: { reviews, average: agg[0] ? Math.round(agg[0].avg * 10) / 10 : null, count: agg[0]?.count ?? 0 },
        });
    } catch (err) { next(err); }
});

export default router;
