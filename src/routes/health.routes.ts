import express, { Request, Response } from 'express';
import { syncHealthData, getHealthSummary } from '../controllers/health.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = express.Router();

router.use(authenticate);

router.post('/sync', requireAnyRole('member', 'trainer', 'staff', 'super_admin'), syncHealthData);
router.get('/summary', requireAnyRole('member', 'trainer', 'branch_manager', 'gym_owner', 'super_admin'), getHealthSummary);

// ─── Health Calculators — pure stateless math, no DB writes ──────────────────

function calcBMR(weight: number, heightCm: number, age: number, gender: string): number {
    return +(10 * weight + 6.25 * heightCm - 5 * age + (gender === 'male' ? 5 : -161)).toFixed(0);
}

const ACTIVITY_MULT: Record<string, number> = {
    sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55,
    very_active: 1.725, extra_active: 1.9,
};

router.post('/calculators/bmi', (req: Request, res: Response) => {
    const { weight, height } = req.body;
    if (!weight || !height) { res.status(400).json({ success: false, message: 'weight (kg) and height (cm) required' }); return; }
    const bmi = Number(weight) / Math.pow(Number(height) / 100, 2);
    let category = 'Obese';
    if (bmi < 18.5) category = 'Underweight';
    else if (bmi < 25) category = 'Normal weight';
    else if (bmi < 30) category = 'Overweight';
    res.json({ success: true, data: { bmi: +bmi.toFixed(2), category } });
});

router.post('/calculators/bmr', (req: Request, res: Response) => {
    const { weight, height, age, gender } = req.body;
    if (!weight || !height || !age || !gender) { res.status(400).json({ success: false, message: 'weight, height, age, gender required' }); return; }
    res.json({ success: true, data: { bmr: calcBMR(+weight, +height, +age, gender) } });
});

router.post('/calculators/tdee', (req: Request, res: Response) => {
    const { weight, height, age, gender, activityLevel } = req.body;
    if (!weight || !height || !age || !gender) { res.status(400).json({ success: false, message: 'weight, height, age, gender required' }); return; }
    const bmr = calcBMR(+weight, +height, +age, gender);
    const mult = ACTIVITY_MULT[activityLevel] ?? 1.55;
    res.json({ success: true, data: { bmr, tdee: +(bmr * mult).toFixed(0), activityMultiplier: mult } });
});

router.post('/calculators/body-fat', (req: Request, res: Response) => {
    const { gender, waist, neck, hip, height } = req.body;
    if (!gender || !waist || !neck || !height) { res.status(400).json({ success: false, message: 'gender, waist, neck, height (cm) required' }); return; }
    let bf: number;
    if (gender === 'male') {
        bf = 495 / (1.0324 - 0.19077 * Math.log10(+waist - +neck) + 0.15456 * Math.log10(+height)) - 450;
    } else {
        if (!hip) { res.status(400).json({ success: false, message: 'hip measurement required for female' }); return; }
        bf = 495 / (1.29579 - 0.35004 * Math.log10(+waist + +hip - +neck) + 0.22100 * Math.log10(+height)) - 450;
    }
    res.json({ success: true, data: { bodyFatPercent: +bf.toFixed(1), leanMassPercent: +(100 - bf).toFixed(1) } });
});

router.post('/calculators/ideal-weight', (req: Request, res: Response) => {
    const { height, gender } = req.body;
    if (!height || !gender) { res.status(400).json({ success: false, message: 'height (cm) and gender required' }); return; }
    const extraInches = Math.max(0, +height / 2.54 - 60);
    const ideal = (gender === 'male' ? 50 : 45.5) + extraInches * 2.3;
    res.json({ success: true, data: { idealWeightKg: +ideal.toFixed(1), rangeMin: +(ideal * 0.95).toFixed(1), rangeMax: +(ideal * 1.05).toFixed(1) } });
});

router.post('/calculators/one-rep-max', (req: Request, res: Response) => {
    const { weight, reps } = req.body;
    if (!weight || !reps) { res.status(400).json({ success: false, message: 'weight (kg) and reps required' }); return; }
    const orm = +weight * (1 + +reps / 30);
    res.json({ success: true, data: { oneRepMax: +orm.toFixed(1), percentages: {
        '100%': +orm.toFixed(1), '95%': +(orm * 0.95).toFixed(1), '90%': +(orm * 0.90).toFixed(1),
        '85%': +(orm * 0.85).toFixed(1), '80%': +(orm * 0.80).toFixed(1),
        '75%': +(orm * 0.75).toFixed(1), '70%': +(orm * 0.70).toFixed(1),
    } } });
});

router.post('/calculators/water-intake', (req: Request, res: Response) => {
    const { weight, activityLevel } = req.body;
    if (!weight) { res.status(400).json({ success: false, message: 'weight (kg) required' }); return; }
    const bonus: Record<string, number> = { sedentary: 0, lightly_active: 0.35, moderately_active: 0.59, very_active: 0.88, extra_active: 1.18 };
    const total = +weight * 0.033 + (bonus[activityLevel] ?? 0);
    res.json({ success: true, data: { litersPerDay: +total.toFixed(2), glassesPerDay: Math.ceil(total / 0.25) } });
});

router.post('/calculators/calories', (req: Request, res: Response) => {
    const { weight, height, age, gender, activityLevel, goal } = req.body;
    if (!weight || !height || !age || !gender) { res.status(400).json({ success: false, message: 'weight, height, age, gender required' }); return; }
    const bmr = calcBMR(+weight, +height, +age, gender);
    const tdee = +(bmr * (ACTIVITY_MULT[activityLevel] ?? 1.55)).toFixed(0);
    const adj: Record<string, number> = { lose: -500, maintain: 0, gain: 300, aggressive_lose: -750, aggressive_gain: 500 };
    const target = tdee + (adj[goal] ?? 0);
    res.json({ success: true, data: { maintenance: tdee, target: +target.toFixed(0), weeklyChangeKg: +(((adj[goal] ?? 0) * 7) / 7700).toFixed(2) } });
});

router.post('/calculators/protein', (req: Request, res: Response) => {
    const { weight, goal, activityLevel } = req.body;
    if (!weight) { res.status(400).json({ success: false, message: 'weight (kg) required' }); return; }
    const base: Record<string, number> = { sedentary: 0.8, lightly_active: 1.0, moderately_active: 1.2, very_active: 1.5, extra_active: 1.8 };
    const goalBonus: Record<string, number> = { lose: 0.2, maintain: 0, gain: 0.3, athletic: 0.5 };
    const gPerKg = (base[activityLevel] ?? 1.2) + (goalBonus[goal] ?? 0);
    res.json({ success: true, data: { gramsPerDay: +(+weight * gPerKg).toFixed(0), gramsPerKg: +gPerKg.toFixed(2) } });
});

router.post('/calculators/macros', (req: Request, res: Response) => {
    const { calories, goal } = req.body;
    if (!calories) { res.status(400).json({ success: false, message: 'calories required' }); return; }
    const splits: Record<string, [number, number, number]> = {
        lose: [0.35, 0.35, 0.30], maintain: [0.25, 0.50, 0.25], gain: [0.25, 0.55, 0.20],
        keto: [0.25, 0.05, 0.70], athletic: [0.30, 0.50, 0.20],
    };
    const [p, c, f] = splits[goal] ?? splits.maintain;
    const kcal = +calories;
    res.json({ success: true, data: {
        protein: { grams: +((kcal * p) / 4).toFixed(0), percent: Math.round(p * 100) },
        carbs:   { grams: +((kcal * c) / 4).toFixed(0), percent: Math.round(c * 100) },
        fat:     { grams: +((kcal * f) / 9).toFixed(0), percent: Math.round(f * 100) },
    } });
});

export default router;
