import Coupon from '../models/Coupon.model';
import Referral from '../models/Referral.model';
import Member from '../models/Member.model';
import Payment from '../models/Payment.model';
import logger from '../config/logger';
import mongoose from 'mongoose';

interface CouponData {
    code: string;
    type: 'percentage' | 'fixed';
    value: number;
    minPurchase?: number;
    maxDiscount?: number;
    validFrom: Date;
    validUntil: Date;
    usageLimit?: number;
    perUserLimit?: number;
    applicablePlans?: string[];
    tenantId: string;
}

interface ReferralData {
    referrerId: string;
    refereeEmail: string;
    refereePhone: string;
    tenantId: string;
}

class CouponReferralService {
    /**
     * Create coupon
     */
    async createCoupon(data: CouponData) {
        // Check if code already exists
        const existing = await Coupon.findOne({ code: data.code, tenantId: data.tenantId });
        if (existing) {
            throw new Error('Coupon code already exists');
        }

        const coupon = await (Coupon as any).create({
            ...data,
            isActive: true,
            usedCount: 0,
        });

        logger.info('Coupon created', { code: data.code });

        return coupon;
    }

    /**
     * Validate and apply coupon
     */
    async validateCoupon(code: string, userId: string, planId: string, amount: number) {
        const coupon = await Coupon.findOne({ code, isActive: true });

        if (!coupon) {
            throw new Error('Invalid or expired coupon');
        }

        // Check validity period
        const now = new Date();
        if (now < coupon.validFrom || now > coupon.validUntil) {
            throw new Error('Coupon is not valid at this time');
        }

        // Check usage limit
        if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
            throw new Error('Coupon usage limit reached');
        }

        // Check per-user limit
        if (coupon.perUserLimit) {
            const userUsage = await Payment.countDocuments({
                userId,
                couponCode: code,
            });

            if (userUsage >= coupon.perUserLimit) {
                throw new Error('You have already used this coupon');
            }
        }

        // Check minimum purchase
        if (coupon.minPurchaseAmount && amount < coupon.minPurchaseAmount) {
            throw new Error(`Minimum purchase amount is ₹${coupon.minPurchaseAmount}`);
        }

        // Check applicable plans
        if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
            if (!coupon.applicablePlans.map((id: any) => id.toString()).includes(planId)) {
                throw new Error('Coupon not applicable for this plan');
            }
        }

        // Calculate discount
        let discount = 0;
        if (coupon.type === 'percentage') {
            discount = (amount * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount && discount > coupon.maxDiscountAmount) {
                discount = coupon.maxDiscountAmount;
            }
        } else {
            discount = coupon.discountValue;
        }

        return {
            valid: true,
            discount,
            finalAmount: amount - discount,
            coupon: {
                code: coupon.code,
                type: coupon.type,
                value: coupon.discountValue,
            },
        };
    }

    /**
     * Apply coupon (mark as used)
     */
    async applyCoupon(code: string, userId: string, paymentId: string) {
        const coupon = await Coupon.findOne({ code });

        if (!coupon) {
            throw new Error('Coupon not found');
        }

        // Increment usage count
        coupon.usageCount += 1;
        coupon.usedBy = coupon.usedBy || [];
        coupon.usedBy.push({
            userId: new mongoose.Types.ObjectId(userId),
            paymentId: new mongoose.Types.ObjectId(paymentId),
            usedAt: new Date(),
        });

        await coupon.save();

        logger.info('Coupon applied', { code, userId });

        return {
            success: true,
            message: 'Coupon applied successfully',
        };
    }

    /**
     * Create referral
     */
    async createReferral(data: ReferralData) {
        const { referrerId, refereeEmail, refereePhone, tenantId } = data;

        // Get referrer
        const referrer = await Member.findById(referrerId);
        if (!referrer) {
            throw new Error('Referrer not found');
        }

        // Check if referee already exists
        const existingMember = await Member.findOne({
            $or: [{ email: refereeEmail }, { mobile: refereePhone }],
            tenantId,
        });

        if (existingMember) {
            throw new Error('Referee is already a member');
        }

        // Generate unique referral code
        const referralCode = `REF${referrerId.slice(-6).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;

        // Create referral
        const referral = await (Referral as any).create({
            referrerId,
            refereeEmail,
            refereePhone,
            referralCode,
            status: 'pending',
            tenantId,
            createdAt: new Date(),
        });

        logger.info('Referral created', { referralCode, referrerId });

        return {
            success: true,
            referralCode,
            referral,
        };
    }

    /**
     * Complete referral (when referee joins)
     */
    async completeReferral(referralCode: string, refereeId: string) {
        const referral = await Referral.findOne({ referralCode });

        if (!referral) {
            throw new Error('Invalid referral code');
        }

        if (referral.status !== 'pending') {
            throw new Error('Referral already completed or expired');
        }

        // Update referral
        referral.status = 'rewarded';
        referral.referredId = new mongoose.Types.ObjectId(refereeId) as any;
        referral.rewardedAt = new Date();

        await referral.save();

        // Credit rewards (configurable)
        const referrerReward = 500; // ₹500 credit
        const refereeReward = 300; // ₹300 discount

        // Update referrer credits
        await Member.findByIdAndUpdate(referral.referrerId, {
            $inc: { walletBalance: referrerReward },
        });

        // Create discount coupon for referee
        const refereeCoupon = await this.createCoupon({
            code: `WELCOME${refereeId.slice(-6).toUpperCase()}`,
            type: 'fixed',
            value: refereeReward,
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
            usageLimit: 1,
            perUserLimit: 1,
            tenantId: referral.tenantId.toString(),
        });

        logger.info('Referral completed', { referralCode, referrerReward, refereeReward });

        return {
            success: true,
            message: 'Referral completed successfully',
            rewards: {
                referrerReward,
                refereeReward,
                refereeCouponCode: refereeCoupon.code,
            },
        };
    }

    /**
     * Get referral statistics
     */
    async getReferralStats(memberId: string) {
        const referrals = await Referral.find({ referrerId: memberId });

        const stats = {
            totalReferrals: referrals.length,
            completedReferrals: referrals.filter((r) => r.status === 'rewarded').length,
            pendingReferrals: referrals.filter((r) => r.status === 'pending').length,
            totalRewards: referrals.filter((r) => r.status === 'rewarded').length * 500, // ₹500 per referral
        };

        return stats;
    }

    /**
     * Get active coupons
     */
    async getActiveCoupons(tenantId: string) {
        const now = new Date();

        const coupons = await Coupon.find({
            tenantId,
            isActive: true,
            validFrom: { $lte: now },
            validUntil: { $gte: now },
        }).select('-usedBy');

        return coupons;
    }

    /**
     * Deactivate coupon
     */
    async deactivateCoupon(couponId: string) {
        const coupon = await Coupon.findByIdAndUpdate(
            couponId,
            { isActive: false },
            { new: true }
        );

        if (!coupon) {
            throw new Error('Coupon not found');
        }

        logger.info('Coupon deactivated', { code: coupon.code });

        return {
            success: true,
            message: 'Coupon deactivated successfully',
        };
    }
}

export default new CouponReferralService();
