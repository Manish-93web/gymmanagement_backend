import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import FavouriteMeal from '../models/FavouriteMeal.model';
import NutritionLog from '../models/NutritionLog.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ── Helper: resolve memberId from authenticated user ──────────────────────────
async function resolveMember(req: Request): Promise<mongoose.Types.ObjectId | null> {
    const tenantId = (req as any).tenantId;
    const userId   = (req as any).user?._id;
    if (!userId) return null;
    const member = await Member.findOne({ userId, tenantId }).select('_id').lean();
    return member ? (member._id as mongoose.Types.ObjectId) : null;
}

// ── GET / — member's own favourites, sorted by logCount desc ─────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (req as any).tenantId;
        const memberId = await resolveMember(req);
        if (!memberId) {
            return res.status(404).json({ success: false, message: 'Member profile not found' });
        }

        const favourites = await FavouriteMeal.find({ tenantId, memberId, isActive: true })
            .sort({ logCount: -1, createdAt: -1 })
            .lean();

        return res.json({ success: true, data: favourites });
    } catch (err) { next(err); }
});

// ── POST / — save a new favourite ─────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (req as any).tenantId;
        const memberId = await resolveMember(req);
        if (!memberId) {
            return res.status(404).json({ success: false, message: 'Member profile not found' });
        }

        const { name, mealType, items } = req.body;
        if (!name || !mealType || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'name, mealType, and items[] are required' });
        }

        const totalCalories = items.reduce((s: number, i: any) => s + (Number(i.calories) || 0), 0);
        const totalProtein  = items.reduce((s: number, i: any) => s + (Number(i.protein)  || 0), 0);
        const totalCarbs    = items.reduce((s: number, i: any) => s + (Number(i.carbs)    || 0), 0);
        const totalFat      = items.reduce((s: number, i: any) => s + (Number(i.fat)      || 0), 0);

        const favourite = await FavouriteMeal.create({
            tenantId,
            memberId,
            name:    name.trim(),
            mealType,
            items,
            totalCalories,
            totalProtein,
            totalCarbs,
            totalFat,
        });

        return res.status(201).json({ success: true, data: favourite });
    } catch (err) { next(err); }
});

// ── GET /recent — last 10 unique meal combos from past 14 days ────────────────
router.get('/recent', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (req as any).tenantId;
        const memberId = await resolveMember(req);
        if (!memberId) {
            return res.status(404).json({ success: false, message: 'Member profile not found' });
        }

        const since = new Date();
        since.setDate(since.getDate() - 14);

        const logs = await NutritionLog.find({ tenantId, memberId, date: { $gte: since } })
            .sort({ date: -1 })
            .limit(60)
            .lean();

        // Deduplicate by mealType + sorted food names
        const seen    = new Set<string>();
        const unique: any[] = [];

        for (const log of logs) {
            const foodNames = (log.foods ?? [])
                .map((f: any) => f.foodName)
                .filter(Boolean)
                .sort()
                .join('|');
            const key = `${log.mealType}::${foodNames}`;

            if (!seen.has(key)) {
                seen.add(key);
                unique.push({
                    _id:           log._id,
                    mealType:      log.mealType,
                    foods:         log.foods,
                    totalCalories: log.totalCalories,
                    totalProtein:  log.totalProtein,
                    totalCarbs:    log.totalCarbs,
                    totalFats:     log.totalFats,
                    date:          log.date,
                });
                if (unique.length >= 10) break;
            }
        }

        return res.json({ success: true, data: unique });
    } catch (err) { next(err); }
});

// ── POST /:id/quick-log — log favourite into NutritionLog for today ───────────
router.post('/:id/quick-log', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (req as any).tenantId;
        const userId   = (req as any).user?._id;
        const memberId = await resolveMember(req);
        if (!memberId) {
            return res.status(404).json({ success: false, message: 'Member profile not found' });
        }

        const favourite = await FavouriteMeal.findOne({
            _id:      req.params.id,
            tenantId,
            memberId,
            isActive: true,
        });
        if (!favourite) {
            return res.status(404).json({ success: false, message: 'Favourite not found' });
        }

        const { date: dateStr, mealType } = req.body;
        const logDate = dateStr ? new Date(dateStr) : new Date();
        logDate.setHours(0, 0, 0, 0);

        const resolvedMealType = mealType || favourite.mealType;

        // Map favourite items → NutritionLog foods format (fats not fat)
        const foods = favourite.items.map((item: any) => ({
            foodName: item.foodName,
            quantity: item.quantity,
            unit:     item.unit,
            calories: item.calories,
            protein:  item.protein,
            carbs:    item.carbs,
            fats:     item.fat,
            fiber:    0,
        }));

        const log = await NutritionLog.create({
            tenantId,
            memberId,
            userId,
            date:          logDate,
            mealType:      resolvedMealType,
            foods,
            totalCalories: favourite.totalCalories,
            totalProtein:  favourite.totalProtein,
            totalCarbs:    favourite.totalCarbs,
            totalFats:     favourite.totalFat,
            totalFiber:    0,
        });

        // Increment logCount and update lastLoggedAt
        favourite.logCount      = (favourite.logCount ?? 0) + 1;
        favourite.lastLoggedAt  = new Date();
        await favourite.save();

        return res.status(201).json({ success: true, data: log });
    } catch (err) { next(err); }
});

// ── PUT /:id — rename or update (name and mealType only) ─────────────────────
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (req as any).tenantId;
        const memberId = await resolveMember(req);
        if (!memberId) {
            return res.status(404).json({ success: false, message: 'Member profile not found' });
        }

        const { name, mealType } = req.body;
        const patch: Record<string, any> = {};
        if (name)     patch.name     = String(name).trim();
        if (mealType) patch.mealType = mealType;

        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ success: false, message: 'Provide name or mealType to update' });
        }

        const updated = await FavouriteMeal.findOneAndUpdate(
            { _id: req.params.id, tenantId, memberId, isActive: true },
            { $set: patch },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Favourite not found' });
        }

        return res.json({ success: true, data: updated });
    } catch (err) { next(err); }
});

// ── DELETE /:id — soft delete (isActive = false) ──────────────────────────────
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (req as any).tenantId;
        const memberId = await resolveMember(req);
        if (!memberId) {
            return res.status(404).json({ success: false, message: 'Member profile not found' });
        }

        const updated = await FavouriteMeal.findOneAndUpdate(
            { _id: req.params.id, tenantId, memberId },
            { $set: { isActive: false } },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, message: 'Favourite not found' });
        }

        return res.json({ success: true });
    } catch (err) { next(err); }
});

export default router;
