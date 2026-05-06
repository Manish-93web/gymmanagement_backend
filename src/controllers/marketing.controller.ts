import { Request, Response, NextFunction } from 'express';
import Campaign from '../models/Campaign.model';
import Coupon from '../models/Coupon.model';
import Referral from '../models/Referral.model';
import Member from '../models/Member.model';
import mongoose from 'mongoose';

export class MarketingController {
    // CAMPAIGNS
    async getCampaigns(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { type, status, page = 1, limit = 20 } = req.query;
            const query: any = { tenantId };
            if (type) query.type = type;
            if (status) query.status = status;
            const skip = (Number(page) - 1) * Number(limit);
            const [campaigns, total] = await Promise.all([
                Campaign.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
                Campaign.countDocuments(query)
            ]);
            return res.json({ success: true, data: { campaigns, total, page: Number(page) } });
        } catch (error) { return next(error); }
    }

    async createCampaign(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { name, type, targetAudience, subject, content, scheduledAt, channels, description } = req.body;
            if (!name || !type) return res.status(400).json({ success: false, message: 'name and type are required' });
            const campaign = await Campaign.create({
                name,
                type: type || 'email',
                description: description || '',
                targetAudience: targetAudience || {},
                content: {
                    subject: subject,
                    message: content || '',
                },
                schedule: {
                    startDate: scheduledAt ? new Date(scheduledAt) : new Date(),
                },
                status: 'draft',
                analytics: {
                    totalRecipients: 0,
                    sent: 0,
                    delivered: 0,
                    opened: 0,
                    clicked: 0,
                    converted: 0,
                    revenue: 0,
                },
                createdBy: req.user!._id,
                tenantId
            });
            return res.status(201).json({ success: true, data: campaign });
        } catch (error) { return next(error); }
    }

    async getCampaignById(req: Request, res: Response, next: NextFunction) {
        try {
            const campaign = await Campaign.findOne({ _id: req.params.campaignId, tenantId: req.user!.tenantId });
            if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
            return res.json({ success: true, data: campaign });
        } catch (error) { return next(error); }
    }

    async updateCampaign(req: Request, res: Response, next: NextFunction) {
        try {
            const campaign = await Campaign.findOneAndUpdate(
                { _id: req.params.campaignId, tenantId: req.user!.tenantId },
                req.body, { new: true }
            );
            if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
            return res.json({ success: true, data: campaign });
        } catch (error) { return next(error); }
    }

    async deleteCampaign(req: Request, res: Response, next: NextFunction) {
        try {
            await Campaign.findOneAndUpdate(
                { _id: req.params.campaignId, tenantId: req.user!.tenantId },
                { status: 'cancelled' }
            );
            return res.json({ success: true, message: 'Campaign cancelled' });
        } catch (error) { return next(error); }
    }

    async getCampaignStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const stats = await Campaign.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId as unknown as string) } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]);
            const result: any = { total: 0, sent: 0, draft: 0, scheduled: 0, cancelled: 0, running: 0, completed: 0, paused: 0 };
            stats.forEach((s: any) => { result[s._id] = s.count; result.total += s.count; });
            return res.json({ success: true, data: result });
        } catch (error) { return next(error); }
    }

    // COUPONS
    async getCoupons(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { page = 1, limit = 20 } = req.query;
            const skip = (Number(page) - 1) * Number(limit);
            const [coupons, total] = await Promise.all([
                Coupon.find({ tenantId }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
                Coupon.countDocuments({ tenantId })
            ]);
            return res.json({ success: true, data: { coupons, total } });
        } catch (error) { return next(error); }
    }

    async createCoupon(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { code, discountType, discountValue, validFrom, validUntil, usageLimit, minPurchaseAmount, description } = req.body;
            const couponCode = code || Math.random().toString(36).substring(2, 8).toUpperCase();
            if (!discountType || !discountValue) return res.status(400).json({ success: false, message: 'discountType and discountValue are required' });
            if (!validUntil) return res.status(400).json({ success: false, message: 'validUntil is required' });
            const coupon = await Coupon.create({
                code: couponCode,
                discountType,
                discountValue,
                validFrom: validFrom ? new Date(validFrom) : new Date(),
                validUntil: new Date(validUntil),
                usageLimit,
                usageCount: 0,
                minPurchaseAmount: minPurchaseAmount || 0,
                description: description || '',
                isActive: true,
                tenantId
            });
            return res.status(201).json({ success: true, data: coupon });
        } catch (error) { return next(error); }
    }

    async getCouponById(req: Request, res: Response, next: NextFunction) {
        try {
            const coupon = await Coupon.findOne({ _id: req.params.couponId, tenantId: req.user!.tenantId });
            if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
            return res.json({ success: true, data: coupon });
        } catch (error) { return next(error); }
    }

    async updateCoupon(req: Request, res: Response, next: NextFunction) {
        try {
            const coupon = await Coupon.findOneAndUpdate(
                { _id: req.params.couponId, tenantId: req.user!.tenantId },
                req.body, { new: true }
            );
            if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
            return res.json({ success: true, data: coupon });
        } catch (error) { return next(error); }
    }

    async deleteCoupon(req: Request, res: Response, next: NextFunction) {
        try {
            await Coupon.findOneAndUpdate({ _id: req.params.couponId, tenantId: req.user!.tenantId }, { isActive: false });
            return res.json({ success: true, message: 'Coupon deactivated' });
        } catch (error) { return next(error); }
    }

    async validateCoupon(req: Request, res: Response, next: NextFunction) {
        try {
            const { code, amount } = req.body;
            const coupon = await Coupon.findOne({ code: code.toUpperCase(), tenantId: req.user!.tenantId, isActive: true });
            if (!coupon) return res.status(404).json({ success: false, message: 'Invalid coupon code' });
            if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) return res.status(400).json({ success: false, message: 'Coupon has expired' });
            if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) return res.status(400).json({ success: false, message: 'Coupon usage limit reached' });
            if (coupon.minPurchaseAmount && amount < coupon.minPurchaseAmount) return res.status(400).json({ success: false, message: `Minimum purchase of ${coupon.minPurchaseAmount} required` });
            const discount = coupon.discountType === 'percentage' ? (amount * coupon.discountValue / 100) : coupon.discountValue;
            const finalDiscount = coupon.maxDiscountAmount ? Math.min(discount, coupon.maxDiscountAmount) : discount;
            return res.json({ success: true, data: { coupon, discountAmount: finalDiscount, finalAmount: amount - finalDiscount } });
        } catch (error) { return next(error); }
    }

    // REFERRALS
    async getReferrals(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const referrals = await Referral.find({ tenantId })
                .populate('referrerId', 'firstName lastName')
                .populate('referredId', 'firstName lastName')
                .sort({ createdAt: -1 });
            return res.json({ success: true, data: referrals });
        } catch (error) { return next(error); }
    }

    async createReferral(req: Request, res: Response, next: NextFunction) {
        try {
            const { memberId, rewardType, rewardValue, expiryDate } = req.body;
            if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' });
            const referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
            const referral = await Referral.create({
                referrerId: memberId,
                referralCode,
                rewardType: rewardType || 'credit',
                rewardValue: rewardValue || 0,
                status: 'pending',
                tenantId: req.user!.tenantId
            });
            return res.status(201).json({ success: true, data: referral });
        } catch (error) { return next(error); }
    }

    async getReferralStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const [total, converted] = await Promise.all([
                Referral.countDocuments({ tenantId }),
                Referral.countDocuments({ tenantId, status: 'converted' })
            ]);
            return res.json({ success: true, data: { total, converted, conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0 } });
        } catch (error) { return next(error); }
    }

    async processReferralConversion(req: Request, res: Response, next: NextFunction) {
        try {
            const { referralCode, newMemberId } = req.body;
            const referral = await Referral.findOneAndUpdate(
                { referralCode, tenantId: req.user!.tenantId, status: 'pending' },
                { status: 'converted', referredId: newMemberId, convertedAt: new Date() },
                { new: true }
            );
            if (!referral) return res.status(404).json({ success: false, message: 'Referral not found or already processed' });
            return res.json({ success: true, data: referral });
        } catch (error) { return next(error); }
    }
}

export default new MarketingController();
