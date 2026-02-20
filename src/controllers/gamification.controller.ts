import { Request, Response } from 'express';
import gamificationDashboardService from '../services/gamification-dashboard.service';
import gamificationBadgeService from '../services/gamification-badge.service';
import streakService from '../services/streak.service';
import Member from '../models/Member.model';

export class GamificationController {
    /**
     * Get gamification dashboard
     */
    async getDashboard(req: Request, res: Response) {
        try {
            const user = (req as any).user;

            if (user.role === 'gym_owner' || user.role === 'super_admin') {
                const stats = await gamificationDashboardService.getGymStatistics(user.tenantId);
                return res.status(200).json({
                    success: true,
                    data: stats,
                });
            }

            // For members
            const member = await Member.findOne({ userId: user._id });
            if (!member) {
                return res.status(404).json({
                    success: false,
                    message: 'Member profile not found',
                });
            }

            const dashboard = await gamificationDashboardService.getMemberDashboard(member._id.toString());
            res.status(200).json({
                success: true,
                data: dashboard,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Get badges
     */
    async getBadges(req: Request, res: Response) {
        try {
            const user = (req as any).user;

            if (user.role === 'gym_owner' || user.role === 'super_admin') {
                const badgeStats = await gamificationBadgeService.getBadgeStatistics(user.tenantId);
                return res.status(200).json({
                    success: true,
                    data: badgeStats,
                });
            }

            const member = await Member.findOne({ userId: user._id });
            if (!member) {
                return res.status(404).json({
                    success: false,
                    message: 'Member profile not found',
                });
            }

            const badges = await gamificationBadgeService.getMemberBadges(member._id.toString());
            res.status(200).json({
                success: true,
                data: badges,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Get streaks
     */
    async getStreaks(req: Request, res: Response) {
        try {
            const user = (req as any).user;

            if (user.role === 'gym_owner' || user.role === 'super_admin') {
                const streaks = await streakService.getStreakLeaderboard(user.tenantId);
                return res.status(200).json({
                    success: true,
                    data: streaks,
                });
            }

            const member = await Member.findOne({ userId: user._id });
            if (!member) {
                return res.status(404).json({
                    success: false,
                    message: 'Member profile not found',
                });
            }

            const streakStats = await streakService.getStreakStats(member._id.toString());
            res.status(200).json({
                success: true,
                data: streakStats,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }
}

export default new GamificationController();
