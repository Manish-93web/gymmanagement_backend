import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import nutritionController from '../controllers/nutrition.controller';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

// ─── Hydration Log Model (inline) ─────────────────────────────────────────────
const HydrationLogModel: any = mongoose.models['HydrationLog'] || mongoose.model('HydrationLog', new mongoose.Schema({
    tenantId: { type: String, required: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date:     { type: String, required: true }, // YYYY-MM-DD
    glasses:  { type: Number, default: 0, min: 0, max: 20 },
}, { timestamps: true, collection: 'hydration_logs' }));

const router = Router();

// ─── Barcode lookup via Open Food Facts ───────────────────────────────────────
router.get('/foods/barcode/:code', authenticate, async (req: Request, res: Response) => {
    try {
        const code = req.params.code as string;
        if (!code || !/^\d{6,14}$/.test(code)) {
            res.status(400).json({ success: false, message: 'Invalid barcode format' });
            return;
        }
        const offUrl = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands,nutriments,serving_size,image_url,categories`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        let offRes: globalThis.Response;
        try {
            offRes = await fetch(offUrl, { signal: controller.signal as any });
        } finally {
            clearTimeout(timeout);
        }
        if (!offRes.ok) {
            res.status(502).json({ success: false, message: 'Open Food Facts API unavailable' });
            return;
        }
        const json: any = await offRes.json();
        if (json.status !== 1 || !json.product) {
            res.status(404).json({ success: false, message: 'Product not found in database' });
            return;
        }
        const p = json.product;
        const n = p.nutriments ?? {};
        const food = {
            barcode: code,
            name: p.product_name ?? 'Unknown Product',
            brand: p.brands ?? '',
            imageUrl: p.image_url ?? '',
            servingSize: p.serving_size ?? '100g',
            nutrients: {
                calories:      n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0,
                protein:       n.proteins_100g  ?? n.proteins  ?? 0,
                carbohydrates: n.carbohydrates_100g ?? n.carbohydrates ?? 0,
                fat:           n.fat_100g       ?? n.fat       ?? 0,
                fiber:         n.fiber_100g     ?? n.fiber     ?? 0,
                sugar:         n.sugars_100g    ?? n.sugars    ?? 0,
                sodium:        n.sodium_100g    ?? n.sodium    ?? 0,
            },
        };
        res.json({ success: true, data: food });
    } catch (err: any) {
        if (err.name === 'AbortError') {
            res.status(504).json({ success: false, message: 'Barcode lookup timed out' });
        } else {
            res.status(500).json({ success: false, message: err.message });
        }
    }
});

// ─── GAP 46: Restaurant / Indian Dish Nutrition Estimation ───────────────────
const DISH_DB: Record<string, { calories: number; protein: number; carbs: number; fat: number; fiber: number; serving: string }> = {
    // Rice dishes
    'plain rice':          { calories: 206, protein: 4.3, carbs: 44.5, fat: 0.4, fiber: 0.6, serving: '1 cup (185g)' },
    'biryani':             { calories: 320, protein: 9,   carbs: 47,   fat: 10,  fiber: 2.1, serving: '1 serving (250g)' },
    'jeera rice':          { calories: 215, protein: 4.5, carbs: 45,   fat: 1.5, fiber: 0.8, serving: '1 cup (185g)' },
    'fried rice':          { calories: 280, protein: 6,   carbs: 46,   fat: 7.5, fiber: 1.2, serving: '1 cup (195g)' },
    'curd rice':           { calories: 185, protein: 5,   carbs: 33,   fat: 3.5, fiber: 0.5, serving: '1 cup (200g)' },
    'khichdi':             { calories: 195, protein: 8,   carbs: 35,   fat: 3,   fiber: 3.5, serving: '1 bowl (200g)' },
    // Breads
    'roti':                { calories: 80,  protein: 3,   carbs: 15,   fat: 1.5, fiber: 1.8, serving: '1 roti (40g)' },
    'chapati':             { calories: 80,  protein: 3,   carbs: 15,   fat: 1.5, fiber: 1.8, serving: '1 chapati (40g)' },
    'paratha':             { calories: 185, protein: 4,   carbs: 24,   fat: 8,   fiber: 2,   serving: '1 paratha (60g)' },
    'aloo paratha':        { calories: 215, protein: 4.5, carbs: 30,   fat: 9,   fiber: 2.5, serving: '1 paratha (80g)' },
    'naan':                { calories: 170, protein: 5,   carbs: 30,   fat: 4,   fiber: 1.2, serving: '1 naan (90g)' },
    'puri':                { calories: 135, protein: 2.5, carbs: 17,   fat: 6.5, fiber: 1,   serving: '2 puris (50g)' },
    'dosa':                { calories: 168, protein: 3.8, carbs: 28,   fat: 4.5, fiber: 1.5, serving: '1 dosa (80g)' },
    'idli':                { calories: 39,  protein: 1.9, carbs: 7.9,  fat: 0.2, fiber: 0.5, serving: '1 idli (40g)' },
    'upma':                { calories: 170, protein: 4,   carbs: 26,   fat: 6,   fiber: 2,   serving: '1 bowl (150g)' },
    'poha':                { calories: 165, protein: 3,   carbs: 34,   fat: 2.5, fiber: 1.5, serving: '1 bowl (160g)' },
    // Dal / Lentils
    'dal':                 { calories: 130, protein: 9,   carbs: 20,   fat: 1.5, fiber: 6,   serving: '1 bowl (200ml)' },
    'dal makhani':         { calories: 195, protein: 9,   carbs: 23,   fat: 8,   fiber: 5,   serving: '1 bowl (200ml)' },
    'rajma':               { calories: 185, protein: 11,  carbs: 28,   fat: 3,   fiber: 7.5, serving: '1 bowl (200g)' },
    'chole':               { calories: 210, protein: 12,  carbs: 32,   fat: 5,   fiber: 8,   serving: '1 bowl (200g)' },
    'sambar':              { calories: 90,  protein: 4.5, carbs: 14,   fat: 1.5, fiber: 4,   serving: '1 bowl (200ml)' },
    // Paneer
    'paneer butter masala': { calories: 350, protein: 16, carbs: 15, fat: 26, fiber: 2.5, serving: '1 serving (200g)' },
    'palak paneer':        { calories: 280, protein: 15,  carbs: 12,   fat: 19,  fiber: 3,   serving: '1 serving (200g)' },
    'shahi paneer':        { calories: 370, protein: 15,  carbs: 16,   fat: 28,  fiber: 2,   serving: '1 serving (200g)' },
    'paneer tikka':        { calories: 265, protein: 18,  carbs: 8,    fat: 18,  fiber: 1.5, serving: '1 serving (150g)' },
    // Chicken
    'chicken curry':       { calories: 240, protein: 22,  carbs: 8,    fat: 13,  fiber: 1.5, serving: '1 serving (200g)' },
    'butter chicken':      { calories: 310, protein: 23,  carbs: 14,   fat: 18,  fiber: 1.5, serving: '1 serving (200g)' },
    'chicken tikka masala': { calories: 290, protein: 24, carbs: 12,   fat: 17,  fiber: 2,   serving: '1 serving (200g)' },
    'chicken biryani':     { calories: 350, protein: 22,  carbs: 47,   fat: 9,   fiber: 2,   serving: '1 serving (300g)' },
    'tandoori chicken':    { calories: 230, protein: 28,  carbs: 4,    fat: 11,  fiber: 0.5, serving: '2 pieces (180g)' },
    'chicken tikka':       { calories: 185, protein: 26,  carbs: 4,    fat: 7,   fiber: 0.5, serving: '4 pieces (150g)' },
    // Mutton
    'mutton curry':        { calories: 290, protein: 24,  carbs: 7,    fat: 18,  fiber: 1,   serving: '1 serving (200g)' },
    'mutton biryani':      { calories: 380, protein: 23,  carbs: 48,   fat: 12,  fiber: 2,   serving: '1 serving (300g)' },
    // Seafood
    'fish curry':          { calories: 210, protein: 20,  carbs: 6,    fat: 11,  fiber: 1,   serving: '1 serving (200g)' },
    // Vegetable dishes
    'aloo gobi':           { calories: 150, protein: 4,   carbs: 22,   fat: 5,   fiber: 4,   serving: '1 serving (200g)' },
    'baingan bharta':      { calories: 120, protein: 3,   carbs: 15,   fat: 5,   fiber: 5,   serving: '1 bowl (200g)' },
    'matar paneer':        { calories: 250, protein: 13,  carbs: 18,   fat: 14,  fiber: 4,   serving: '1 bowl (200g)' },
    'bhindi masala':       { calories: 95,  protein: 2.5, carbs: 12,   fat: 4,   fiber: 5,   serving: '1 bowl (150g)' },
    'mixed veg curry':     { calories: 130, protein: 4,   carbs: 18,   fat: 5,   fiber: 4.5, serving: '1 bowl (200g)' },
    // Snacks & Street food
    'samosa':              { calories: 130, protein: 2.5, carbs: 17,   fat: 6,   fiber: 1.5, serving: '1 piece (60g)' },
    'vada pav':            { calories: 290, protein: 6,   carbs: 42,   fat: 11,  fiber: 3,   serving: '1 piece (130g)' },
    'pav bhaji':           { calories: 380, protein: 9,   carbs: 54,   fat: 14,  fiber: 5,   serving: '1 plate (350g)' },
    'bhel puri':           { calories: 180, protein: 4,   carbs: 30,   fat: 5,   fiber: 3,   serving: '1 plate (150g)' },
    'pani puri':           { calories: 210, protein: 3,   carbs: 35,   fat: 6,   fiber: 2.5, serving: '6 pieces (150g)' },
    'chaat':               { calories: 200, protein: 5,   carbs: 33,   fat: 6,   fiber: 3.5, serving: '1 plate (150g)' },
    'masala dosa':         { calories: 210, protein: 5,   carbs: 35,   fat: 7,   fiber: 2.5, serving: '1 dosa (120g)' },
    'vada':                { calories: 145, protein: 5,   carbs: 17,   fat: 6.5, fiber: 3,   serving: '1 piece (60g)' },
    // Soups
    'tomato soup':         { calories: 85,  protein: 2,   carbs: 14,   fat: 2.5, fiber: 2,   serving: '1 bowl (250ml)' },
    'vegetable soup':      { calories: 70,  protein: 2.5, carbs: 12,   fat: 1.5, fiber: 3,   serving: '1 bowl (250ml)' },
    // Sweets
    'gulab jamun':         { calories: 150, protein: 2,   carbs: 25,   fat: 5,   fiber: 0.3, serving: '1 piece (40g)' },
    'halwa':               { calories: 200, protein: 3,   carbs: 30,   fat: 8,   fiber: 1,   serving: '1 serving (80g)' },
    'kheer':               { calories: 180, protein: 5,   carbs: 30,   fat: 5,   fiber: 0.5, serving: '1 bowl (150ml)' },
    // Raita & Sides
    'raita':               { calories: 60,  protein: 3,   carbs: 7,    fat: 2,   fiber: 0.5, serving: '1 bowl (150g)' },
    'curd':                { calories: 65,  protein: 4,   carbs: 5,    fat: 3,   fiber: 0,   serving: '1 bowl (150g)' },
    'pickle':              { calories: 30,  protein: 0.5, carbs: 4,    fat: 1,   fiber: 1,   serving: '1 tbsp (20g)' },
    // Beverages / Common
    'lassi':               { calories: 150, protein: 5,   carbs: 22,   fat: 4.5, fiber: 0,   serving: '1 glass (250ml)' },
    'chai':                { calories: 70,  protein: 1.5, carbs: 10,   fat: 2,   fiber: 0,   serving: '1 cup (150ml)' },
    'coffee':              { calories: 30,  protein: 0.5, carbs: 4,    fat: 1,   fiber: 0,   serving: '1 cup (150ml)' },
    // International / Common
    'pizza':               { calories: 285, protein: 12,  carbs: 36,   fat: 10,  fiber: 2.5, serving: '2 slices (175g)' },
    'burger':              { calories: 350, protein: 16,  carbs: 38,   fat: 14,  fiber: 2,   serving: '1 piece (200g)' },
    'pasta':               { calories: 320, protein: 11,  carbs: 56,   fat: 5,   fiber: 3,   serving: '1 plate (250g)' },
    'sandwich':            { calories: 280, protein: 12,  carbs: 35,   fat: 9,   fiber: 3,   serving: '1 piece (180g)' },
    'noodles':             { calories: 235, protein: 6,   carbs: 42,   fat: 5,   fiber: 2,   serving: '1 bowl (200g)' },
    'fried rice chinese':  { calories: 300, protein: 8,   carbs: 48,   fat: 9,   fiber: 2,   serving: '1 plate (220g)' },
    'egg curry':           { calories: 200, protein: 12,  carbs: 8,    fat: 14,  fiber: 1.5, serving: '1 serving (200g)' },
    'omelette':            { calories: 140, protein: 10,  carbs: 1,    fat: 10,  fiber: 0,   serving: '2-egg omelette (120g)' },
    'boiled eggs':         { calories: 78,  protein: 6,   carbs: 0.6,  fat: 5.3, fiber: 0,   serving: '1 egg (50g)' },
    'salad':               { calories: 65,  protein: 3,   carbs: 10,   fat: 2,   fiber: 4,   serving: '1 bowl (200g)' },
    'fruit salad':         { calories: 95,  protein: 1.5, carbs: 22,   fat: 0.5, fiber: 3.5, serving: '1 bowl (200g)' },
};

router.get('/foods/dish-estimate', authenticate, (req: Request, res: Response) => {
    try {
        const raw = String(req.query.name ?? '').trim().toLowerCase();
        if (!raw) {
            res.status(400).json({ success: false, message: 'name query param is required' });
            return;
        }
        // Exact match first
        if (DISH_DB[raw]) {
            res.json({ success: true, data: { name: raw, ...DISH_DB[raw], matchType: 'exact' } });
            return;
        }
        // Partial / fuzzy match
        const keys = Object.keys(DISH_DB);
        const partial = keys.find(k => k.includes(raw) || raw.includes(k));
        if (partial) {
            res.json({ success: true, data: { name: partial, ...DISH_DB[partial], matchType: 'partial' } });
            return;
        }
        // Suggest closest options
        const suggestions = keys
            .filter(k => k.split(' ').some(word => raw.split(' ').includes(word)))
            .slice(0, 5);
        res.status(404).json({
            success: false,
            message: 'Dish not found in database',
            suggestions,
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/foods/dish-list', authenticate, (_req: Request, res: Response) => {
    res.json({ success: true, data: Object.keys(DISH_DB).sort() });
});

// Food search is accessible to any authenticated user
router.get('/foods/search', authenticate, nutritionController.searchFood.bind(nutritionController));
router.get('/foods/:foodId', authenticate, nutritionController.getFoodById.bind(nutritionController));

// Macro calculator (no tenant context needed)
router.post('/calculate', authenticate, nutritionController.calculateMacros.bind(nutritionController));

// Nutrition logging requires tenant context
router.use(authenticate, tenantContext);

router.post('/log', nutritionController.logMeal.bind(nutritionController));
router.get('/logs', nutritionController.getNutritionLogs.bind(nutritionController));
router.delete('/logs/:logId', nutritionController.deleteNutritionLog.bind(nutritionController));
router.get('/summary', nutritionController.getNutritionSummary.bind(nutritionController));
router.get('/stats/weekly', nutritionController.getWeeklyNutritionStats.bind(nutritionController));

// Dashboard — used by frontend dietService.getActiveDietPlan + getCompliance
router.get('/dashboard', nutritionController.getDashboard.bind(nutritionController));

// Diet plan management (simple consumption log + plan CRUD)
router.post('/plan', nutritionController.createPlan.bind(nutritionController));
router.patch('/plan/:planId', nutritionController.updatePlan.bind(nutritionController));

// Simple flat consumption log (frontend dietService.logConsumption format)
router.post('/consumption', nutritionController.logConsumption.bind(nutritionController));

// Custom food creation
router.post('/foods', nutritionController.createCustomFood.bind(nutritionController));

// ─── Hydration Tracking ────────────────────────────────────────────────────────
router.post('/hydration/log', async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const memberId = (req as any).user?._id;
        const today = new Date().toISOString().slice(0, 10);
        const { glasses, increment } = req.body;

        let update: any;
        if (increment === true) {
            update = { $inc: { glasses: 1 } };
        } else if (typeof glasses === 'number') {
            update = { $set: { glasses: Math.max(0, Math.min(20, glasses)) } };
        } else {
            res.status(400).json({ success: false, message: 'Provide glasses (number) or increment: true' });
            return;
        }

        const log = await HydrationLogModel.findOneAndUpdate(
            { tenantId, memberId, date: today },
            { ...update, $setOnInsert: { tenantId, memberId, date: today } },
            { upsert: true, new: true }
        );

        const g = Math.min(log.glasses, 20);
        res.json({ success: true, data: { glasses: g, target: 8, percentage: Math.min(100, Math.round((g / 8) * 100)) } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/hydration/today', async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const memberId = (req as any).user?._id;
        const today = new Date().toISOString().slice(0, 10);

        const log = await HydrationLogModel.findOne({ tenantId, memberId, date: today });
        const g = log?.glasses ?? 0;

        res.json({ success: true, data: { glasses: g, target: 8, percentage: Math.min(100, Math.round((g / 8) * 100)) } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
