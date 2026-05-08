import OpenAI from 'openai';
import { config } from '../config/config';
import Member from '../models/Member.model';
import Exercise from '../models/Exercise.model';
import Attendance from '../models/Attendance.model';
import Payment from '../models/Payment.model';

export class AIService {
    private openai: OpenAI | null = null;
    private initialized = false;

    private get activeModel(): string {
        if (config.ai.provider === 'openrouter') return config.openrouter.model;
        return config.openai.model;
    }

    private ensureInitialized() {
        if (this.initialized) return;

        const useOpenRouter = config.ai.provider === 'openrouter';
        const apiKey = useOpenRouter ? config.openrouter.apiKey : config.openai.apiKey;

        if (!apiKey) {
            console.warn('⚠️ AI API key missing — AI features disabled. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env');
            this.initialized = true;
            return;
        }

        try {
            this.openai = new OpenAI({
                apiKey,
                ...(useOpenRouter ? {
                    baseURL: config.openrouter.baseUrl,
                    defaultHeaders: {
                        'HTTP-Referer': config.frontendUrl,
                        'X-Title': 'GymManagement AI',
                    },
                } : {}),
            });
            this.initialized = true;
            console.log(`✅ AI initialized via ${useOpenRouter ? 'OpenRouter' : 'OpenAI'} — model: ${this.activeModel}`);
        } catch (error) {
            console.error('❌ Failed to initialize AI client:', error);
        }
    }

    // Generate workout plan using AI
    async generateWorkoutPlan(
        memberId: string,
        goal: string,
        experience: 'beginner' | 'intermediate' | 'advanced',
        daysPerWeek: number,
        equipmentAvailable: string[],
        tenantId: string
    ): Promise<any> {
        this.ensureInitialized();
        if (!this.openai) {
            throw new Error('AI service not configured. Set OPENROUTER_API_KEY in .env');
        }

        const member = await Member.findById(memberId);

        if (!member) {
            throw new Error('Member not found');
        }

        const latestMeasurement = member.measurements[member.measurements.length - 1];
        const healthInfo = member.healthInfo;

        const prompt = `Create a ${daysPerWeek}-day per week workout plan for a ${experience} level individual with the following details:
    
Goal: ${goal}
Age: ${member.personalInfo?.dateOfBirth ? Math.floor((Date.now() - member.personalInfo.dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 'Unknown'}
Gender: ${member.personalInfo?.gender || 'Unknown'}
Weight: ${latestMeasurement?.weight || 'Unknown'} kg
Height: ${latestMeasurement?.height || 'Unknown'} cm
Medical Conditions: ${healthInfo?.medicalConditions?.join(', ') || 'None'}
Injuries: ${healthInfo?.injuries?.join(', ') || 'None'}
Available Equipment: ${equipmentAvailable.join(', ')}

Please provide a structured workout plan with:
1. Day-by-day breakdown
2. Exercises with sets and reps
3. Rest periods
4. Progressive overload recommendations

Format the response as JSON with the following structure:
{
  "plan": [
    {
      "day": 1,
      "focus": "Upper Body",
      "exercises": [
        {
          "name": "Bench Press",
          "sets": 3,
          "reps": "8-12",
          "rest": 90,
          "notes": "Focus on form"
        }
      ]
    }
  ],
  "notes": "General recommendations"
}`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.activeModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a professional fitness trainer and exercise physiologist. Provide safe, effective workout plans.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            });

            const response = completion.choices[0].message.content;
            return JSON.parse(response || '{}');
        } catch (error) {
            console.error('AI workout generation failed:', error);
            throw new Error('Failed to generate AI workout plan');
        }
    }

    // Generate diet plan using AI
    async generateDietPlan(
        memberId: string,
        goal: string,
        dietaryRestrictions: string[] | undefined,
        allergies: string[] | undefined,
        mealsPerDay: number,
        tenantId: string
    ): Promise<any> {
        this.ensureInitialized();
        if (!this.openai) {
            throw new Error('AI service not configured. Set OPENROUTER_API_KEY in .env');
        }

        const member = await Member.findById(memberId);

        if (!member) {
            throw new Error('Member not found');
        }

        const calories = 2000; // default calories - TODO: calculate based on member data
        const macros = { protein: 150, carbs: 250, fats: 65 }; // default macros

        const prompt = `Create a ${mealsPerDay}-meal per day diet plan with the following requirements:

Goal: ${goal}
Daily Calories: ${calories}
Protein: ${macros.protein}g
Carbs: ${macros.carbs}g
Fats: ${macros.fats}g
Dietary Restrictions: ${dietaryRestrictions?.join(', ') || 'None'}
Preferences: ${member.preferences?.preferredClassTime || 'None'}

Please provide a structured meal plan with:
1. Meal timing
2. Food items with quantities
3. Macro breakdown per meal
4. Preparation tips

Format the response as JSON with the following structure:
{
  "meals": [
    {
      "name": "Breakfast",
      "time": "08:00",
      "foods": [
        {
          "name": "Oatmeal",
          "quantity": 50,
          "unit": "g",
          "calories": 190,
          "protein": 7,
          "carbs": 32,
          "fats": 3
        }
      ],
      "notes": "Preparation tips"
    }
  ],
  "notes": "General recommendations"
}`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.activeModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a certified nutritionist and dietitian. Provide balanced, healthy meal plans.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 2000,
            });

            const response = completion.choices[0].message.content;
            return JSON.parse(response || '{}');
        } catch (error) {
            console.error('AI diet generation failed:', error);
            throw new Error('Failed to generate AI diet plan');
        }
    }

    // AI fitness chatbot
    async chatbot(memberId: string, message: string, tenantId: string, conversationHistory: any[] = []): Promise<string> {
        this.ensureInitialized();
        if (!this.openai) {
            throw new Error('AI service not configured. Set OPENROUTER_API_KEY in .env');
        }

        const member = await Member.findById(memberId).populate('userId');

        if (!member) {
            throw new Error('Member not found');
        }

        const user = member.userId as any;
        const systemPrompt = `You are a helpful AI fitness assistant for ${user?.firstName}. 
You have access to their profile:
- Goals: ${member.goals?.join(', ') || 'General fitness'}
- Current status: ${member.status}

Provide helpful, encouraging, and accurate fitness advice. Keep responses concise and actionable.`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.activeModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...conversationHistory,
                    { role: 'user', content: message },
                ],
                temperature: 0.8,
                max_tokens: 500,
            });

            return completion.choices[0].message.content || 'Sorry, I could not generate a response.';
        } catch (error) {
            console.error('AI chat failed:', error);
            throw new Error('Failed to get AI response');
        }
    }

    // Predict churn risk
    // Predict churn risk with AI Analysis
    async predictChurn(memberId: string): Promise<{ risk: 'low' | 'medium' | 'high'; score: number; analysis: string; factors: string[] }> {
        this.ensureInitialized();
        if (!this.openai) {
            // Fallback to simple logic if AI not available
            return this.heuristicChurnPrediction(memberId);
        }

        const member = await Member.findById(memberId).populate('userId');
        if (!member) throw new Error('Member not found');
        const user = member.userId as any;

        // Fetch History
        const lastMonth = new Date();
        lastMonth.setDate(lastMonth.getDate() - 30);

        const [attendanceCount, lastAttendance, lastPayment] = await Promise.all([
            Attendance.countDocuments({ memberId, checkInTime: { $gte: lastMonth } }),
            Attendance.findOne({ memberId }).sort({ checkInTime: -1 }),
            Payment.findOne({ memberId }).sort({ createdAt: -1 })
        ]);

        const daysSinceLastVisit = lastAttendance
            ? Math.floor((Date.now() - lastAttendance.checkInTime.getTime()) / (1000 * 60 * 60 * 24))
            : 999;

        const prompt = `Analyze Churn Risk for this gym member:
        Name: ${user?.firstName}
        Member Since: ${member.createdAt.toISOString().split('T')[0]}
        Status: ${member.status}
        
        Activity Data:
        - Visits last 30 days: ${attendanceCount}
        - Days since last visit: ${daysSinceLastVisit}
        
        Financial Data:
        - Last Payment Status: ${lastPayment?.status || 'N/A'}
        - Last Payment Date: ${lastPayment?.createdAt.toISOString().split('T')[0] || 'N/A'}

        Based on these metrics, determine the likelihood of them cancelling their membership.
        Provide a "risk" level (low, medium, high), a "score" (0-100, where 100 is quit tomorrow), a qualitative "analysis", and key "factors".
        
        Format as JSON: { "risk": "...", "score": 0, "analysis": "...", "factors": ["..."] }`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.activeModel,
                messages: [
                    { role: 'system', content: 'You are an expert Retention Manager at a premium gym. You analyze behavioral data to predict churn.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.4,
                response_format: { type: 'json_object' }
            });

            return JSON.parse(completion.choices[0].message.content || '{"risk":"low","score":0,"analysis":"Analysis failed","factors":[]}');
        } catch (error) {
            console.error('AI churn prediction failed:', error);
            return this.heuristicChurnPrediction(memberId);
        }
    }

    private async heuristicChurnPrediction(memberId: string): Promise<{ risk: 'low' | 'medium' | 'high'; score: number; analysis: string; factors: string[] }> {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const factors: string[] = [];
        let score = 0;

        if (member.status === 'paused') { score += 30; factors.push('Membership Paused'); }
        else if (member.status === 'expired') { score += 80; factors.push('Membership Expired'); }

        const daysSinceUpdate = Math.floor((Date.now() - member.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
        if (daysSinceUpdate > 30) { score += 20; factors.push('No activity > 30 days'); }

        return {
            risk: score > 60 ? 'high' : score > 30 ? 'medium' : 'low',
            score,
            analysis: 'Heuristic analysis based on status and recency.',
            factors
        };
    }

    // Get AI insights for member progress
    async getProgressInsights(memberId: string, tenantId: string): Promise<string> {
        this.ensureInitialized();
        if (!this.openai) {
            throw new Error('AI service not configured. Set OPENROUTER_API_KEY in .env');
        }

        const member = await Member.findById(memberId).populate('userId');

        if (!member) {
            throw new Error('Member not found');
        }

        const user = member.userId as any;
        const measurements = member.measurements.slice(-5); // Last 5 measurements

        if (measurements.length < 2) {
            return 'Not enough data to generate insights. Please add more measurements.';
        }

        const prompt = `Analyze the following fitness progress data and provide insights:

Member: ${user?.firstName}
Goals: ${member.goals?.join(', ') || 'General fitness'}

Measurements (most recent first):
${measurements.reverse().map((m, i) => `
${i + 1}. Date: ${m.date.toISOString().split('T')[0]}
   Weight: ${m.weight}kg
   BMI: ${m.bmi}
   Body Fat: ${m.bodyFat || 'N/A'}%
   Muscle Mass: ${m.muscleMass || 'N/A'}kg
`).join('\n')}

Provide:
1. Progress summary
2. Key achievements
3. Areas for improvement
4. Actionable recommendations

Keep it concise and motivating.`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.activeModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a fitness coach analyzing member progress. Be encouraging and provide actionable advice.',
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 500,
            });

            return completion.choices[0].message.content || 'Unable to generate insights.';
        } catch (error) {
            console.error('AI insights generation failed:', error);
            throw new Error('Failed to generate AI insights');
        }
    }

    // AI Trainer Matching
    async matchTrainer(memberId: string, tenantId: string): Promise<any> {
        this.ensureInitialized();
        if (!this.openai) {
            throw new Error('AI service not configured. Set OPENROUTER_API_KEY in .env');
        }

        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        // Fetch all active trainers for this tenant
        const User = (await import('../models/User.model')).default;
        const trainers = await User.find({
            tenantId: tenantId as any,
            role: 'trainer',
            isActive: true
        });

        const prompt = `Match the best trainer for this member based on their goals and trainers' specializations:
Member Goals: ${member.goals?.join(', ') || 'General fitness'}
Member Health Info: ${member.healthInfo?.medicalConditions?.join(', ') || 'None'}

Available Trainers:
${trainers.map(t => `- ID: ${t._id}, Name: ${t.firstName} ${t.lastName}, Specializations: ${t.specializations?.join(', ') || 'General'}`).join('\n')}

Provide the top 3 matches with a "matchScore" (0-100) and a "reason" for each.
Format as JSON: { "matches": [{ "trainerId": "...", "trainerName": "...", "matchScore": 85, "reason": "..." }] }`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.activeModel,
                messages: [{ role: 'system', content: 'You are an AI gym coordinator.' }, { role: 'user', content: prompt }],
                temperature: 0.7,
                response_format: { type: 'json_object' }
            });

            return JSON.parse(completion.choices[0].message.content || '{}');
        } catch (error) {
            console.error('AI matching failed:', error);
            throw new Error('Failed to match trainers');
        }
    }

    // AI Injury-Risk Analysis
    async getInjuryRisk(memberId: string): Promise<{ riskLevel: 'low' | 'medium' | 'high'; advice: string; indicators: string[] }> {
        this.ensureInitialized();
        if (!this.openai) {
            throw new Error('AI service not configured. Set OPENROUTER_API_KEY in .env');
        }

        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const measurements = member.measurements.slice(-10);
        const healthInfo = member.healthInfo;

        const prompt = `Assess injury risk for this member:
Health History: ${healthInfo?.injuries?.join(', ') || 'No previous injuries'}
Recent Weight Trend: ${measurements.map(m => m.weight).join(' -> ')}
Goals: ${member.goals?.join(', ')}

Analyze if the member is pushing too hard or has pre-existing conditions that increase risk.
Format as JSON: { "riskLevel": "low|medium|high", "advice": "...", "indicators": ["..."] }`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.activeModel,
                messages: [{ role: 'system', content: 'You are an AI Sports Medicine Expert.' }, { role: 'user', content: prompt }],
                temperature: 0.5,
                response_format: { type: 'json_object' }
            });

            return JSON.parse(completion.choices[0].message.content || '{}');
        } catch (error) {
            console.error('Injury risk analysis failed:', error);
            return { riskLevel: 'low', advice: 'Keep monitoring form.', indicators: [] };
        }
    }

    // AI Habit Nudging (Auto-alerts)
    async generateHabitNudge(memberId: string): Promise<string> {
        this.ensureInitialized();
        if (!this.openai) {
            throw new Error('AI service not configured. Set OPENROUTER_API_KEY in .env');
        }

        const member = await Member.findById(memberId).populate('userId');
        if (!member) throw new Error('Member not found');

        const user = member.userId as any;
        const prompt = `Generate a short, powerful, personalized motivational nudge for ${user.firstName}.
Current status: ${member.status}
Goals: ${member.goals?.join(', ')}
Last activity: Some time ago.

The nudge should be under 150 characters, suitable for a push notification or WhatsApp.`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: this.activeModel,
                messages: [{ role: 'system', content: 'You are a world-class habit coach.' }, { role: 'user', content: prompt }],
                max_tokens: 100
            });

            return completion.choices[0].message.content || 'Time to get back to the gym!';
        } catch (error) {
            console.error('Habit nudge failed:', error);
            return 'Keep pushing towards your goals!';
        }
    }
}

export default new AIService();
