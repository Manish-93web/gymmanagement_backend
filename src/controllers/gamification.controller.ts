'use strict';
import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import gamificationDashboardService from '../services/gamification-dashboard.service';
import gamificationBadgeService from '../services/gamification-badge.service';
import streakService from '../services/streak.service';
import Member from '../models/Member.model';
import Challenge from '../models/Challenge.model';
import ChallengeParticipant from '../models/ChallengeParticipant.model';
import RewardItem from '../models/RewardItem.model';
import RewardRedemption from '../models/RewardRedemption.model';
import Badge from '../models/Badge.model';
import MemberBadge from '../models/MemberBadge.model';
import Attendance from '../models/Attendance.model';

export class GamificationController {
    async getDashboard(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (user.role === 'gym_owner' || user.role === 'super_admin') {
                const stats = await gamificationDashboardService.getGymStatistics(user.tenantId);
                return res.status(200).json({ success: true, data: stats });
            }
            const member = await Member.findOne({ userId: user._id });
            if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });
            const dashboard = await gamificationDashboardService.getMemberDashboard(member._id.toString());
            res.status(200).json({ success: true, data: dashboard });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getBadges(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (user.role === 'gym_owner' || user.role === 'super_admin') {
                const badgeStats = await gamificationBadgeService.getBadgeStatistics(user.tenantId);
                return res.status(200).json({ success: true, data: badgeStats });
            }
            const member = await Member.findOne({ userId: user._id });
            if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });
            const badges = await gamificationBadgeService.getMemberBadges(member._id.toString());
            res.status(200).json({ success: true, data: badges });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getStreaks(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            if (user.role === 'gym_owner' || user.role === 'super_admin') {
                const streaks = await streakService.getStreakLeaderboard(user.tenantId);
                return res.status(200).json({ success: true, data: streaks });
            }
            const member = await Member.findOne({ userId: user._id });
            if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });
            const streakStats = await streakService.getStreakStats(member._id.toString());
            res.status(200).json({ success: true, data: streakStats });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getLeaderboard(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const tenantId = user.tenantId;
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            // Aggregate attendance count per member as points proxy
            const leaderboard = await Attendance.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), checkInTime: { $gte: thirtyDaysAgo } } },
                { $group: { _id: '$memberId', points: { $sum: 1 }, attendanceCount: { $sum: 1 } } },
                { $sort: { points: -1 } },
                { $limit: 20 },
                { $lookup: { from: 'members', localField: '_id', foreignField: '_id', as: 'member' } },
                { $unwind: { path: '$member', preserveNullAndEmptyArrays: true } },
                { $project: { _id: 1, points: 1, attendanceCount: 1, 'member.firstName': 1, 'member.lastName': 1, 'member.avatar': 1, 'member.membershipNumber': 1 } }
            ]);
            const ranked = leaderboard.map((item: any, index: number) => ({ ...item, rank: index + 1 }));
            res.status(200).json({ success: true, data: ranked });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getChallenges(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const tenantId = user.tenantId;
            const { status } = req.query;
            const query: any = { tenantId };
            if (status) query.status = status;
            const challenges = await Challenge.find(query).sort({ startDate: -1 });
            let member = null;
            if (user.role === 'member' || user.role === 'trainer') {
                member = await Member.findOne({ userId: user._id });
            }
            const challengesWithParticipation = await Promise.all(challenges.map(async (c) => {
                let isJoined = false;
                if (member) {
                    const participant = await ChallengeParticipant.findOne({ challengeId: c._id, memberId: member._id });
                    isJoined = !!participant;
                }
                return { ...c.toObject(), isJoined };
            }));
            res.status(200).json({ success: true, data: challengesWithParticipation });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async createChallenge(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { name, description, type, goal, startDate, endDate, rewards, maxParticipants } = req.body;
            if (!name || !type || !startDate || !endDate) {
                return res.status(400).json({ success: false, message: 'name, type, startDate, endDate are required' });
            }
            const challenge = await Challenge.create({
                name, description, type,
                goal: goal || { metric: type, target: 30, unit: 'count' },
                startDate: new Date(startDate), endDate: new Date(endDate),
                rewards: rewards || { winner: 100, topThree: 50, participants: 10 },
                maxParticipants, tenantId: user.tenantId,
                status: new Date(startDate) > new Date() ? 'upcoming' : 'active'
            });
            res.status(201).json({ success: true, data: challenge });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async updateChallenge(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { challengeId } = req.params;
            const challenge = await Challenge.findOne({ _id: challengeId, tenantId: user.tenantId });
            if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
            if (challenge.status !== 'upcoming') return res.status(400).json({ success: false, message: 'Can only update upcoming challenges' });
            const updated = await Challenge.findByIdAndUpdate(challengeId, req.body, { new: true });
            res.status(200).json({ success: true, data: updated });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async joinChallenge(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { challengeId } = req.params;
            const member = await Member.findOne({ userId: user._id });
            if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });
            const challenge = await Challenge.findOne({ _id: challengeId, tenantId: user.tenantId });
            if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
            if (challenge.status === 'completed' || challenge.status === 'cancelled') {
                return res.status(400).json({ success: false, message: 'Challenge is not active' });
            }
            if (challenge.maxParticipants && challenge.participantCount >= challenge.maxParticipants) {
                return res.status(400).json({ success: false, message: 'Challenge is full' });
            }
            const existing = await ChallengeParticipant.findOne({ challengeId, memberId: member._id });
            if (existing) return res.status(400).json({ success: false, message: 'Already joined this challenge' });
            await ChallengeParticipant.create({ challengeId, memberId: member._id, userId: user._id, tenantId: user.tenantId });
            await Challenge.findByIdAndUpdate(challengeId, { $inc: { participantCount: 1 } });
            res.status(200).json({ success: true, message: 'Joined challenge successfully' });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async leaveChallenge(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { challengeId } = req.params;
            const member = await Member.findOne({ userId: user._id });
            if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });
            const result = await ChallengeParticipant.findOneAndDelete({ challengeId, memberId: member._id });
            if (!result) return res.status(404).json({ success: false, message: 'Not a participant' });
            await Challenge.findByIdAndUpdate(challengeId, { $inc: { participantCount: -1 } });
            res.status(200).json({ success: true, message: 'Left challenge successfully' });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getRewards(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const rewards = await RewardItem.find({ tenantId: user.tenantId, isActive: true });
            res.status(200).json({ success: true, data: rewards });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async createReward(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { name, description, category, pointsCost, stock, imageUrl, validUntil } = req.body;
            if (!name || !pointsCost) return res.status(400).json({ success: false, message: 'name and pointsCost are required' });
            const reward = await RewardItem.create({ name, description, category: category || 'service', pointsCost, stock, imageUrl, validUntil, tenantId: user.tenantId });
            res.status(201).json({ success: true, data: reward });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async redeemReward(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { rewardId } = req.body;
            const member = await Member.findOne({ userId: user._id });
            if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' });
            const reward = await RewardItem.findOne({ _id: rewardId, tenantId: user.tenantId, isActive: true });
            if (!reward) return res.status(404).json({ success: false, message: 'Reward not found' });
            if (reward.stock !== undefined && reward.stock !== null && reward.stock <= 0) {
                return res.status(400).json({ success: false, message: 'Reward out of stock' });
            }
            const redemption = await RewardRedemption.create({
                rewardId, memberId: member._id, userId: user._id, tenantId: user.tenantId, pointsSpent: reward.pointsCost
            });
            if (reward.stock !== undefined && reward.stock !== null) {
                await RewardItem.findByIdAndUpdate(rewardId, { $inc: { stock: -1, redeemedCount: 1 } });
            } else {
                await RewardItem.findByIdAndUpdate(rewardId, { $inc: { redeemedCount: 1 } });
            }
            res.status(200).json({ success: true, data: redemption });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async getRedemptions(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            let query: any = { tenantId: user.tenantId };
            if (user.role === 'member') {
                const member = await Member.findOne({ userId: user._id });
                if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
                query.memberId = member._id;
            }
            const redemptions = await RewardRedemption.find(query)
                .populate('rewardId', 'name category pointsCost')
                .populate('memberId', 'firstName lastName')
                .sort({ redeemedAt: -1 });
            res.status(200).json({ success: true, data: redemptions });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    async createBadge(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { name, description, icon, category, criteria, points, tier } = req.body;
            if (!name || !icon) return res.status(400).json({ success: false, message: 'name and icon are required' });
            const badge = await Badge.create({
                name, description, icon,
                category: category || 'achievement',
                criteria: criteria || { type: 'attendance_count', value: 10 },
                points: points || 0,
                tier: tier || 'bronze',
                tenantId: user.tenantId
            });
            res.status(201).json({ success: true, data: badge });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}

export default new GamificationController();
