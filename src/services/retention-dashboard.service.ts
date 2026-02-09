import InactivityDetectionService from './inactivity-detection.service';
import WinbackCampaignService from './winback-campaign.service';
import PersonalizedOfferService from './personalized-offer.service';
import Member from '../models/Member.model';
import logger from '../config/logger';

class RetentionDashboardService {
    /**
     * Get complete retention dashboard
     */
    async getRetentionDashboard(tenantId: string) {
        const [
            inactivityStats,
            offerStats,
            churnPredictions,
            recentWinbacks,
        ] = await Promise.all([
            InactivityDetectionService.getInactivityStats(tenantId),
            PersonalizedOfferService.getOfferStats(tenantId),
            this.getChurnPredictions(tenantId),
            this.getRecentWinbacks(tenantId),
        ]);

        return {
            overview: {
                totalActive: inactivityStats.totalActive,
                atRisk: inactivityStats.atRisk.total,
                riskPercentage: inactivityStats.riskPercentage,
                reEngaged: inactivityStats.reEngaged,
            },
            inactivity: inactivityStats,
            offers: offerStats,
            churnPredictions,
            recentWinbacks,
        };
    }

    /**
     * Get churn predictions
     */
    private async getChurnPredictions(tenantId: string, limit: number = 20) {
        const members = await Member.find({ tenantId, status: 'active' }).limit(100);

        const predictions = await Promise.all(
            members.map(async (member) => {
                const churnRisk = await InactivityDetectionService.predictChurnRisk(
                    member._id.toString()
                );

                return {
                    memberId: member._id,
                    name: `${member.firstName} ${member.lastName}`,
                    email: member.email,
                    profilePicture: member.profilePicture,
                    churnRisk,
                    riskLevel: this.getRiskLevel(churnRisk),
                };
            })
        );

        // Sort by churn risk and return top at-risk members
        return predictions
            .sort((a, b) => b.churnRisk - a.churnRisk)
            .slice(0, limit);
    }

    /**
     * Get risk level
     */
    private getRiskLevel(churnRisk: number): 'low' | 'medium' | 'high' | 'critical' {
        if (churnRisk >= 70) return 'critical';
        if (churnRisk >= 50) return 'high';
        if (churnRisk >= 30) return 'medium';
        return 'low';
    }

    /**
     * Get recent win-backs
     */
    private async getRecentWinbacks(tenantId: string, days: number = 30) {
        const campaigns = await WinbackCampaignService.getAllCampaigns(tenantId);

        const recentCampaigns = campaigns
            .filter((c: any) => {
                if (!c.sentAt) return false;
                const daysSince = Math.floor(
                    (Date.now() - c.sentAt.getTime()) / (1000 * 60 * 60 * 24)
                );
                return daysSince <= days;
            })
            .slice(0, 5);

        return recentCampaigns.map((c: any) => ({
            campaignId: c._id,
            name: c.name,
            sentAt: c.sentAt,
            recipientCount: c.recipientCount,
            convertedCount: c.convertedCount,
            conversionRate: c.sentCount > 0
                ? ((c.convertedCount / c.sentCount) * 100).toFixed(1)
                : 0,
        }));
    }

    /**
     * Get retention trends
     */
    async getRetentionTrends(tenantId: string, months: number = 6) {
        const trends = [];

        for (let i = 0; i < months; i++) {
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - i - 1);
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);

            const activeMembers = await Member.countDocuments({
                tenantId,
                status: 'active',
                createdAt: { $lte: endDate },
            });

            const churnedMembers = await Member.countDocuments({
                tenantId,
                status: 'expired',
                membershipExpiry: {
                    $gte: startDate,
                    $lt: endDate,
                },
            });

            const retentionRate = activeMembers > 0
                ? (((activeMembers - churnedMembers) / activeMembers) * 100).toFixed(1)
                : 0;

            trends.unshift({
                month: startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                activeMembers,
                churnedMembers,
                retentionRate: `${retentionRate}%`,
            });
        }

        return trends;
    }

    /**
     * Get intervention recommendations
     */
    async getInterventionRecommendations(tenantId: string) {
        const inactiveMembers = await InactivityDetectionService.getInactiveMembers(
            tenantId,
            undefined,
            1,
            50
        );

        const recommendations = await Promise.all(
            inactiveMembers.alerts.map(async (alert: any) => {
                const member = alert.memberId;
                const churnRisk = await InactivityDetectionService.predictChurnRisk(
                    member._id.toString()
                );

                let recommendedAction = '';
                if (churnRisk >= 70) {
                    recommendedAction = 'Send aggressive win-back offer (30% discount)';
                } else if (churnRisk >= 50) {
                    recommendedAction = 'Offer free personal training sessions';
                } else if (churnRisk >= 30) {
                    recommendedAction = 'Send friendly reminder email';
                } else {
                    recommendedAction = 'Monitor for another week';
                }

                return {
                    memberId: member._id,
                    name: `${member.firstName} ${member.lastName}`,
                    level: alert.level,
                    daysSinceLastVisit: alert.daysSinceLastVisit,
                    churnRisk,
                    recommendedAction,
                };
            })
        );

        return recommendations.slice(0, 20);
    }
}

export default new RetentionDashboardService();
