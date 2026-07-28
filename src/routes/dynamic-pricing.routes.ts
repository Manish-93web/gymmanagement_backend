import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import DynamicPricingRule from '../models/DynamicPricingRule.model';
import SlotPriceSnapshot from '../models/SlotPriceSnapshot.model';
import ClassModel from '../models/Class.model';
import BookingModel from '../models/Booking.model';

const router = Router();
router.use(authenticate, tenantContext);

// ─── Pricing computation helper ───────────────────────────────────────────────
function computeSlotPrice(
    basePrice: number,
    slotHour: number,
    slotDay: number,
    rule: any,
    bookingCount: number,
    capacity: number
): { price: number; label: 'peak' | 'off-peak' | 'standard'; demandScore: number } {
    const occupancy = capacity > 0 ? (bookingCount / capacity) * 100 : 0;
    const demandScore = Math.min(100, Math.round(occupancy + bookingCount * 2));

    const isPeak = rule.peakHours.some(
        (ph: any) =>
            ph.days.includes(slotDay) &&
            slotHour >= ph.startHour &&
            slotHour < ph.endHour
    );

    let multiplier = isPeak ? rule.peakMultiplier : rule.offPeakDiscount;

    // Demand adjustment
    if (rule.demandSensitivity === 'high' && demandScore > 70) multiplier += 0.2;
    if (rule.demandSensitivity === 'medium' && demandScore > 80) multiplier += 0.1;

    let price = Math.round(basePrice * multiplier);
    if (rule.minPrice) price = Math.max(price, rule.minPrice);
    if (rule.maxPrice) price = Math.min(price, rule.maxPrice);

    const label: 'peak' | 'off-peak' | 'standard' = isPeak ? 'peak' : demandScore > 70 ? 'standard' : 'off-peak';
    return { price, label, demandScore };
}

// ─── Parse slot hour from "HH:MM" string ──────────────────────────────────────
function parseSlotHour(timeStr: string): number {
    const parts = (timeStr ?? '00:00').split(':');
    return parseInt(parts[0] ?? '0', 10);
}

// ─── GET /dynamic-pricing/rules ───────────────────────────────────────────────
router.get(
    '/rules',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const rules = await DynamicPricingRule.find({ tenantId }).sort({ createdAt: -1 }).lean();
            return res.json({ success: true, data: rules });
        } catch (err) {
            next(err);
        }
    }
);

// ─── POST /dynamic-pricing/rules ──────────────────────────────────────────────
router.post(
    '/rules',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const {
                name,
                branchId,
                applyToAllClasses,
                classIds,
                peakHours,
                peakMultiplier,
                offPeakDiscount,
                minPrice,
                maxPrice,
                demandSensitivity,
            } = req.body;

            if (!name?.trim()) {
                return res.status(400).json({ success: false, message: 'Rule name is required' });
            }

            const rule = await DynamicPricingRule.create({
                tenantId,
                branchId,
                name: name.trim(),
                applyToAllClasses: applyToAllClasses !== false,
                classIds: classIds ?? [],
                peakHours: peakHours ?? [],
                peakMultiplier: peakMultiplier ?? 1.5,
                offPeakDiscount: offPeakDiscount ?? 0.8,
                minPrice,
                maxPrice,
                demandSensitivity: demandSensitivity ?? 'medium',
            });

            return res.status(201).json({ success: true, data: rule });
        } catch (err) {
            next(err);
        }
    }
);

// ─── PUT /dynamic-pricing/rules/:id ───────────────────────────────────────────
router.put(
    '/rules/:id',
    requireAnyRole('gym_owner', 'branch_manager'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const {
                name,
                branchId,
                applyToAllClasses,
                classIds,
                peakHours,
                peakMultiplier,
                offPeakDiscount,
                minPrice,
                maxPrice,
                demandSensitivity,
                pinnedDates,
            } = req.body;

            const rule = await DynamicPricingRule.findOneAndUpdate(
                { _id: req.params.id, tenantId },
                {
                    $set: {
                        ...(name !== undefined && { name }),
                        ...(branchId !== undefined && { branchId }),
                        ...(applyToAllClasses !== undefined && { applyToAllClasses }),
                        ...(classIds !== undefined && { classIds }),
                        ...(peakHours !== undefined && { peakHours }),
                        ...(peakMultiplier !== undefined && { peakMultiplier }),
                        ...(offPeakDiscount !== undefined && { offPeakDiscount }),
                        ...(minPrice !== undefined && { minPrice }),
                        ...(maxPrice !== undefined && { maxPrice }),
                        ...(demandSensitivity !== undefined && { demandSensitivity }),
                        ...(pinnedDates !== undefined && { pinnedDates }),
                    },
                },
                { new: true }
            );

            if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
            return res.json({ success: true, data: rule });
        } catch (err) {
            next(err);
        }
    }
);

// ─── DELETE /dynamic-pricing/rules/:id ────────────────────────────────────────
router.delete(
    '/rules/:id',
    requireAnyRole('gym_owner', 'super_admin'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const rule = await DynamicPricingRule.findOneAndDelete({ _id: req.params.id, tenantId });
            if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
            return res.json({ success: true, message: 'Rule deleted' });
        } catch (err) {
            next(err);
        }
    }
);

// ─── PUT /dynamic-pricing/rules/:id/toggle ────────────────────────────────────
router.put(
    '/rules/:id/toggle',
    requireAnyRole('gym_owner'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const rule = await DynamicPricingRule.findOne({ _id: req.params.id, tenantId });
            if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
            rule.isEnabled = !rule.isEnabled;
            await rule.save();
            return res.json({ success: true, data: rule });
        } catch (err) {
            next(err);
        }
    }
);

// ─── POST /dynamic-pricing/compute ────────────────────────────────────────────
router.post(
    '/compute',
    requireAnyRole('gym_owner', 'branch_manager'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const { fromDate, toDate } = req.body;

            if (!fromDate || !toDate) {
                return res.status(400).json({ success: false, message: 'fromDate and toDate are required' });
            }

            const from = new Date(fromDate);
            const to = new Date(toDate);
            to.setHours(23, 59, 59, 999);

            // Fetch enabled rules
            const rules = await DynamicPricingRule.find({ tenantId, isEnabled: true }).lean();
            if (!rules.length) {
                return res.json({ success: true, data: { snapshotsCreated: 0, message: 'No enabled pricing rules found' } });
            }

            // Fetch active classes for this tenant
            const classes = await ClassModel.find({ tenantId, isActive: true, isCancelled: false })
                .select('_id name schedule.startTime pricing.dropInPrice capacity.max')
                .lean();

            if (!classes.length) {
                return res.json({ success: true, data: { snapshotsCreated: 0, message: 'No active classes found' } });
            }

            // Fetch bookings in the date range grouped by classId + classDate
            const bookingGroups = await BookingModel.aggregate([
                {
                    $match: {
                        tenantId: tenantId as any,
                        classDate: { $gte: from, $lte: to },
                        status: { $in: ['confirmed', 'waitlist'] },
                    },
                },
                {
                    $group: {
                        _id: { classId: '$classId', date: { $dateToString: { format: '%Y-%m-%d', date: '$classDate' } } },
                        bookingCount: { $sum: 1 },
                    },
                },
            ]);

            // Build lookup: classId:dateStr → bookingCount
            const bookingMap: Record<string, number> = {};
            for (const bg of bookingGroups) {
                const key = `${bg._id.classId}:${bg._id.date}`;
                bookingMap[key] = bg.bookingCount;
            }

            // Iterate date range day by day
            const snapshots: any[] = [];
            const cursor = new Date(from);

            while (cursor <= to) {
                const dayOfWeek = cursor.getDay(); // 0=Sun..6=Sat
                const dateStr = cursor.toISOString().split('T')[0];

                for (const cls of classes) {
                    const classId = (cls as any)._id.toString();
                    const slotTime: string = (cls as any).schedule?.startTime ?? '00:00';
                    const slotHour = parseSlotHour(slotTime);
                    const basePrice: number = (cls as any).pricing?.dropInPrice ?? 0;
                    const capacity: number = (cls as any).capacity?.max ?? 1;
                    const bookingCount = bookingMap[`${classId}:${dateStr}`] ?? 0;

                    // Find applicable rule
                    const applicableRule = rules.find((r) => {
                        if (r.applyToAllClasses) return true;
                        return r.classIds?.includes(classId);
                    });

                    if (!applicableRule) continue;

                    // Check pinned date override
                    const pinnedDate = applicableRule.pinnedDates?.find((pd: any) => {
                        const pdStr = new Date(pd.date).toISOString().split('T')[0];
                        return pdStr === dateStr;
                    });

                    let computedPrice: number;
                    let priceLabel: string;
                    let demandScore: number;

                    if (pinnedDate) {
                        computedPrice = pinnedDate.price;
                        priceLabel = 'special';
                        const occupancy = capacity > 0 ? (bookingCount / capacity) * 100 : 0;
                        demandScore = Math.min(100, Math.round(occupancy + bookingCount * 2));
                    } else {
                        const result = computeSlotPrice(basePrice, slotHour, dayOfWeek, applicableRule, bookingCount, capacity);
                        computedPrice = result.price;
                        priceLabel = result.label;
                        demandScore = result.demandScore;
                    }

                    const occupancyPercent = capacity > 0 ? Math.round((bookingCount / capacity) * 100) : 0;

                    snapshots.push({
                        tenantId,
                        classId,
                        className: (cls as any).name,
                        date: new Date(dateStr),
                        slotTime,
                        basePrice,
                        computedPrice,
                        priceLabel,
                        demandScore,
                        bookingCount,
                        capacity,
                        occupancyPercent,
                        ruleName: applicableRule.name,
                    });
                }

                cursor.setDate(cursor.getDate() + 1);
            }

            if (!snapshots.length) {
                return res.json({ success: true, data: { snapshotsCreated: 0 } });
            }

            // Upsert snapshots — replace existing ones for the same class+date
            const ops = snapshots.map((snap) => ({
                updateOne: {
                    filter: { tenantId: snap.tenantId, classId: snap.classId, date: snap.date },
                    update: { $set: snap },
                    upsert: true,
                },
            }));

            const bulkResult = await SlotPriceSnapshot.bulkWrite(ops as any);
            const snapshotsCreated = bulkResult.upsertedCount + bulkResult.modifiedCount;

            return res.json({ success: true, data: { snapshotsCreated, total: snapshots.length } });
        } catch (err) {
            next(err);
        }
    }
);

// ─── GET /dynamic-pricing/snapshots ───────────────────────────────────────────
router.get(
    '/snapshots',
    requireAnyRole('gym_owner', 'branch_manager'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const { classId, date, priceLabel, page = '1', limit = '50' } = req.query;

            const filter: any = { tenantId };
            if (classId) filter.classId = classId;
            if (priceLabel) filter.priceLabel = priceLabel;
            if (date) {
                const d = new Date(date as string);
                const dEnd = new Date(date as string);
                dEnd.setHours(23, 59, 59, 999);
                filter.date = { $gte: d, $lte: dEnd };
            }

            const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
            const [snapshots, total] = await Promise.all([
                SlotPriceSnapshot.find(filter)
                    .sort({ date: -1, slotTime: 1 })
                    .skip(skip)
                    .limit(parseInt(limit as string, 10))
                    .lean(),
                SlotPriceSnapshot.countDocuments(filter),
            ]);

            return res.json({ success: true, data: snapshots, total, page: parseInt(page as string, 10) });
        } catch (err) {
            next(err);
        }
    }
);

// ─── GET /dynamic-pricing/class/:classId/price ────────────────────────────────
router.get(
    '/class/:classId/price',
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const { classId } = req.params;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayEnd = new Date(today);
            todayEnd.setHours(23, 59, 59, 999);

            // Try existing snapshot first
            const snapshot = await SlotPriceSnapshot.findOne({
                tenantId,
                classId,
                date: { $gte: today, $lte: todayEnd },
            }).lean();

            if (snapshot) {
                return res.json({ success: true, data: snapshot });
            }

            // Compute on the fly
            const cls = await ClassModel.findOne({ _id: classId, tenantId })
                .select('name schedule.startTime pricing.dropInPrice capacity.max capacity.current')
                .lean();

            if (!cls) return res.status(404).json({ success: false, message: 'Class not found' });

            const slotTime: string = (cls as any).schedule?.startTime ?? '00:00';
            const slotHour = parseSlotHour(slotTime);
            const dayOfWeek = today.getDay();
            const basePrice: number = (cls as any).pricing?.dropInPrice ?? 0;
            const capacity: number = (cls as any).capacity?.max ?? 1;
            const bookingCount: number = (cls as any).capacity?.current ?? 0;

            const rules = await DynamicPricingRule.find({ tenantId, isEnabled: true }).lean();
            const applicableRule = rules.find((r) => r.applyToAllClasses || (r.classIds as string[])?.includes(classId as string));

            if (!applicableRule) {
                return res.json({
                    success: true,
                    data: {
                        classId,
                        className: (cls as any).name,
                        slotTime,
                        basePrice,
                        computedPrice: basePrice,
                        priceLabel: 'standard',
                        demandScore: 0,
                        bookingCount,
                        capacity,
                        occupancyPercent: capacity > 0 ? Math.round((bookingCount / capacity) * 100) : 0,
                    },
                });
            }

            const { price, label, demandScore } = computeSlotPrice(basePrice, slotHour, dayOfWeek, applicableRule, bookingCount, capacity);
            const occupancyPercent = capacity > 0 ? Math.round((bookingCount / capacity) * 100) : 0;

            // Persist the computed snapshot
            const newSnap = new SlotPriceSnapshot({
                tenantId,
                classId: classId as string,
                className: (cls as any).name,
                date: today,
                slotTime,
                basePrice,
                computedPrice: price,
                priceLabel: label,
                demandScore,
                bookingCount,
                capacity,
                occupancyPercent,
                ruleName: applicableRule.name,
            });
            await newSnap.save();

            return res.json({
                success: true,
                data: {
                    classId,
                    className: (cls as any).name,
                    slotTime,
                    basePrice,
                    computedPrice: price,
                    priceLabel: label,
                    demandScore,
                    bookingCount,
                    capacity,
                    occupancyPercent,
                    ruleName: applicableRule.name,
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

// ─── GET /dynamic-pricing/revenue-comparison ──────────────────────────────────
router.get(
    '/revenue-comparison',
    requireAnyRole('gym_owner', 'super_admin'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            from.setHours(0, 0, 0, 0);

            // Aggregate from SlotPriceSnapshot — revenue = bookingCount * price
            const [agg] = await SlotPriceSnapshot.aggregate([
                { $match: { tenantId, date: { $gte: from } } },
                {
                    $group: {
                        _id: null,
                        actualRevenue: { $sum: { $multiply: ['$computedPrice', '$bookingCount'] } },
                        flatPriceRevenue: { $sum: { $multiply: ['$basePrice', '$bookingCount'] } },
                        totalSnapshots: { $sum: 1 },
                        totalBookings: { $sum: '$bookingCount' },
                    },
                },
            ]);

            const actualRevenue = agg?.actualRevenue ?? 0;
            const flatPriceRevenue = agg?.flatPriceRevenue ?? 0;
            const upliftAmount = actualRevenue - flatPriceRevenue;
            const upliftPercent =
                flatPriceRevenue > 0 ? Math.round((upliftAmount / flatPriceRevenue) * 100 * 10) / 10 : 0;

            return res.json({
                success: true,
                data: {
                    actualRevenue,
                    flatPriceRevenue,
                    upliftAmount,
                    upliftPercent,
                    totalSnapshots: agg?.totalSnapshots ?? 0,
                    totalBookings: agg?.totalBookings ?? 0,
                    periodDays: 30,
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

// ─── GET /dynamic-pricing/underbooked ─────────────────────────────────────────
router.get(
    '/underbooked',
    requireAnyRole('gym_owner', 'branch_manager'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const in7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

            const underbooked = await SlotPriceSnapshot.find({
                tenantId,
                demandScore: { $lt: 30 },
                date: { $gte: today, $lte: in7Days },
            })
                .sort({ demandScore: 1 })
                .limit(50)
                .lean();

            return res.json({ success: true, data: underbooked });
        } catch (err) {
            next(err);
        }
    }
);

// ─── POST /dynamic-pricing/pinned-date ────────────────────────────────────────
router.post(
    '/pinned-date',
    requireAnyRole('gym_owner'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = (req as any).tenantId;
            const { ruleId, date, price, reason } = req.body;

            if (!ruleId || !date || price === undefined) {
                return res.status(400).json({ success: false, message: 'ruleId, date, and price are required' });
            }

            const rule = await DynamicPricingRule.findOneAndUpdate(
                { _id: ruleId, tenantId },
                {
                    $push: {
                        pinnedDates: { date: new Date(date), price: Number(price), reason },
                    },
                },
                { new: true }
            );

            if (!rule) return res.status(404).json({ success: false, message: 'Rule not found' });
            return res.json({ success: true, data: rule });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
