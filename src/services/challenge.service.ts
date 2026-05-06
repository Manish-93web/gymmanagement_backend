import Challenge from '../models/Challenge.model';
import ChallengeParticipant from '../models/ChallengeParticipant.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Workout from '../models/Workout.model';
import logger from '../config/logger';

interface ChallengeConfig {
    name: string;
    description: string;
    type: 'attendance' | 'workout' | 'weight_loss' | 'steps' | 'custom';
    goal: {
        metric: string;
        target: number;
        unit: string;
    };
    startDate: Date;
    endDate: Date;
    rewards: {
        winner: number; // points
        topThree: number;
        participants: number;
    };
    maxParticipants?: number;
    tenantId: string;
    branchId?: string;
}

class ChallengeService {
    /**
     * Create challenge
     */
    async createChallenge(config: ChallengeConfig) {
        const challenge = await Challenge.create({
            ...config,
            status: 'upcoming',
            participantCount: 0,
            createdAt: new Date(),
        });

        logger.info('Challenge created', { challengeId: challenge._id });

        return challenge;
    }

    /**
     * Join challenge
     */
    async joinChallenge(challengeId: string, memberId: string) {
        const challenge = await Challenge.findById(challengeId);
        if (!challenge) throw new Error('Challenge not found');

        if (challenge.status !== 'upcoming' && challenge.status !== 'active') {
            throw new Error('Challenge is not open for registration');
        }

        if (challenge.maxParticipants && challenge.participantCount >= challenge.maxParticipants) {
            throw new Error('Challenge is full');
        }

        // Check if already joined
        const existing = await ChallengeParticipant.findOne({ challengeId, memberId });
        if (existing) {
            throw new Error('Already joined this challenge');
        }

        const participant = await ChallengeParticipant.create({
            challengeId,
            memberId,
            progress: 0,
            joinedAt: new Date(),
        });

        // Update participant count
        await Challenge.findByIdAndUpdate(challengeId, {
            $inc: { participantCount: 1 },
        });

        logger.info('Member joined challenge', { challengeId, memberId });

        return participant;
    }

    /**
     * Update participant progress
     */
    async updateProgress(challengeId: string, memberId: string) {
        const challenge = await Challenge.findById(challengeId);
        if (!challenge) throw new Error('Challenge not found');

        const participant = await ChallengeParticipant.findOne({ challengeId, memberId });
        if (!participant) throw new Error('Not participating in this challenge');

        let progress = 0;

        switch (challenge.type) {
            case 'attendance': {
                const count = await Attendance.countDocuments({
                    memberId,
                    checkInTime: {
                        $gte: challenge.startDate,
                        $lte: challenge.endDate,
                    },
                });
                progress = count;
                break;
            }

            case 'workout': {
                const count = await Workout.countDocuments({
                    memberId,
                    completedAt: {
                        $gte: challenge.startDate,
                        $lte: challenge.endDate,
                    },
                });
                progress = count;
                break;
            }

            default:
                progress = participant.progress;
        }

        participant.progress = progress;
        if (progress >= challenge.goal.target && participant.status !== 'completed') {
            participant.status = 'completed';
            participant.completedAt = new Date();
        }
        await participant.save();

        return participant;
    }

    /**
     * Get challenge leaderboard
     */
    async getChallengeLeaderboard(challengeId: string) {
        const participants = await ChallengeParticipant.find({ challengeId })
            .populate('memberId', 'firstName lastName profilePicture')
            .sort({ progress: -1 });

        return participants.map((p: any, index) => ({
            rank: index + 1,
            memberId: p.memberId._id,
            name: `${p.memberId.firstName} ${p.memberId.lastName}`,
            profilePicture: p.memberId.profilePicture,
            progress: p.progress,
            completed: p.completed,
        }));
    }

    /**
     * Complete challenge and distribute rewards
     */
    async completeChallenge(challengeId: string) {
        const challenge = await Challenge.findById(challengeId);
        if (!challenge) throw new Error('Challenge not found');

        if (challenge.status === 'completed') {
            throw new Error('Challenge already completed');
        }

        // Get leaderboard
        const leaderboard = await this.getChallengeLeaderboard(challengeId);

        // Award points
        for (let i = 0; i < leaderboard.length; i++) {
            const participant = leaderboard[i];
            let points = challenge.rewards.participants;

            if (i === 0) {
                points = challenge.rewards.winner;
            } else if (i < 3) {
                points = challenge.rewards.topThree;
            }

            // Add points to member
            await Member.findByIdAndUpdate(participant.memberId, {
                $inc: { 'gamification.totalPoints': points },
            });

            // Update participant
            await ChallengeParticipant.findOneAndUpdate(
                { challengeId, memberId: participant.memberId },
                { pointsEarned: points }
            );
        }

        // Update challenge status
        challenge.status = 'completed';
        challenge.completedAt = new Date();
        await challenge.save();

        logger.info('Challenge completed', { challengeId, participants: leaderboard.length });

        return {
            success: true,
            leaderboard,
        };
    }

    /**
     * Get active challenges
     */
    async getActiveChallenges(tenantId: string, branchId?: string) {
        const query: any = {
            tenantId,
            status: { $in: ['upcoming', 'active'] },
        };

        if (branchId) {
            query.$or = [{ branchId }, { branchId: null }];
        }

        const challenges = await Challenge.find(query).sort({ startDate: 1 });

        return challenges;
    }

    /**
     * Get member's challenges
     */
    async getMemberChallenges(memberId: string) {
        const participations = await ChallengeParticipant.find({ memberId })
            .populate('challengeId')
            .sort({ joinedAt: -1 });

        return participations;
    }

    /**
     * Auto-start challenges (run daily)
     */
    async autoStartChallenges() {
        const now = new Date();

        const challengesToStart = await Challenge.find({
            status: 'upcoming',
            startDate: { $lte: now },
        });

        for (const challenge of challengesToStart) {
            challenge.status = 'active';
            await challenge.save();
            logger.info('Challenge auto-started', { challengeId: challenge._id });
        }

        return {
            success: true,
            started: challengesToStart.length,
        };
    }

    /**
     * Auto-complete challenges (run daily)
     */
    async autoCompleteChallenges() {
        const now = new Date();

        const challengesToComplete = await Challenge.find({
            status: 'active',
            endDate: { $lte: now },
        });

        for (const challenge of challengesToComplete) {
            await this.completeChallenge(challenge._id.toString());
        }

        return {
            success: true,
            completed: challengesToComplete.length,
        };
    }
}

export default new ChallengeService();
