import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import MembershipPlan from '../models/MembershipPlan.model';
import Member from '../models/Member.model';

class PlanController {
    // POST /
    async createPlan(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const {
                name,
                type,
                duration,
                durationValue,
                description,
                pricing,
                sessions,
                features,
                addOns,
                isFamilyPlan,
                maxFamilyMembers,
                familyDiscount,
                validFrom,
                validUntil,
                maxMembers,
                branchId,
                referralBonus,
            } = req.body;

            // Required field validation
            if (!name) {
                return res.status(400).json({ success: false, message: 'name is required' });
            }
            if (!type) {
                return res.status(400).json({ success: false, message: 'type is required' });
            }
            if (!duration) {
                return res.status(400).json({ success: false, message: 'duration is required' });
            }
            if (durationValue === undefined || durationValue === null) {
                return res.status(400).json({ success: false, message: 'durationValue is required' });
            }
            if (!pricing || pricing.basePrice === undefined) {
                return res.status(400).json({ success: false, message: 'pricing.basePrice is required' });
            }

            // Calculate finalPrice if not provided
            const basePrice = Number(pricing.basePrice);
            const taxRate = Number(pricing.taxRate ?? 0);
            const discountPercent = Number(pricing.discountPercent ?? 0);
            const discountedPrice = basePrice * (1 - discountPercent / 100);
            const finalPrice =
                pricing.finalPrice !== undefined
                    ? Number(pricing.finalPrice)
                    : discountedPrice * (1 + taxRate / 100);

            const plan = await MembershipPlan.create({
                tenantId,
                branchId: branchId || req.branchId,
                name,
                description,
                type,
                duration,
                durationValue: Number(durationValue),
                pricing: {
                    basePrice,
                    taxRate,
                    discountPercent,
                    finalPrice,
                    pricingTiers: pricing.pricingTiers,
                },
                referralBonus: referralBonus ?? 0,
                sessions,
                features,
                addOns: addOns ?? [],
                isFamilyPlan: isFamilyPlan ?? false,
                maxFamilyMembers,
                familyDiscount,
                isActive: true,
                validFrom: validFrom ? new Date(validFrom) : undefined,
                validUntil: validUntil ? new Date(validUntil) : undefined,
                maxMembers,
                currentMembers: 0,
            });

            return res.status(201).json({ success: true, data: plan });
        } catch (error) {
            return next(error);
        }
    }

    // GET /
    async getPlans(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const {
                type,
                branchId,
                page = '1',
                limit = '20',
                includeInactive,
            } = req.query;

            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);
            const skip = (pageNum - 1) * limitNum;

            const filter: any = { tenantId };

            // Only include active plans unless explicitly requested
            if (includeInactive !== 'true') {
                filter.isActive = true;
            }

            if (type) filter.type = type;
            if (branchId) filter.branchId = branchId;

            const [plans, total] = await Promise.all([
                MembershipPlan.find(filter).skip(skip).limit(limitNum).sort({ createdAt: -1 }).lean(),
                MembershipPlan.countDocuments(filter),
            ]);

            // Aggregate live currentMembers count per plan
            const planIds = plans.map((p: any) => p._id);
            const tenantOid = new mongoose.Types.ObjectId(tenantId);
            const memberCounts = await Member.aggregate([
                { $match: { tenantId: tenantOid, planId: { $in: planIds }, status: 'active' } },
                { $group: { _id: '$planId', count: { $sum: 1 } } },
            ]);
            const countMap: Record<string, number> = {};
            for (const row of memberCounts) {
                countMap[row._id.toString()] = row.count;
            }

            const plansWithCount = plans.map((p: any) => ({
                ...p,
                currentMembers: countMap[p._id.toString()] ?? 0,
            }));

            return res.status(200).json({
                success: true,
                data: plansWithCount,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum),
                },
            });
        } catch (error) {
            return next(error);
        }
    }

    // GET /:planId
    async getPlanById(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const planId = String(req.params.planId);

            const plan = await MembershipPlan.findOne({ _id: planId, tenantId }).lean();
            if (!plan) {
                return res.status(404).json({ success: false, message: 'Plan not found' });
            }

            // Enrich with live member count
            const tenantOid = new mongoose.Types.ObjectId(tenantId);
            const planOid = new mongoose.Types.ObjectId(planId);
            const countAgg = await Member.aggregate([
                { $match: { tenantId: tenantOid, planId: planOid, status: 'active' } },
                { $count: 'total' },
            ]);
            const currentMembers = countAgg[0]?.total ?? 0;

            return res.status(200).json({
                success: true,
                data: { ...plan, currentMembers },
            });
        } catch (error) {
            return next(error);
        }
    }

    // PUT /:planId
    async updatePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const planId = String(req.params.planId);
            const updates = { ...req.body };

            // Prevent updating immutable fields
            delete updates.tenantId;
            delete updates._id;
            delete updates.currentMembers;
            delete updates.createdAt;

            // Recalculate finalPrice if pricing fields are being updated
            if (updates.pricing) {
                const existing = await MembershipPlan.findOne({ _id: planId, tenantId });
                if (!existing) {
                    return res.status(404).json({ success: false, message: 'Plan not found' });
                }
                const basePrice = updates.pricing.basePrice ?? existing.pricing.basePrice;
                const taxRate = updates.pricing.taxRate ?? existing.pricing.taxRate ?? 0;
                const discountPercent = updates.pricing.discountPercent ?? existing.pricing.discountPercent ?? 0;
                if (updates.pricing.finalPrice === undefined) {
                    updates.pricing.finalPrice =
                        basePrice * (1 - discountPercent / 100) * (1 + taxRate / 100);
                }
            }

            const updated = await MembershipPlan.findOneAndUpdate(
                { _id: planId, tenantId },
                { $set: updates },
                { new: true, runValidators: true }
            );

            if (!updated) {
                return res.status(404).json({ success: false, message: 'Plan not found' });
            }

            return res.status(200).json({ success: true, data: updated });
        } catch (error) {
            return next(error);
        }
    }

    // DELETE /:planId — soft delete (set isActive=false)
    async deactivatePlan(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });

            const planId = String(req.params.planId);

            const plan = await MembershipPlan.findOneAndUpdate(
                { _id: planId, tenantId },
                { $set: { isActive: false } },
                { new: true }
            );

            if (!plan) {
                return res.status(404).json({ success: false, message: 'Plan not found' });
            }

            return res.status(200).json({ success: true, message: 'Plan deactivated successfully', data: plan });
        } catch (error) {
            return next(error);
        }
    }
}

export default new PlanController();
