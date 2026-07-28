import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import ABHALink from '../models/ABHALink.model';
import WorkoutLog from '../models/WorkoutLog.model';
import BodyComposition from '../models/BodyComposition.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

const ABDM_API_URL      = process.env.ABDM_API_URL      || null;
const ABDM_CLIENT_ID    = process.env.ABDM_CLIENT_ID    || 'mock-client';
const ABDM_CLIENT_SECRET = process.env.ABDM_CLIENT_SECRET || 'mock-secret';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise ABHA ID: accept 14 raw digits or XX-XXXX-XXXX-XXXX */
function normaliseAbhaId(raw: string): string | null {
  const stripped = raw.replace(/-/g, '').trim();
  if (!/^\d{14}$/.test(stripped)) return null;
  return `${stripped.slice(0, 2)}-${stripped.slice(2, 6)}-${stripped.slice(6, 10)}-${stripped.slice(10)}`;
}

/** Mask ABHA ID for display: XX-****-****-1234 */
function maskAbhaId(abhaId: string): string {
  const parts = abhaId.split('-');
  if (parts.length !== 4) return abhaId;
  return `${parts[0]}-****-****-${parts[3]}`;
}

/** Mock ABDM response for development/staging */
function mockAbdmVerification(abhaId: string) {
  return {
    txnId:      'mock-txn-' + Date.now(),
    memberName: 'ABHA Member',
    verified:   true,
    message:    'OTP sent to ABHA-registered mobile',
  };
}

/** Call real ABDM API or return mock */
async function abdmInitiate(abhaId: string): Promise<{ txnId: string; message: string }> {
  if (!ABDM_API_URL) {
    const mock = mockAbdmVerification(abhaId);
    return { txnId: mock.txnId, message: mock.message };
  }
  const res = await axios.post(
    `${ABDM_API_URL}/v1/auth/init`,
    { healthId: abhaId, authMode: 'MOBILE_OTP' },
    {
      headers: {
        'X-CM-ID':       'sbx',
        'client-id':     ABDM_CLIENT_ID,
        'client-secret': ABDM_CLIENT_SECRET,
        'Content-Type':  'application/json',
      },
    }
  );
  return {
    txnId:   res.data?.transactionId ?? res.data?.txnId,
    message: 'OTP sent to your ABHA-registered mobile number',
  };
}

async function abdmConfirmOtp(
  txnId: string,
  otp: string
): Promise<{ verified: boolean; memberName?: string; dateOfBirth?: string; gender?: string }> {
  if (!ABDM_API_URL) {
    // In dev: any 6-digit OTP is accepted
    if (!/^\d{6}$/.test(otp)) return { verified: false };
    return { verified: true, memberName: 'ABHA Member', dateOfBirth: '1990-01-01', gender: 'M' };
  }
  const res = await axios.post(
    `${ABDM_API_URL}/v1/auth/confirmWithMobileOTP`,
    { txnId, otp },
    {
      headers: {
        'X-CM-ID':       'sbx',
        'client-id':     ABDM_CLIENT_ID,
        'client-secret': ABDM_CLIENT_SECRET,
        'Content-Type':  'application/json',
      },
    }
  );
  const profile = res.data?.profile ?? {};
  return {
    verified:    true,
    memberName:  profile.name    ?? '',
    dateOfBirth: profile.dayOfBirth ? `${profile.yearOfBirth}-${String(profile.monthOfBirth).padStart(2, '0')}-${String(profile.dayOfBirth).padStart(2, '0')}` : undefined,
    gender:      profile.gender  ?? undefined,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /abha/initiate-link
 * Step 1: Initiate ABHA ID linking — sends OTP to member's ABHA-registered mobile.
 */
router.post(
  '/initiate-link',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const { memberId, abhaId: rawAbhaId } = req.body;

      if (!memberId || !rawAbhaId) {
        return res.status(400).json({ success: false, message: 'memberId and abhaId are required' });
      }

      const abhaId = normaliseAbhaId(rawAbhaId);
      if (!abhaId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid ABHA ID format. Must be 14 digits (XX-XXXX-XXXX-XXXX)',
        });
      }

      // Check if already verified link exists for this ABHA ID in this tenant
      const existing = await ABHALink.findOne({ tenantId, memberId });
      if (existing && existing.linkStatus === 'verified') {
        return res.status(409).json({ success: false, message: 'This member already has a verified ABHA link' });
      }

      // Call ABDM API (or mock)
      const { txnId, message } = await abdmInitiate(abhaId);

      // Upsert the link record with pending status
      await ABHALink.findOneAndUpdate(
        { tenantId, memberId },
        {
          tenantId,
          memberId,
          abhaId,
          memberName:  '',
          isVerified:  false,
          linkStatus:  'pending_otp',
          txnId,
          verifiedAt:  undefined,
          revokedAt:   undefined,
          revokedReason: undefined,
        },
        { upsert: true, new: true }
      );

      return res.json({ success: true, data: { txnId, message } });
    } catch (err) { next(err); }
  }
);

/**
 * POST /abha/verify-otp
 * Step 2: Verify OTP and complete ABHA linking.
 */
router.post(
  '/verify-otp',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const { memberId, txnId, otp } = req.body;

      if (!memberId || !txnId || !otp) {
        return res.status(400).json({ success: false, message: 'memberId, txnId, and otp are required' });
      }

      const link = await ABHALink.findOne({ tenantId, memberId, txnId });
      if (!link) {
        return res.status(404).json({ success: false, message: 'No pending ABHA link found. Please restart the linking process.' });
      }

      const result = await abdmConfirmOtp(txnId, otp);

      if (!result.verified) {
        link.linkStatus = 'failed';
        await link.save();
        return res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
      }

      link.isVerified  = true;
      link.verifiedAt  = new Date();
      link.linkStatus  = 'verified';
      link.memberName  = result.memberName ?? 'ABHA Member';
      if (result.dateOfBirth) link.dateOfBirth = new Date(result.dateOfBirth);
      if (result.gender)      link.gender = result.gender;
      link.lastSyncedAt = new Date();
      await link.save();

      return res.json({
        success: true,
        data: {
          verified:   true,
          abhaId:     link.abhaId,
          memberName: link.memberName,
          message:    'ABHA ID linked successfully!',
        },
      });
    } catch (err) { next(err); }
  }
);

/**
 * GET /abha/my-link
 * Get own ABHA link status (member self-service).
 */
router.get(
  '/my-link',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const userId   = (req as any).user?._id ?? (req as any).user?.id;

      // Find member record for this user
      const member = await Member.findOne({ tenantId, userId }).lean();
      if (!member) {
        return res.status(404).json({ success: false, message: 'Member profile not found' });
      }

      const link = await ABHALink.findOne({ tenantId, memberId: member._id }).lean();
      if (!link) {
        return res.json({ success: true, data: null });
      }

      return res.json({
        success: true,
        data: {
          ...link,
          abhaId: maskAbhaId(link.abhaId),
        },
      });
    } catch (err) { next(err); }
  }
);

/**
 * GET /abha/member/:memberId
 * Get a specific member's ABHA link (staff/management).
 */
router.get(
  '/member/:memberId',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId  = (req as any).tenantId as string;
      const { memberId } = req.params;

      const link = await ABHALink.findOne({ tenantId, memberId }).lean();
      if (!link) {
        return res.json({ success: true, data: null });
      }

      return res.json({
        success: true,
        data: { ...link, abhaId: maskAbhaId(link.abhaId) },
      });
    } catch (err) { next(err); }
  }
);

/**
 * PUT /abha/consent
 * Update data share consent for own ABHA link.
 */
router.put(
  '/consent',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const { memberId, workouts, nutrition, bodyComposition, hraScore } = req.body;

      if (!memberId) {
        return res.status(400).json({ success: false, message: 'memberId is required' });
      }

      const link = await ABHALink.findOne({ tenantId, memberId });
      if (!link) {
        return res.status(404).json({ success: false, message: 'ABHA link not found' });
      }

      link.dataShareConsent = {
        workouts:        !!workouts,
        nutrition:       !!nutrition,
        bodyComposition: !!bodyComposition,
        hraScore:        !!hraScore,
      };
      await link.save();

      return res.json({ success: true, data: link.dataShareConsent, message: 'Consent updated successfully' });
    } catch (err) { next(err); }
  }
);

/**
 * DELETE /abha/revoke
 * Revoke ABHA link.
 */
router.delete(
  '/revoke',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const { memberId, reason } = req.body;

      if (!memberId) {
        return res.status(400).json({ success: false, message: 'memberId is required' });
      }

      const link = await ABHALink.findOne({ tenantId, memberId });
      if (!link) {
        return res.status(404).json({ success: false, message: 'ABHA link not found' });
      }

      link.linkStatus    = 'revoked';
      link.isVerified    = false;
      link.revokedAt     = new Date();
      link.revokedReason = reason ?? 'User requested revocation';
      await link.save();

      return res.json({ success: true, message: 'ABHA link revoked successfully' });
    } catch (err) { next(err); }
  }
);

/**
 * GET /abha/stats
 * Aggregate stats for admin dashboard.
 */
router.get(
  '/stats',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;

      const [totalLinked, verifiedCount, pendingCount, revokedCount] = await Promise.all([
        ABHALink.countDocuments({ tenantId }),
        ABHALink.countDocuments({ tenantId, linkStatus: 'verified' }),
        ABHALink.countDocuments({ tenantId, linkStatus: 'pending_otp' }),
        ABHALink.countDocuments({ tenantId, linkStatus: 'revoked' }),
      ]);

      // Health data exports this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const exportsThisMonth = await ABHALink.countDocuments({
        tenantId,
        lastSyncedAt: { $gte: startOfMonth },
        linkStatus:   'verified',
      });

      return res.json({
        success: true,
        data: { totalLinked, verifiedCount, pendingCount, revokedCount, exportsThisMonth },
      });
    } catch (err) { next(err); }
  }
);

/**
 * GET /abha/all
 * List all ABHA links for a tenant (admin view).
 */
router.get(
  '/all',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const page  = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

      const [links, total] = await Promise.all([
        ABHALink.find({ tenantId })
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        ABHALink.countDocuments({ tenantId }),
      ]);

      const masked = links.map(l => ({ ...l, abhaId: maskAbhaId(l.abhaId) }));
      return res.json({ success: true, data: masked, total, page, limit });
    } catch (err) { next(err); }
  }
);

/**
 * POST /abha/export-health-data
 * Prepare member's health data payload for ABDM Health Locker export.
 * Requires a verified ABHA link and appropriate consent.
 */
router.post(
  '/export-health-data',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const { memberId } = req.body;

      if (!memberId) {
        return res.status(400).json({ success: false, message: 'memberId is required' });
      }

      const link = await ABHALink.findOne({ tenantId, memberId });
      if (!link || link.linkStatus !== 'verified') {
        return res.status(400).json({ success: false, message: 'ABHA ID must be verified before exporting health data' });
      }

      const consent = link.dataShareConsent;
      const exportedTypes: string[] = [];
      let recordCount = 0;

      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      if (consent.workouts) {
        const count = await WorkoutLog.countDocuments({
          tenantId,
          memberId,
          createdAt: { $gte: ninetyDaysAgo },
        });
        if (count > 0) { exportedTypes.push('workouts'); recordCount += count; }
      }

      if (consent.bodyComposition) {
        const count = await BodyComposition.countDocuments({
          tenantId,
          memberId,
          measurementDate: { $gte: ninetyDaysAgo },
        });
        if (count > 0) { exportedTypes.push('bodyComposition'); recordCount += count; }
      }

      if (exportedTypes.length === 0 && !consent.hraScore && !consent.nutrition) {
        return res.status(400).json({
          success: false,
          message: 'No data types consented for export. Please update your data sharing consent first.',
        });
      }

      if (consent.hraScore)   exportedTypes.push('hraScore');
      if (consent.nutrition)  exportedTypes.push('nutrition');

      // Update last synced timestamp
      link.lastSyncedAt = new Date();
      await link.save();

      return res.json({
        success: true,
        data: {
          exportedAt:  new Date(),
          dataTypes:   exportedTypes,
          recordCount,
          abhaId:      maskAbhaId(link.abhaId),
          message:     'Health data prepared for ABDM Health Locker',
        },
      });
    } catch (err) { next(err); }
  }
);

export default router;
