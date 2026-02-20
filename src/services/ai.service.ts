import OpenAI from 'openai';
import { config } from '../config/config';
import Member from '../models/Member.model';
import Exercise from '../models/Exercise.model';

export class AIService {
    private openai: OpenAI | null = null;
    private initialized = false;

    private ensureInitialized() {
        if (this.initialized) return;

        const apiKey = config.openai.apiKey;

        if (!apiKey) {
            console.warn('⚠️ OpenAI API key missing. AI features will not work.');
            this.initialized = true;
            return;
        }

        try {
            this.openai = new OpenAI({
                apiKey: apiKey,
            });
            this.initialized = true;
        } catch (error) {
            console.error('❌ Failed to initialize OpenAI client:', error);
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
            throw new Error('AI service not configured properly (missing OpenAI API key)');
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
                model: 'gpt-4',
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
            throw new Error('AI service not configured properly (missing OpenAI API key)');
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
                model: 'gpt-4',
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
            throw new Error('AI service not configured properly (missing OpenAI API key)');
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
                model: 'gpt-4',
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
    async predictChurn(memberId: string): Promise<{ risk: 'low' | 'medium' | 'high'; factors: string[] }> {
        // This is a simplified version - in production, you'd use a trained ML model
        const member = await Member.findById(memberId);

        if (!member) {
            throw new Error('Member not found');
        }

        const factors: string[] = [];
        let riskScore = 0;

        // Check attendance (would need to query Attendance model)
        // For now, simplified logic

        if (member.status === 'paused') {
            riskScore += 30;
            factors.push('Membership is paused');
        }

        if (member.status === 'expired') {
            riskScore += 50;
            factors.push('Membership has expired');
        }

        // Check last activity (simplified)
        const daysSinceUpdate = Math.floor((Date.now() - member.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
        if (daysSinceUpdate > 30) {
            riskScore += 20;
            factors.push('No recent activity');
        }

        let risk: 'low' | 'medium' | 'high';
        if (riskScore < 30) {
            risk = 'low';
        } else if (riskScore < 60) {
            risk = 'medium';
        } else {
            risk = 'high';
        }

        return { risk, factors };
    }

    // Get AI insights for member progress
    async getProgressInsights(memberId: string, tenantId: string): Promise<string> {
        this.ensureInitialized();
        if (!this.openai) {
            throw new Error('AI service not configured properly (missing OpenAI API key)');
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
                model: 'gpt-4',
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
            throw new Error('AI service not configured properly (missing OpenAI API key)');
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
                model: 'gpt-4',
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
            throw new Error('AI service not configured properly (missing OpenAI API key)');
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
                model: 'gpt-4',
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
            throw new Error('AI service not configured properly (missing OpenAI API key)');
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
                model: 'gpt-4',
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
