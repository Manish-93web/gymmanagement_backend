import OpenAI from 'openai';
import User from '../models/User.model';
import Member from '../models/Member.model';
import Class from '../models/Class.model';
import logger from '../config/logger';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

interface TrainerSuggestion {
    trainerId: string;
    trainerName: string;
    matchScore: number;
    reasons: string[];
    specializations: string[];
    availability: string;
}

class AITrainerService {
    /**
     * Suggest best trainer for a member
     */
    async suggestTrainer(memberId: string): Promise<TrainerSuggestion[]> {
        const member = await Member.findById(memberId);
        if (!member) {
            throw new Error('Member not found');
        }

        // Get all trainers in the same branch
        const trainers = await User.find({
            role: 'trainer',
            branchId: member.branchId,
            isActive: true,
        });

        if (trainers.length === 0) {
            throw new Error('No trainers available');
        }

        // Prepare member profile for AI
        const memberProfile = {
            goals: member.goals || [],
            fitnessLevel: member.fitnessLevel || 'beginner',
            medicalConditions: member.medicalHistory?.conditions || [],
            preferences: member.preferences || {},
            age: this.calculateAge(member.dateOfBirth),
            gender: member.gender,
        };

        const suggestions: TrainerSuggestion[] = [];

        for (const trainer of trainers) {
            try {
                const matchScore = await this.calculateTrainerMatch(memberProfile, trainer);

                suggestions.push({
                    trainerId: trainer._id.toString(),
                    trainerName: `${trainer.firstName} ${trainer.lastName}`,
                    matchScore,
                    reasons: await this.generateMatchReasons(memberProfile, trainer, matchScore),
                    specializations: trainer.specializations || [],
                    availability: trainer.availability || 'Available',
                });
            } catch (error: any) {
                logger.error('Trainer matching failed', { trainerId: trainer._id, error });
            }
        }

        // Sort by match score
        suggestions.sort((a, b) => b.matchScore - a.matchScore);

        logger.info('Trainer suggestions generated', { memberId, suggestionCount: suggestions.length });

        return suggestions.slice(0, 3); // Return top 3
    }

    /**
     * Calculate trainer match score using AI
     */
    private async calculateTrainerMatch(memberProfile: any, trainer: any): Promise<number> {
        const prompt = `
You are a fitness expert. Rate how well this trainer matches the member's needs on a scale of 0-100.

Member Profile:
- Goals: ${memberProfile.goals.join(', ')}
- Fitness Level: ${memberProfile.fitnessLevel}
- Medical Conditions: ${memberProfile.medicalConditions.join(', ') || 'None'}
- Age: ${memberProfile.age}
- Gender: ${memberProfile.gender}

Trainer Profile:
- Specializations: ${trainer.specializations?.join(', ') || 'General fitness'}
- Experience: ${trainer.experience || 'Not specified'} years
- Certifications: ${trainer.certifications?.join(', ') || 'None'}

Provide only a number between 0-100.
`;

        try {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 10,
            });

            const score = parseInt(response.choices[0].message.content?.trim() || '50');
            return Math.min(Math.max(score, 0), 100);
        } catch (error) {
            logger.error('AI match calculation failed', { error });
            return 50; // Default score
        }
    }

    /**
     * Generate reasons for the match
     */
    private async generateMatchReasons(
        memberProfile: any,
        trainer: any,
        matchScore: number
    ): Promise<string[]> {
        const prompt = `
Explain in 2-3 bullet points why this trainer is ${matchScore >= 70 ? 'a great' : 'a suitable'} match for this member.

Member: ${memberProfile.goals.join(', ')} goals, ${memberProfile.fitnessLevel} level
Trainer: Specializes in ${trainer.specializations?.join(', ') || 'general fitness'}

Provide concise, actionable reasons.
`;

        try {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 150,
            });

            const content = response.choices[0].message.content || '';
            return content
                .split('\n')
                .filter((line) => line.trim().startsWith('-') || line.trim().startsWith('•'))
                .map((line) => line.replace(/^[-•]\s*/, '').trim())
                .filter((line) => line.length > 0);
        } catch (error) {
            logger.error('AI reason generation failed', { error });
            return ['Experienced trainer', 'Good availability', 'Positive member feedback'];
        }
    }

    /**
     * Generate personalized workout plan
     */
    async generateWorkoutPlan(memberId: string, duration: number = 4) {
        const member = await Member.findById(memberId);
        if (!member) {
            throw new Error('Member not found');
        }

        const prompt = `
Create a ${duration}-week workout plan for:
- Goals: ${member.goals?.join(', ') || 'General fitness'}
- Fitness Level: ${member.fitnessLevel || 'beginner'}
- Age: ${this.calculateAge(member.dateOfBirth)}
- Medical Conditions: ${member.medicalHistory?.conditions?.join(', ') || 'None'}

Format as JSON with this structure:
{
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "day": "Monday",
          "exercises": [
            {"name": "Exercise", "sets": 3, "reps": 10, "rest": "60s"}
          ]
        }
      ]
    }
  ]
}
`;

        try {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 2000,
            });

            const plan = JSON.parse(response.choices[0].message.content || '{}');

            logger.info('Workout plan generated', { memberId, duration });

            return plan;
        } catch (error: any) {
            logger.error('Workout plan generation failed', { error });
            throw new Error('Failed to generate workout plan');
        }
    }

    /**
     * Generate diet recommendations
     */
    async generateDietPlan(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) {
            throw new Error('Member not found');
        }

        const prompt = `
Create a personalized diet plan for:
- Goals: ${member.goals?.join(', ') || 'General fitness'}
- Weight: ${member.measurements?.weight || 'Not specified'} kg
- Height: ${member.measurements?.height || 'Not specified'} cm
- Dietary Restrictions: ${member.dietaryRestrictions?.join(', ') || 'None'}

Provide daily calorie target and meal suggestions.
`;

        try {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL || 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 1000,
            });

            const dietPlan = response.choices[0].message.content;

            logger.info('Diet plan generated', { memberId });

            return {
                plan: dietPlan,
                generatedAt: new Date(),
            };
        } catch (error: any) {
            logger.error('Diet plan generation failed', { error });
            throw new Error('Failed to generate diet plan');
        }
    }

    /**
     * Calculate age from date of birth
     */
    private calculateAge(dateOfBirth?: Date): number {
        if (!dateOfBirth) return 30; // Default
        const today = new Date();
        const birthDate = new Date(dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }
}

export default new AITrainerService();
