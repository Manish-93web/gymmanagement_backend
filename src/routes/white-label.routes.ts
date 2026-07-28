import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import WhiteLabel from '../models/WhiteLabel.model';

const router = Router();
router.use(authenticate, tenantContext);
const adminOnly = requireAnyRole('gym_owner', 'super_admin');

// GET /white-label — get current tenant's config
router.get('/', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const config = await WhiteLabel.findOne({ tenantId }).lean();
    return res.json({ success: true, data: config });
  } catch (err) { next(err); }
});

// PUT /white-label — upsert config
router.put('/', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const createdBy = (req as any).user?._id;
    const { buildStatus, lastBuildAt, lastBuildLog, buildArtifacts, ...safeBody } = req.body;
    const config = await WhiteLabel.findOneAndUpdate(
      { tenantId },
      { $set: { ...safeBody, tenantId, createdBy } },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json({ success: true, data: config });
  } catch (err) { next(err); }
});

// POST /white-label/trigger-build — simulate queuing a build
router.post('/trigger-build', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const config = await WhiteLabel.findOne({ tenantId });
    if (!config) return res.status(404).json({ success: false, message: 'White-label config not found. Save config first.' });
    if (config.buildStatus === 'building' || config.buildStatus === 'queued') {
      return res.status(409).json({ success: false, message: 'A build is already in progress.' });
    }
    config.buildStatus = 'queued';
    config.lastBuildLog = `[${new Date().toISOString()}] Build queued. Preparing environment…`;
    await config.save();

    // Simulate build progression (in production this would call a real CI/CD pipeline)
    setTimeout(async () => {
      try {
        config.buildStatus = 'building';
        config.lastBuildLog += `\n[${new Date().toISOString()}] Building iOS and Android bundles…`;
        await config.save();
        setTimeout(async () => {
          try {
            config.buildStatus = 'success';
            config.lastBuildAt = new Date();
            config.buildNumber = (config.buildNumber ?? 0) + 1;
            config.lastBuildLog += `\n[${new Date().toISOString()}] ✅ Build #${config.buildNumber} completed successfully.`;
            config.buildArtifacts = {
              androidApkUrl: `/builds/${tenantId}/app-release.apk`,
              androidAabUrl: `/builds/${tenantId}/app-release.aab`,
              iosIpaUrl:     `/builds/${tenantId}/app-release.ipa`,
            };
            await config.save();
          } catch {}
        }, 10000);
      } catch {}
    }, 3000);

    return res.json({ success: true, message: 'Build queued', data: { buildStatus: 'queued' } });
  } catch (err) { next(err); }
});

// GET /white-label/build-status — poll build progress
router.get('/build-status', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const config = await WhiteLabel.findOne({ tenantId }).select('buildStatus lastBuildAt lastBuildLog buildArtifacts buildNumber').lean();
    return res.json({ success: true, data: config });
  } catch (err) { next(err); }
});

// POST /white-label/feature-flags — update just feature flags
router.post('/feature-flags', adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const update: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(req.body)) {
      update[`featureFlags.${k}`] = Boolean(v);
    }
    const config = await WhiteLabel.findOneAndUpdate({ tenantId }, { $set: update }, { new: true });
    if (!config) return res.status(404).json({ success: false, message: 'Config not found' });
    return res.json({ success: true, data: config });
  } catch (err) { next(err); }
});

// Platform admin: list all white-label configs
router.get('/platform/all', requireAnyRole('super_admin', 'platform_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20', buildStatus } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const filter: any = {};
    if (buildStatus) filter.buildStatus = buildStatus;
    const [configs, total] = await Promise.all([
      WhiteLabel.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(parseInt(String(limit))).lean(),
      WhiteLabel.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { configs, total } });
  } catch (err) { next(err); }
});

export default router;
