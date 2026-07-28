import { Router, Request, Response, NextFunction } from 'express';
import OpenAI from 'openai';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { config } from '../config/config';
import RestaurantChain from '../models/RestaurantChain.model';
import OccasionGuide from '../models/OccasionGuide.model';
import NutritionLog from '../models/NutritionLog.model';

const router = Router();

// ─── AI Client (OpenRouter or OpenAI) ────────────────────────────────────────
const useOpenRouter = config.ai.provider === 'openrouter';
const aiApiKey = useOpenRouter ? config.openrouter.apiKey : config.openai.apiKey;
const activeModel = useOpenRouter ? config.openrouter.model : config.openai.model;

const openai = aiApiKey
    ? new OpenAI({
          apiKey: aiApiKey,
          ...(useOpenRouter
              ? {
                    baseURL: config.openrouter.baseUrl,
                    defaultHeaders: {
                        'HTTP-Referer': config.frontendUrl,
                        'X-Title': 'GymManagement AI',
                    },
                }
              : {}),
      })
    : null;

// ─── All routes require authentication ────────────────────────────────────────
router.use(authenticate);

// ─── RESTAURANTS ─────────────────────────────────────────────────────────────

// GET /eating-out/restaurants — list restaurant chains (global, no tenant filter)
router.get('/restaurants', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { q, cuisine } = req.query as Record<string, string>;
        const filter: Record<string, any> = {};
        if (q) filter.name = { $regex: q, $options: 'i' };
        if (cuisine && cuisine !== 'All') filter.cuisine = { $regex: cuisine, $options: 'i' };

        const restaurants = await RestaurantChain.find(filter)
            .select('name cuisine logoEmoji isIndianChain healthyOptions avoidItems generalTip')
            .sort({ name: 1 })
            .lean();

        res.json({ success: true, data: restaurants, total: restaurants.length });
    } catch (err) {
        next(err);
    }
});

// GET /eating-out/restaurants/:id — full restaurant with menu
router.get('/restaurants/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const restaurant = await RestaurantChain.findById(req.params.id).lean();
        if (!restaurant) {
            res.status(404).json({ success: false, message: 'Restaurant not found' });
            return;
        }
        res.json({ success: true, data: restaurant });
    } catch (err) {
        next(err);
    }
});

// POST /eating-out/restaurants — add restaurant chain (super_admin, gym_owner)
router.post(
    '/restaurants',
    requireAnyRole('super_admin', 'gym_owner'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const restaurant = await RestaurantChain.create(req.body);
            res.status(201).json({ success: true, data: restaurant });
        } catch (err) {
            next(err);
        }
    }
);

// ─── OCCASIONS ────────────────────────────────────────────────────────────────

// GET /eating-out/occasions — list all occasion guides
router.get('/occasions', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { category } = req.query as Record<string, string>;
        const filter: Record<string, any> = {};
        if (category && category !== 'All') filter.category = category;

        const occasions = await OccasionGuide.find(filter).sort({ name: 1 }).lean();
        res.json({ success: true, data: occasions, total: occasions.length });
    } catch (err) {
        next(err);
    }
});

// GET /eating-out/occasions/:id — get single occasion guide
router.get('/occasions/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const occasion = await OccasionGuide.findById(req.params.id).lean();
        if (!occasion) {
            res.status(404).json({ success: false, message: 'Occasion guide not found' });
            return;
        }
        res.json({ success: true, data: occasion });
    } catch (err) {
        next(err);
    }
});

// POST /eating-out/occasions — add occasion guide (super_admin, gym_owner)
router.post(
    '/occasions',
    requireAnyRole('super_admin', 'gym_owner'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const occasion = await OccasionGuide.create(req.body);
            res.status(201).json({ success: true, data: occasion });
        } catch (err) {
            next(err);
        }
    }
);

// ─── AI ADVISOR ──────────────────────────────────────────────────────────────

// POST /eating-out/ai-advisor — AI-powered eating-out recommendations
router.post('/ai-advisor', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            restaurantName,
            occasionName,
            city,
            memberMacros,
            memberConditions = [],
        } = req.body as {
            restaurantName?: string;
            occasionName?: string;
            city?: string;
            memberMacros?: { calories: number; protein: number; carbs: number; fat: number };
            memberConditions?: string[];
        };

        if (!restaurantName && !occasionName) {
            res.status(400).json({ success: false, message: 'Provide restaurantName or occasionName' });
            return;
        }

        // Look up restaurant from DB for extra context
        let dbRestaurant: any = null;
        if (restaurantName) {
            dbRestaurant = await RestaurantChain.findOne({
                name: { $regex: restaurantName, $options: 'i' },
            }).lean();
        }

        const macroText = memberMacros
            ? `Daily targets: ${memberMacros.calories} kcal, ${memberMacros.protein}g protein, ${memberMacros.carbs}g carbs, ${memberMacros.fat}g fat.`
            : 'Daily targets: 2000 kcal, 150g protein, 200g carbs, 65g fat (defaults).';

        const conditionText =
            memberConditions.length > 0
                ? `Health conditions: ${memberConditions.join(', ')}.`
                : 'No known health conditions.';

        const contextText = restaurantName
            ? `They are eating at ${restaurantName}${city ? ' in ' + city : ''}.${dbRestaurant ? ` Known menu items include: ${dbRestaurant.menuItems.slice(0, 8).map((m: any) => m.name + ' (' + m.calories + ' kcal, ' + m.protein + 'g protein)').join(', ')}.` : ''}`
            : `They are attending ${occasionName}.`;

        const prompt = `You are a certified sports nutritionist helping gym members make smart food choices.

Member profile: ${macroText} ${conditionText}

Context: ${contextText}

Suggest exactly 3 meal/food choices that fit their nutritional plan. Keep each choice under 600 kcal and above 25g protein where possible. For each suggestion return:
- name: the dish or item name
- estimatedCalories: number
- estimatedProtein: number (grams)
- estimatedCarbs: number (grams)
- estimatedFat: number (grams)
- whyGoodChoice: one sentence explaining why it fits their plan

Return ONLY a valid JSON array with exactly 3 objects, no extra text.`;

        let aiRecommendations: any[] = [];
        let aiGenerated = false;

        if (openai) {
            try {
                const completion = await openai.chat.completions.create({
                    model: activeModel,
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a sports nutritionist. Always respond with valid JSON only.',
                        },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.4,
                    max_tokens: 800,
                });

                const raw = completion.choices[0]?.message?.content ?? '[]';
                // Strip markdown code fences if present
                const cleaned = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
                aiRecommendations = JSON.parse(cleaned);
                aiGenerated = true;
            } catch (aiErr) {
                console.error('[eating-out/ai-advisor] AI call failed:', aiErr);
                // Fall through to fallback
            }
        }

        // Fallback if AI unavailable
        if (!aiRecommendations.length) {
            aiRecommendations = [
                {
                    name: 'Grilled Chicken Salad',
                    estimatedCalories: 380,
                    estimatedProtein: 35,
                    estimatedCarbs: 20,
                    estimatedFat: 16,
                    whyGoodChoice: 'High protein, low carb — fits most fitness goals.',
                },
                {
                    name: 'Dal + 2 Roti',
                    estimatedCalories: 420,
                    estimatedProtein: 18,
                    estimatedCarbs: 62,
                    estimatedFat: 10,
                    whyGoodChoice: 'Balanced plant protein and complex carbs for energy.',
                },
                {
                    name: 'Paneer Tikka (6 pcs)',
                    estimatedCalories: 320,
                    estimatedProtein: 22,
                    estimatedCarbs: 12,
                    estimatedFat: 20,
                    whyGoodChoice: 'Good protein source, grilled not fried.',
                },
            ];
        }

        res.json({
            success: true,
            data: {
                recommendations: aiRecommendations,
                aiGenerated,
                restaurantHealthyOptions: dbRestaurant?.healthyOptions ?? [],
                restaurantAvoidItems: dbRestaurant?.avoidItems ?? [],
                restaurantTip: dbRestaurant?.generalTip ?? null,
            },
        });
    } catch (err) {
        next(err);
    }
});

// ─── QUICK LOG ────────────────────────────────────────────────────────────────

// POST /eating-out/quick-log — log a restaurant meal to NutritionLog
router.post('/quick-log', tenantContext, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const {
            memberId,
            restaurantName,
            itemName,
            calories = 0,
            protein = 0,
            carbs = 0,
            fat = 0,
            servingSize = '1 serving',
        } = req.body;

        if (!memberId || !itemName) {
            res.status(400).json({ success: false, message: 'memberId and itemName are required' });
            return;
        }

        const tenantId = (req as any).tenantId || req.user?.tenantId?.toString();
        const userId = req.user?._id;

        if (!tenantId) {
            res.status(400).json({ success: false, message: 'Tenant context required' });
            return;
        }

        const foodName = restaurantName ? `${restaurantName} — ${itemName}` : itemName;

        const log = await NutritionLog.create({
            tenantId,
            memberId,
            userId,
            date: new Date(),
            mealType: 'snack',
            foods: [
                {
                    foodName,
                    quantity: 1,
                    unit: servingSize,
                    calories: Number(calories),
                    protein: Number(protein),
                    carbs: Number(carbs),
                    fats: Number(fat),
                    fiber: 0,
                },
            ],
            totalCalories: Number(calories),
            totalProtein: Number(protein),
            totalCarbs: Number(carbs),
            totalFats: Number(fat),
            totalFiber: 0,
            notes: `Logged from Eating Out advisor${restaurantName ? ' — ' + restaurantName : ''}`,
        });

        res.status(201).json({
            success: true,
            message: `${itemName} logged to today's nutrition`,
            data: log,
        });
    } catch (err) {
        next(err);
    }
});

// ─── SEED DATA ────────────────────────────────────────────────────────────────

// POST /eating-out/seed-restaurants — seed initial restaurant & occasion data (super_admin only)
router.post(
    '/seed-restaurants',
    requireAnyRole('super_admin'),
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Clear existing seed data
            await RestaurantChain.deleteMany({});
            await OccasionGuide.deleteMany({});

            // ── Restaurants ──────────────────────────────────────────────────────
            const restaurants = [
                {
                    name: "McDonald's India",
                    cuisine: 'Fast Food',
                    logoEmoji: '🍔',
                    isIndianChain: false,
                    menuItems: [
                        { name: 'McVeggie', calories: 350, protein: 8, carbs: 44, fat: 14, servingSize: '1 burger', isHealthy: false, tags: ['veg'] },
                        { name: 'McAloo Tikki', calories: 317, protein: 6, carbs: 43, fat: 14, servingSize: '1 burger', isHealthy: false, tags: ['veg', 'indian'] },
                        { name: 'Veg McMuffin', calories: 230, protein: 9, carbs: 30, fat: 7, servingSize: '1 muffin', isHealthy: true, tags: ['veg', 'breakfast'] },
                        { name: 'Fillet-O-Fish', calories: 379, protein: 15, carbs: 45, fat: 15, servingSize: '1 burger', isHealthy: false, tags: ['fish'] },
                        { name: 'Large Fries', calories: 444, protein: 5, carbs: 60, fat: 21, servingSize: '1 large', isHealthy: false, tags: ['veg', 'side'] },
                    ],
                    healthyOptions: ['Veg McMuffin', 'McAloo Tikki (no sauce)'],
                    avoidItems: ['McFlurry', 'Chocolate Shake', 'Large Fries'],
                    generalTip: 'Ask for no sauce, skip the fries, and choose water over cold drinks.',
                },
                {
                    name: 'Subway India',
                    cuisine: 'Fast Food',
                    logoEmoji: '🥖',
                    isIndianChain: false,
                    menuItems: [
                        { name: '6" Veggie Delight', calories: 230, protein: 9, carbs: 44, fat: 3, servingSize: '6 inch sub', isHealthy: true, tags: ['veg'] },
                        { name: '6" Chicken Teriyaki', calories: 270, protein: 18, carbs: 42, fat: 4, servingSize: '6 inch sub', isHealthy: true, tags: ['chicken'] },
                        { name: '6" Roasted Chicken', calories: 245, protein: 20, carbs: 38, fat: 4, servingSize: '6 inch sub', isHealthy: true, tags: ['chicken'] },
                    ],
                    healthyOptions: ['6" Roasted Chicken with extra veggies, no mayo', '6" Veggie Delight on wheat'],
                    avoidItems: ['Footlong with extra cheese and sauces', 'Double Meat sub with Ranch'],
                    generalTip: 'Choose wheat bread, load up on veggies, skip mayo and creamy sauces.',
                },
                {
                    name: "Domino's India",
                    cuisine: 'Fast Food',
                    logoEmoji: '🍕',
                    isIndianChain: false,
                    menuItems: [
                        { name: 'Medium Veggie Extravaganza slice', calories: 180, protein: 7, carbs: 26, fat: 5, servingSize: '1 slice', isHealthy: false, tags: ['veg'] },
                        { name: 'Thin Crust slice (any)', calories: 140, protein: 6, carbs: 20, fat: 4, servingSize: '1 slice', isHealthy: true, tags: ['veg'] },
                        { name: 'Garden Salad', calories: 80, protein: 3, carbs: 12, fat: 2, servingSize: '1 bowl', isHealthy: true, tags: ['veg', 'salad'] },
                    ],
                    healthyOptions: ['1-2 slices thin crust + garden salad', 'Wheat thin crust pizza'],
                    avoidItems: ['Cheese Burst crust', 'Choco Lava Cake', 'Garlic breadsticks combo'],
                    generalTip: 'Thin crust saves ~40 cal per slice. Stop at 2 slices and add a salad.',
                },
                {
                    name: "Haldiram's",
                    cuisine: 'Indian',
                    logoEmoji: '🍛',
                    isIndianChain: true,
                    menuItems: [
                        { name: 'Dal Makhani', calories: 250, protein: 12, carbs: 32, fat: 8, servingSize: '1 serving (200g)', isHealthy: true, tags: ['veg', 'lentils'] },
                        { name: 'Aloo Paratha', calories: 350, protein: 8, carbs: 52, fat: 12, servingSize: '2 pieces', isHealthy: false, tags: ['veg', 'indian'] },
                        { name: 'Pav Bhaji', calories: 420, protein: 10, carbs: 65, fat: 12, servingSize: '1 plate', isHealthy: false, tags: ['veg', 'street food'] },
                        { name: 'Paneer Butter Masala', calories: 380, protein: 18, carbs: 20, fat: 26, servingSize: '1 serving', isHealthy: false, tags: ['veg', 'paneer'] },
                    ],
                    healthyOptions: ['Dal Makhani (small portion)', 'Tandoori Roti', 'Mixed Salad'],
                    avoidItems: ['Kaju Katli', 'Sweets section', 'Deep-fried snacks'],
                    generalTip: 'Opt for dals and sabzi over fried snacks. Skip the dessert section entirely.',
                },
                {
                    name: 'KFC India',
                    cuisine: 'Fast Food',
                    logoEmoji: '🍗',
                    isIndianChain: false,
                    menuItems: [
                        { name: 'Popcorn Chicken (small)', calories: 260, protein: 14, carbs: 21, fat: 12, servingSize: '1 small box', isHealthy: false, tags: ['chicken'] },
                        { name: 'Chicken Zinger', calories: 490, protein: 28, carbs: 44, fat: 22, servingSize: '1 burger', isHealthy: false, tags: ['chicken'] },
                        { name: 'Rice Bowl (Grilled)', calories: 340, protein: 24, carbs: 38, fat: 8, servingSize: '1 bowl', isHealthy: true, tags: ['chicken'] },
                    ],
                    healthyOptions: ['Grilled Rice Bowl', 'Corn on the Cob'],
                    avoidItems: ['Mega Bucket combos', 'Zingers with fries', 'Chocolate Mousse'],
                    generalTip: 'Grilled is always better than crispy/fried. Avoid combo meals with fries.',
                },
                {
                    name: 'Starbucks India',
                    cuisine: 'Coffee',
                    logoEmoji: '☕',
                    isIndianChain: false,
                    menuItems: [
                        { name: 'Americano', calories: 15, protein: 1, carbs: 3, fat: 0, servingSize: '1 tall', isHealthy: true, tags: ['coffee', 'low-cal'] },
                        { name: 'Cappuccino (oat milk)', calories: 120, protein: 5, carbs: 18, fat: 3, servingSize: '1 tall', isHealthy: true, tags: ['coffee'] },
                        { name: 'Egg White & Roasted Red Pepper Egg Bites', calories: 170, protein: 13, carbs: 9, fat: 9, servingSize: '2 pieces', isHealthy: true, tags: ['protein', 'snack'] },
                        { name: 'Caramel Frappuccino', calories: 380, protein: 5, carbs: 62, fat: 13, servingSize: '1 grande', isHealthy: false, tags: ['cold drink', 'high sugar'] },
                    ],
                    healthyOptions: ['Americano', 'Cappuccino with oat milk', 'Egg Bites (high protein)'],
                    avoidItems: ['Caramel Frappuccino', 'Java Chip Frappuccino', 'Cakes and pastries'],
                    generalTip: 'Stick to black or oat milk coffees. Frappuccinos are desserts, not drinks.',
                },
                {
                    name: 'Barbeque Nation',
                    cuisine: 'Indian',
                    logoEmoji: '🥩',
                    isIndianChain: true,
                    menuItems: [
                        { name: 'Grilled Chicken Starters', calories: 220, protein: 28, carbs: 5, fat: 10, servingSize: '4-5 pieces', isHealthy: true, tags: ['chicken', 'grilled'] },
                        { name: 'Tandoori Prawns', calories: 180, protein: 25, carbs: 4, fat: 7, servingSize: '4-5 pieces', isHealthy: true, tags: ['seafood', 'grilled'] },
                        { name: 'Fried Starters (avg)', calories: 400, protein: 15, carbs: 35, fat: 22, servingSize: '4-5 pieces', isHealthy: false, tags: ['fried'] },
                        { name: 'Dessert Buffet (avg serving)', calories: 350, protein: 4, carbs: 58, fat: 14, servingSize: '1 plate', isHealthy: false, tags: ['dessert'] },
                    ],
                    healthyOptions: ['Grilled chicken/fish/prawn starters', 'Tandoori items', 'Raita'],
                    avoidItems: ['Fried starters', 'Unlimited dessert section', 'Creamy curries in excess'],
                    generalTip: 'Prioritize grilled starters over fried. Skip the unlimited dessert section.',
                },
            ];

            await RestaurantChain.insertMany(restaurants);

            // ── Occasion Guides ──────────────────────────────────────────────────
            const occasions = [
                {
                    name: 'Diwali',
                    category: 'festival',
                    emoji: '🪔',
                    description: 'Festival of lights and sweets — navigate the festive spread smartly.',
                    tips: [
                        'Eat a protein-rich meal before the party to reduce sweet cravings',
                        'Drink water between sweets to pace yourself',
                        'Choose dry fruit-based sweets over deep-fried ones',
                        'Walk around and socialize between eating sessions',
                    ],
                    safeFoods: [
                        'Dry fruits in moderation (cashews, almonds)',
                        'Roasted makhana (fox nuts)',
                        'Single mithai (1-2 pieces max)',
                        'Peanut chikki (small piece)',
                    ],
                    avoidFoods: [
                        'Besan ladoo in excess',
                        'Deep-fried namkeen (chakli, sev)',
                        'Khoya-based sweets (kalakand, barfi)',
                        'Sugary cold drinks and mocktails',
                    ],
                    moderation: 'Enjoy 1-2 sweets max. Skip the fried starters. Have a protein shake before the party.',
                },
                {
                    name: 'Eid',
                    category: 'festival',
                    emoji: '🌙',
                    description: 'Eid celebrations with rich biryanis and sheer khurma — make conscious choices.',
                    tips: [
                        'Eat biryani in a small portion as the main carb for the meal',
                        'Prioritize seekh kebab and grilled items from the starters',
                        'Limit sheer khurma to one small cup',
                        'Stay hydrated — the dishes are rich and can cause bloating',
                    ],
                    safeFoods: [
                        'Nihari with roti (1 roti, moderate portion)',
                        'Seekh kebab (grilled)',
                        'Boti kebab (grilled)',
                        'Raita and salad',
                    ],
                    avoidFoods: [
                        'Biryani overload (multiple servings)',
                        'Sheer khurma in excess',
                        'Meetha (gulab jamun, zarda)',
                        'Deep-fried samosas and pakodas',
                    ],
                    moderation: 'One plate of biryani + 2 seekh kebabs is a complete balanced meal. Skip the dessert table.',
                },
                {
                    name: 'Wedding',
                    category: 'social',
                    emoji: '💒',
                    description: 'Indian weddings mean multi-day buffets — plan your approach.',
                    tips: [
                        'Scout the buffet fully before loading your plate',
                        'Eat salad and dal first, then go back for proteins',
                        'Avoid the bread section if you already had rice',
                        'Limit alcohol — each drink adds 100-200 empty calories',
                    ],
                    safeFoods: [
                        'Dal (any type)',
                        'Grilled paneer tikka',
                        'Garden salads and raita',
                        'Roti (1-2 max)',
                        'Roasted/tandoori starters',
                    ],
                    avoidFoods: [
                        'Dessert table (gulab jamun, rasmalai, halwa)',
                        'Deep-fried pakodas and samosas',
                        'Creamy gravies (butter chicken, paneer makhani)',
                        'Puri and poori combos',
                    ],
                    moderation: 'Have one sweet from the dessert table, not the whole selection. Fill 50% of the plate with dal + salad.',
                },
                {
                    name: 'Office Lunch',
                    category: 'work',
                    emoji: '🏢',
                    description: 'Weekday canteen or nearby restaurant — keep energy steady for the afternoon.',
                    tips: [
                        'Avoid heavy meals that cause afternoon energy crash',
                        'Choose protein + complex carb combos for sustained focus',
                        'Keep portion sizes 20% smaller than dinner',
                        'Avoid fried food before important meetings',
                    ],
                    safeFoods: [
                        'Dal-rice combo (small portion)',
                        'Idli-sambar (3-4 idlis)',
                        'Brown bread sandwich with egg/paneer',
                        'Khichdi',
                        'Curd rice',
                    ],
                    avoidFoods: [
                        'Biryani + cold drink combo',
                        'Heavy thali with puri',
                        'Pizza + garlic bread combos',
                        'Fried rice + manchurian combos',
                    ],
                    moderation: 'Lunch should be your second-largest meal. Stop at 80% full to avoid post-lunch slump.',
                },
                {
                    name: 'Travel - North India',
                    category: 'travel',
                    emoji: '🚂',
                    description: 'Dhaba culture and street food across UP, Delhi, Rajasthan — navigate wisely.',
                    tips: [
                        'Stick to dal, roti, and sabzi at dhabas — avoid the paneer curries',
                        'Carry protein bars or roasted peanuts for travel snacks',
                        'Drink bottled water, avoid roadside juices',
                        'Tandoori items are safer than curries from hygiene perspective',
                    ],
                    safeFoods: [
                        'Dal tadka + 2 roti',
                        'Tandoori roti with sabzi',
                        'Chole with 1 roti (skip bhature)',
                        'Boiled corn',
                        'Lassi (unsweetened)',
                    ],
                    avoidFoods: [
                        'Street chaat with raw chutney (hygiene risk)',
                        'Kachori and samosa in excess',
                        'Creamy paneer dishes (high fat)',
                        'Hotel buffet desserts',
                    ],
                    moderation: 'One special local dish per day is fine. Make the other meals clean and simple.',
                },
                {
                    name: 'Travel - South India',
                    category: 'travel',
                    emoji: '🌴',
                    description: 'Idli, dosa, and rice culture — actually gym-friendly if chosen right.',
                    tips: [
                        'Idli-sambar is one of the cleanest meals you can eat while traveling',
                        'Coconut chutney is fine in moderation — it has healthy fats',
                        'Avoid kombdi vade and heavy meat gravies at night',
                        'Filter coffee with less sugar is a great low-cal option',
                    ],
                    safeFoods: [
                        'Idli-sambar (4-5 idlis)',
                        'Plain dosa with sambar',
                        'Rasam + rice (small portion)',
                        'Appam with vegetable stew',
                        'Grilled fish (coastal areas)',
                    ],
                    avoidFoods: [
                        'Ghee pongal in excess',
                        'Masala dosa loaded with butter',
                        'Payasam and sweet pongal',
                        'Vada in excess (fried)',
                    ],
                    moderation: 'South Indian food is inherently lighter. 3 idlis + sambar is a complete balanced meal.',
                },
            ];

            await OccasionGuide.insertMany(occasions);

            res.json({
                success: true,
                message: `Seeded ${restaurants.length} restaurants and ${occasions.length} occasion guides`,
                data: {
                    restaurantsSeeded: restaurants.length,
                    occasionsSeeded: occasions.length,
                },
            });
        } catch (err) {
            next(err);
        }
    }
);

export default router;
