import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import Coupon from '../models/Coupon.model';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

/**
 * POST /api/coupon-redemption/validate
 * Validate a coupon code during membership renewal.
 * Body: { couponCode: string; planId?: string; amount: number }
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { couponCode, planId, amount = 0 } = req.body;
    const tenantId = req.tenantId;

    if (!couponCode) {
      return res.status(400).json({ success: false, message: 'Coupon code is required' });
    }

    const now = new Date();

    // Try the native Coupon model first
    let coupon: any = null;
    try {
      coupon = await Coupon.findOne({
        tenantId,
        code: couponCode.toUpperCase().trim(),
        isActive: true,
        $or: [{ validUntil: { $gte: now } }, { validUntil: null }],
        $and: [{ $or: [{ validFrom: { $lte: now } }, { validFrom: null }] }],
      });
    } catch {
      // model query failed — fall through to PromoCode attempt
    }

    // If not found in Coupon model, try PromoCode model (if it exists in this tenant's setup)
    if (!coupon) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const PromoCode = require('../models/PromoCode.model').default;
        coupon = await PromoCode.findOne({
          tenantId,
          code: couponCode.toUpperCase().trim(),
          isActive: true,
          $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
        });
      } catch {
        // PromoCode model does not exist — that's fine
      }
    }

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });
    }

    // Check usage limit
    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit has been reached' });
    }

    // Check minimum purchase amount
    const minAmount = coupon.minPurchaseAmount ?? 0;
    if (amount < minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount of ₹${minAmount} required for this coupon`,
      });
    }

    // Check plan restriction
    if (planId && coupon.applicablePlans && coupon.applicablePlans.length > 0) {
      const planIds = coupon.applicablePlans.map((id: any) => id.toString());
      if (!planIds.includes(planId.toString())) {
        return res.status(400).json({ success: false, message: 'Coupon is not applicable for this plan' });
      }
    }

    // Calculate discount
    const discountType: string = coupon.discountType ?? coupon.type ?? 'fixed';
    const discountValue: number = coupon.discountValue ?? 0;
    let discountAmount = 0;

    if (discountType === 'percentage') {
      discountAmount = Math.round((amount * discountValue) / 100);
      const maxDiscount = coupon.maxDiscountAmount ?? coupon.maxDiscount;
      if (maxDiscount) {
        discountAmount = Math.min(discountAmount, maxDiscount);
      }
    } else {
      discountAmount = discountValue;
    }

    const finalAmount = Math.max(0, amount - discountAmount);

    return res.json({
      success: true,
      data: {
        coupon: {
          code: coupon.code,
          description: coupon.description,
          discountType,
          discountValue,
          maxDiscountAmount: coupon.maxDiscountAmount ?? coupon.maxDiscount,
          minPurchaseAmount: coupon.minPurchaseAmount,
        },
        discountAmount,
        finalAmount,
        originalAmount: amount,
      },
    });
  } catch (err: any) {
    console.error('[coupon-redemption] validate error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error validating coupon' });
  }
});

/**
 * POST /api/coupon-redemption/apply
 * Apply (consume) a validated coupon against a membership renewal.
 * Body: { couponCode: string; membershipId: string; amount: number }
 * Increments usageCount on the coupon document.
 */
router.post('/apply', async (req: Request, res: Response) => {
  try {
    const { couponCode, membershipId, amount = 0 } = req.body;
    const tenantId = req.tenantId;
    const userId = req.user?._id;

    if (!couponCode || !membershipId) {
      return res.status(400).json({ success: false, message: 'couponCode and membershipId are required' });
    }

    const now = new Date();

    let coupon: any = null;
    try {
      coupon = await Coupon.findOne({
        tenantId,
        code: couponCode.toUpperCase().trim(),
        isActive: true,
        $or: [{ validUntil: { $gte: now } }, { validUntil: null }],
      });
    } catch {
      // ignore
    }

    if (!coupon) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const PromoCode = require('../models/PromoCode.model').default;
        coupon = await PromoCode.findOne({
          tenantId,
          code: couponCode.toUpperCase().trim(),
          isActive: true,
          $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
        });
      } catch {
        // model does not exist
      }
    }

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon code' });
    }

    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({ success: false, message: 'Coupon usage limit has been reached' });
    }

    // Compute discount
    const discountType: string = coupon.discountType ?? coupon.type ?? 'fixed';
    const discountValue: number = coupon.discountValue ?? 0;
    let discountAmount = 0;

    if (discountType === 'percentage') {
      discountAmount = Math.round((amount * discountValue) / 100);
      const maxDiscount = coupon.maxDiscountAmount ?? coupon.maxDiscount;
      if (maxDiscount) discountAmount = Math.min(discountAmount, maxDiscount);
    } else {
      discountAmount = discountValue;
    }

    const finalAmount = Math.max(0, amount - discountAmount);

    // Increment usage count and record who used it
    coupon.usageCount = (coupon.usageCount ?? 0) + 1;
    if (Array.isArray(coupon.usedBy) && userId) {
      coupon.usedBy.push({ userId, paymentId: null, usedAt: now });
    }
    await coupon.save();

    return res.json({
      success: true,
      data: {
        coupon: {
          code: coupon.code,
          description: coupon.description,
          discountType,
          discountValue,
        },
        discountAmount,
        finalAmount,
        originalAmount: amount,
        membershipId,
        appliedAt: now.toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[coupon-redemption] apply error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error applying coupon' });
  }
});

/**
 * GET /api/coupon-redemption/list
 * List all coupons for this tenant (admin).
 */
router.get('/list', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const coupons = await Coupon.find({ tenantId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: coupons });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/coupon-redemption/create
 * Create a new coupon for this tenant (admin).
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const { code, description, discountType, discountValue, validFrom, validUntil, usageLimit, minPurchaseAmount, maxDiscountAmount } = req.body;
    if (!code || !discountType || discountValue == null) {
      return res.status(400).json({ success: false, message: 'code, discountType and discountValue are required' });
    }
    const existing = await Coupon.findOne({ tenantId, code: code.toUpperCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A coupon with this code already exists' });
    }
    const coupon = await Coupon.create({
      tenantId,
      code: code.toUpperCase().trim(),
      description: description ?? '',
      discountType,
      discountValue: Number(discountValue),
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validUntil: validUntil ? new Date(validUntil) : undefined,
      usageLimit: usageLimit ? Number(usageLimit) : undefined,
      minPurchaseAmount: minPurchaseAmount ? Number(minPurchaseAmount) : undefined,
      maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
      isActive: true,
    });
    return res.json({ success: true, data: coupon });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/coupon-redemption/:id
 * Deactivate (soft-delete) a coupon by ID.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;
    const coupon = await Coupon.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { isActive: false },
      { new: true }
    );
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    return res.json({ success: true, message: 'Coupon deactivated' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
