import { Router, Request, Response, NextFunction } from 'express';
import OpenAI from 'openai';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate, tenantContext);

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ─── Health Risk Assessment ──────────────────────────────────────────────────
// POST /health-risk/assess — compute risk scores from member health data
router.post('/assess', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      age, gender, weight, height, bmi,
      systolicBP, diastolicBP, bloodSugar, cholesterol,
      smokingStatus, alcoholConsumption, physicalActivityLevel,
      familyHistory = [], medicalConditions = [],
      waistCircumference, restingHeartRate,
    } = req.body;

    if (!age || !gender || !weight || !height) {
      return res.status(400).json({ success: false, message: 'age, gender, weight, height are required' });
    }

    const calcBMI = bmi ?? (weight / ((height / 100) ** 2));

    // ── Cardiovascular Risk (Framingham-style simplified) ────────────────────
    let cvdScore = 0;
    if (age > 45) cvdScore += 10;
    if (age > 55) cvdScore += 10;
    if (gender === 'male') cvdScore += 5;
    if (systolicBP > 140) cvdScore += 15;
    else if (systolicBP > 120) cvdScore += 8;
    if (cholesterol > 240) cvdScore += 15;
    else if (cholesterol > 200) cvdScore += 7;
    if (smokingStatus === 'current') cvdScore += 20;
    else if (smokingStatus === 'former') cvdScore += 5;
    if (familyHistory.includes('heart_disease')) cvdScore += 15;
    if (medicalConditions.includes('hypertension')) cvdScore += 10;
    cvdScore = Math.min(cvdScore, 100);

    // ── Diabetes Risk (ADA simplified) ───────────────────────────────────────
    let diabetesScore = 0;
    if (age > 45) diabetesScore += 15;
    if (calcBMI > 30) diabetesScore += 20;
    else if (calcBMI > 25) diabetesScore += 10;
    if (bloodSugar > 126) diabetesScore += 30;
    else if (bloodSugar > 100) diabetesScore += 15;
    if (familyHistory.includes('diabetes')) diabetesScore += 20;
    if (physicalActivityLevel === 'sedentary') diabetesScore += 10;
    if (waistCircumference) {
      if (gender === 'male' && waistCircumference > 102) diabetesScore += 10;
      if (gender === 'female' && waistCircumference > 88) diabetesScore += 10;
    }
    diabetesScore = Math.min(diabetesScore, 100);

    // ── Obesity Risk ──────────────────────────────────────────────────────────
    let obesityRisk: 'low' | 'moderate' | 'high' | 'very_high';
    if (calcBMI < 25) obesityRisk = 'low';
    else if (calcBMI < 30) obesityRisk = 'moderate';
    else if (calcBMI < 35) obesityRisk = 'high';
    else obesityRisk = 'very_high';

    // ── Metabolic Syndrome check ──────────────────────────────────────────────
    let metabolicCriteria = 0;
    if (waistCircumference) {
      if (gender === 'male' && waistCircumference > 102) metabolicCriteria++;
      if (gender === 'female' && waistCircumference > 88) metabolicCriteria++;
    }
    if (systolicBP > 130 || diastolicBP > 85) metabolicCriteria++;
    if (bloodSugar > 100) metabolicCriteria++;
    if (cholesterol > 200) metabolicCriteria++;
    if (calcBMI > 30) metabolicCriteria++;
    const hasMetabolicSyndrome = metabolicCriteria >= 3;

    // ── Fitness Age estimate ─────────────────────────────────────────────────
    let fitnessAgeDelta = 0;
    if (physicalActivityLevel === 'sedentary') fitnessAgeDelta += 5;
    else if (physicalActivityLevel === 'active') fitnessAgeDelta -= 3;
    else if (physicalActivityLevel === 'very_active') fitnessAgeDelta -= 7;
    if (smokingStatus === 'current') fitnessAgeDelta += 7;
    if (calcBMI > 30) fitnessAgeDelta += 3;
    if (restingHeartRate > 80) fitnessAgeDelta += 3;
    else if (restingHeartRate < 60) fitnessAgeDelta -= 3;
    const fitnessAge = Math.max(18, age + fitnessAgeDelta);

    // ── Recommendations ─────────────────────────────────────────────────────
    const recommendations: string[] = [];
    if (cvdScore > 30) recommendations.push('Consult a cardiologist for cardiovascular risk management');
    if (diabetesScore > 30) recommendations.push('Get HbA1c tested; consider dietary modification to reduce diabetes risk');
    if (calcBMI > 25) recommendations.push('Aim for 150–300 min/week moderate exercise and calorie-controlled diet');
    if (smokingStatus === 'current') recommendations.push('Quitting smoking reduces CVD risk by 50% within 1 year');
    if (physicalActivityLevel === 'sedentary') recommendations.push('Start with 30 min brisk walking daily to significantly lower health risks');
    if (systolicBP > 130) recommendations.push('Monitor blood pressure weekly; reduce sodium intake');
    if (!recommendations.length) recommendations.push('Continue your current healthy lifestyle!');

    const riskLevel = (score: number) => score < 20 ? 'Low' : score < 40 ? 'Moderate' : score < 60 ? 'High' : 'Very High';

    return res.json({
      success: true,
      data: {
        bmi: Math.round(calcBMI * 10) / 10,
        cardiovascular: { score: cvdScore, level: riskLevel(cvdScore) },
        diabetes: { score: diabetesScore, level: riskLevel(diabetesScore) },
        obesity: { bmi: Math.round(calcBMI * 10) / 10, risk: obesityRisk },
        metabolicSyndrome: { detected: hasMetabolicSyndrome, criteriaCount: metabolicCriteria },
        fitnessAge,
        chronologicalAge: age,
        recommendations,
      },
    });
  } catch (err) { next(err); }
});

// ─── AI Metabolic Profiling ──────────────────────────────────────────────────
// POST /health-risk/metabolic-profile — AI-generated personalised metabolic plan
router.post('/metabolic-profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      age, gender, weight, height, activityLevel, goal,
      dietPreference, medicalConditions = [], allergies = [],
      sleepHours, stressLevel, wakeupTime,
    } = req.body;

    if (!age || !gender || !weight || !height) {
      return res.status(400).json({ success: false, message: 'age, gender, weight, height are required' });
    }

    const bmi = (weight / ((height / 100) ** 2)).toFixed(1);
    const bmr = gender === 'male'
      ? 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age)
      : 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
    const actMult: Record<string, number> = {
      sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725, extra_active: 1.9,
    };
    const tdee = Math.round(bmr * (actMult[activityLevel] ?? 1.375));

    if (!openai) {
      // Deterministic fallback if no OpenAI key
      const calTarget = goal === 'weight_loss' ? tdee - 500 : goal === 'muscle_gain' ? tdee + 300 : tdee;
      const protein = Math.round(weight * 1.8);
      const fat = Math.round((calTarget * 0.25) / 9);
      const carbs = Math.round((calTarget - protein * 4 - fat * 9) / 4);
      return res.json({
        success: true,
        data: {
          metrics: { bmi, bmr: Math.round(bmr), tdee },
          profile: {
            metabolicType: 'Balanced Metabolizer',
            calorieSurplusDeficit: calTarget - tdee,
            dailyCalorieTarget: calTarget,
            macros: { protein, carbs, fat },
            mealFrequency: 4,
            mealTiming: ['7:30 AM – Breakfast', '11:00 AM – Mid-morning snack', '2:00 PM – Lunch', '7:00 PM – Dinner'],
            supplements: ['Multivitamin', 'Vitamin D3', 'Omega-3'],
            hydrationTarget: Math.round(weight * 35),
            keyInsights: [
              `Your BMR is ${Math.round(bmr)} kcal — you burn this at rest`,
              `Target ${calTarget} kcal/day for ${goal?.replace(/_/g, ' ') ?? 'your goal'}`,
              `Aim for ${protein}g protein daily to preserve muscle`,
            ],
            weeklyPlan: `Focus on progressive overload 3x/week combined with ${activityLevel?.replace(/_/g, ' ')} daily activity. Allow 48h recovery between resistance sessions.`,
          },
          aiGenerated: false,
        },
      });
    }

    const prompt = `You are a certified sports nutritionist and metabolic health coach.

Client Profile:
- Age: ${age}, Gender: ${gender}, Weight: ${weight}kg, Height: ${height}cm
- BMI: ${bmi}, BMR: ${Math.round(bmr)} kcal/day, TDEE: ${tdee} kcal/day
- Activity Level: ${activityLevel}
- Primary Goal: ${goal}
- Diet Preference: ${dietPreference || 'none specified'}
- Medical Conditions: ${medicalConditions.join(', ') || 'none'}
- Allergies: ${allergies.join(', ') || 'none'}
- Sleep: ${sleepHours || 7} hours/night
- Stress Level: ${stressLevel || 'moderate'}
- Wakeup Time: ${wakeupTime || '6:30 AM'}

Generate a detailed metabolic profile and personalised plan in JSON format with these EXACT keys:
{
  "metabolicType": "string (e.g. Fast Oxidizer, Slow Oxidizer, Mixed Metabolizer)",
  "dailyCalorieTarget": number,
  "calorieSurplusDeficit": number,
  "macros": { "protein": number_grams, "carbs": number_grams, "fat": number_grams },
  "mealFrequency": number,
  "mealTiming": ["array of meal times with descriptions"],
  "supplements": ["array of recommended supplements"],
  "hydrationTarget": number_ml,
  "keyInsights": ["3-5 personalized insights based on their profile"],
  "weeklyPlan": "2-3 sentence summary of the weekly fitness + nutrition plan"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.4,
    });

    const profile = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    return res.json({
      success: true,
      data: {
        metrics: { bmi, bmr: Math.round(bmr), tdee },
        profile: { ...profile, aiGenerated: true },
      },
    });
  } catch (err) { next(err); }
});

// GET /health-risk/member/:memberId — get saved assessments (stored in member health info)
router.get('/member/:memberId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { memberId } = req.params;
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const member = await Member.findOne({ _id: memberId, tenantId }).select('firstName lastName healthInfo personalInfo').lean();
    if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
    return res.json({ success: true, data: member });
  } catch (err) { next(err); }
});

export default router;
