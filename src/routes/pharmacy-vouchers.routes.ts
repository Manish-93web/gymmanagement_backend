import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import PharmacyVoucher from '../models/PharmacyVoucher.model';
import Subscription from '../models/Subscription.model';
import MembershipPlan from '../models/MembershipPlan.model';
import Member from '../models/Member.model';

// Persistent pharmacy config per tenant (avoids in-memory loss on restart)
const PharmacyConfigSchema = new mongoose.Schema({
  tenantId:         { type: String, required: true, unique: true },
  voucherAmount:    { type: Number, default: 250 },
  partnerName:      { type: String, default: 'PharmEasy' },
  partnerRedirectUrl: { type: String, default: 'https://pharmeasy.in' },
  autoIssueEnabled: { type: Boolean, default: true },
  eligiblePlanIds:  [String],
}, { timestamps: true });

const PharmacyConfigModel =
  (mongoose.models.PharmacyConfig as mongoose.Model<any>) ||
  mongoose.model('PharmacyConfig', PharmacyConfigSchema);

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = Array.from({ length: 12 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  // Format: PHARM-XXXX-XXXX-XXXX
  return `PHARM-${rand.slice(0, 4)}-${rand.slice(4, 8)}-${rand.slice(8, 12)}`;
}

function getMonthEnd(yearMonth: string): Date {
  const [year, month] = yearMonth.split('-').map(Number);
  // new Date(year, month, 0) → last day of month (month is 1-indexed, day=0 wraps back)
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const DEFAULT_CONFIG = {
  voucherAmount: 250,
  partnerName: 'PharmEasy',
  partnerRedirectUrl: 'https://pharmeasy.in',
  autoIssueEnabled: true,
  eligiblePlanIds: [] as string[],
};

async function getConfig(tenantId: string): Promise<typeof DEFAULT_CONFIG> {
  try {
    const doc = await PharmacyConfigModel.findOne({ tenantId }).lean();
    return doc ? { ...DEFAULT_CONFIG, ...doc } : { ...DEFAULT_CONFIG };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ─── Member Routes ────────────────────────────────────────────────────────────

// GET /pharmacy-vouchers/my — member's own vouchers
router.get(
  '/my',
  requireAnyRole('member', 'gym_owner', 'branch_manager', 'super_admin', 'trainer', 'staff_reception'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const memberId = user.memberId ?? user._id;

      const { status, page = '1', limit = '20' } = req.query;
      const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
      const filter: any = { tenantId, memberId };
      if (status) filter.status = status;

      const [vouchers, total] = await Promise.all([
        PharmacyVoucher.find(filter).sort({ month: -1 }).skip(skip).limit(parseInt(String(limit))).lean(),
        PharmacyVoucher.countDocuments(filter),
      ]);

      return res.json({ success: true, data: { vouchers, total } });
    } catch (err) { next(err); }
  }
);

// GET /pharmacy-vouchers/my/active — active voucher for current month
router.get(
  '/my/active',
  requireAnyRole('member', 'gym_owner', 'branch_manager', 'super_admin', 'trainer', 'staff_reception'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const memberId = user.memberId ?? user._id;
      const currentMonth = getCurrentMonth();

      const voucher = await PharmacyVoucher.findOne({
        tenantId,
        memberId,
        month: currentMonth,
        status: 'active',
      }).lean();

      return res.json({ success: true, data: voucher ?? null });
    } catch (err) { next(err); }
  }
);

// POST /pharmacy-vouchers/redeem/:id — member redeems their voucher
router.post(
  '/redeem/:id',
  requireAnyRole('member', 'gym_owner', 'branch_manager', 'super_admin', 'trainer', 'staff_reception'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const user = (req as any).user;
      const memberId = user.memberId ?? user._id;
      const { redeemedFor } = req.body;

      const voucher = await PharmacyVoucher.findOne({ _id: req.params.id, tenantId });
      if (!voucher) {
        return res.status(404).json({ success: false, message: 'Voucher not found' });
      }
      if (voucher.memberId.toString() !== memberId.toString()) {
        return res.status(403).json({ success: false, message: 'This voucher does not belong to you' });
      }
      if (voucher.status !== 'active') {
        return res.status(400).json({ success: false, message: `Voucher is ${voucher.status} and cannot be redeemed` });
      }
      if (voucher.expiresAt < new Date()) {
        await PharmacyVoucher.findByIdAndUpdate(voucher._id, { status: 'expired' });
        return res.status(400).json({ success: false, message: 'Voucher has expired' });
      }

      const updated = await PharmacyVoucher.findByIdAndUpdate(
        voucher._id,
        {
          $set: {
            isRedeemed: true,
            redeemedAt: new Date(),
            status: 'redeemed',
            redeemedFor: redeemedFor ?? null,
          },
        },
        { new: true }
      );

      const cfg = await getConfig(tenantId);
      return res.json({
        success: true,
        data: {
          partnerRedirectUrl: updated?.partnerRedirectUrl ?? cfg.partnerRedirectUrl,
          voucherCode: updated?.voucherCode,
          message: 'Voucher redeemed! Redirecting to pharmacy partner...',
        },
      });
    } catch (err) { next(err); }
  }
);

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// GET /pharmacy-vouchers — list all vouchers for tenant (paginated, filtered)
router.get(
  '/',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const { month, status, memberId, page = '1', limit = '20' } = req.query;
      const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
      const filter: any = { tenantId };
      if (month) filter.month = month;
      if (status) filter.status = status;
      if (memberId) filter.memberId = memberId;

      const [vouchers, total] = await Promise.all([
        PharmacyVoucher.find(filter)
          .populate('memberId', 'firstName lastName email phone')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(String(limit)))
          .lean(),
        PharmacyVoucher.countDocuments(filter),
      ]);

      return res.json({ success: true, data: { vouchers, total, page: parseInt(String(page)), limit: parseInt(String(limit)) } });
    } catch (err) { next(err); }
  }
);

// POST /pharmacy-vouchers/issue — manually issue voucher for a specific member
router.post(
  '/issue',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const config = await getConfig(tenantId);
      const { memberId, amount, month } = req.body;

      if (!memberId) {
        return res.status(400).json({ success: false, message: 'memberId is required' });
      }

      const targetMonth = month ?? getCurrentMonth();
      const expiresAt = getMonthEnd(targetMonth);

      // Check member exists
      const member = await Member.findOne({ _id: memberId, tenantId }).lean();
      if (!member) {
        return res.status(404).json({ success: false, message: 'Member not found' });
      }

      // Check for existing voucher this month
      const existing = await PharmacyVoucher.findOne({ tenantId, memberId, month: targetMonth });
      if (existing) {
        return res.status(409).json({ success: false, message: `Voucher for ${targetMonth} already issued to this member`, data: existing });
      }

      const voucher = await PharmacyVoucher.create({
        tenantId,
        memberId,
        month: targetMonth,
        amount: amount ?? config.voucherAmount,
        voucherCode: generateVoucherCode(),
        expiresAt,
        partnerName: config.partnerName,
        partnerRedirectUrl: config.partnerRedirectUrl,
        status: 'active',
      });

      return res.status(201).json({ success: true, data: voucher });
    } catch (err) { next(err); }
  }
);

// POST /pharmacy-vouchers/issue-batch — issue vouchers to all eligible members
router.post(
  '/issue-batch',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const config = await getConfig(tenantId);
      const currentMonth = getCurrentMonth();
      const expiresAt = getMonthEnd(currentMonth);

      // Find active subscriptions where plan has pharmacyVouchersEnabled or is in eligiblePlanIds
      const subFilter: any = { tenantId: tenantId as any, status: 'active' };
      if (config.eligiblePlanIds?.length > 0) {
        subFilter.planId = { $in: config.eligiblePlanIds };
      }

      const activeSubs = await Subscription.find(subFilter).select('memberId planId').lean();

      if (!activeSubs.length) {
        return res.json({ success: true, data: { issued: 0, skipped: 0, message: 'No eligible active subscriptions found' } });
      }

      // Get members who already have a voucher this month
      const memberIds = [...new Set(activeSubs.map((s: any) => s.memberId.toString()))];
      const existingVouchers = await PharmacyVoucher.find({
        tenantId,
        memberId: { $in: memberIds },
        month: currentMonth,
      }).select('memberId').lean();
      const alreadyIssuedSet = new Set(existingVouchers.map((v: any) => v.memberId.toString()));

      const toIssue = memberIds.filter(id => !alreadyIssuedSet.has(id));
      const skipped = memberIds.length - toIssue.length;

      if (!toIssue.length) {
        return res.json({ success: true, data: { issued: 0, skipped, message: 'All eligible members already have vouchers for this month' } });
      }

      const docs = toIssue.map(memberId => {
        const sub = activeSubs.find((s: any) => s.memberId.toString() === memberId);
        return {
          tenantId,
          memberId,
          month: currentMonth,
          amount: config.voucherAmount,
          voucherCode: generateVoucherCode(),
          expiresAt,
          partnerName: config.partnerName,
          partnerRedirectUrl: config.partnerRedirectUrl,
          status: 'active',
          planId: sub?.planId?.toString(),
        };
      });

      const result = await PharmacyVoucher.insertMany(docs, { ordered: false }).catch((err: any) => {
        // insertMany partial success — some may have been duplicate keys
        return err.insertedDocs ?? [];
      });

      const issued = Array.isArray(result) ? result.length : 0;
      return res.json({ success: true, data: { issued, skipped: skipped + (toIssue.length - issued), currentMonth } });
    } catch (err) { next(err); }
  }
);

// POST /pharmacy-vouchers/expire — cron: expire overdue active vouchers
router.post(
  '/expire',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await PharmacyVoucher.updateMany(
        { expiresAt: { $lt: new Date() }, status: 'active' },
        { $set: { status: 'expired' } }
      );
      return res.json({ success: true, data: { expired: result.modifiedCount } });
    } catch (err) { next(err); }
  }
);

// GET /pharmacy-vouchers/stats — summary stats for admin
router.get(
  '/stats',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const currentMonth = getCurrentMonth();

      const [totalIssued, totalRedeemed, thisMonthIssued, thisMonthRedeemed, valueAgg, redeemedValueAgg] = await Promise.all([
        PharmacyVoucher.countDocuments({ tenantId }),
        PharmacyVoucher.countDocuments({ tenantId, status: 'redeemed' }),
        PharmacyVoucher.countDocuments({ tenantId, month: currentMonth }),
        PharmacyVoucher.countDocuments({ tenantId, month: currentMonth, status: 'redeemed' }),
        PharmacyVoucher.aggregate([
          { $match: { tenantId } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
        PharmacyVoucher.aggregate([
          { $match: { tenantId, status: 'redeemed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]),
      ]);

      const totalValueIssued = valueAgg[0]?.total ?? 0;
      const totalValueRedeemed = redeemedValueAgg[0]?.total ?? 0;
      const redemptionRate = totalIssued > 0 ? +((totalRedeemed / totalIssued) * 100).toFixed(1) : 0;

      return res.json({
        success: true,
        data: {
          totalIssued,
          totalRedeemed,
          redemptionRate,
          totalValueIssued,
          totalValueRedeemed,
          thisMonth: { issued: thisMonthIssued, redeemed: thisMonthRedeemed },
        },
      });
    } catch (err) { next(err); }
  }
);

// PUT /pharmacy-vouchers/config — update pharmacy config for tenant
router.put(
  '/config',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const { voucherAmount, partnerName, partnerRedirectUrl, autoIssueEnabled, eligiblePlanIds } = req.body;

      const current = await getConfig(tenantId);
      const updated = {
        ...current,
        ...(voucherAmount !== undefined && { voucherAmount }),
        ...(partnerName !== undefined && { partnerName }),
        ...(partnerRedirectUrl !== undefined && { partnerRedirectUrl }),
        ...(autoIssueEnabled !== undefined && { autoIssueEnabled }),
        ...(eligiblePlanIds !== undefined && { eligiblePlanIds }),
      };
      await PharmacyConfigModel.findOneAndUpdate(
        { tenantId },
        { $set: updated },
        { upsert: true, new: true }
      );

      return res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  }
);

// GET /pharmacy-vouchers/config — get current pharmacy config
router.get(
  '/config',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      return res.json({ success: true, data: await getConfig(tenantId) });
    } catch (err) { next(err); }
  }
);

export default router;
