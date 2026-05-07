import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import InactivityAlert from '../models/InactivityAlert.model';
import logger from '../config/logger';

interface InactivityConfig {
    level: 'warning' | 'critical' | 'churned';
    daysSinceLastVisit: number;
    actions: string[];
}

class InactivityDetectionService {
    private readonly INACTIVITY_LEVELS: InactivityConfig[] = [
        {
            level: 'warning',
            daysSinceLastVisit: 7,
            actions: ['send_reminder', 'notify_trainer'],
        },
        {
            level: 'critical',
            daysSinceLastVisit: 14,
            actions: ['send_winback_campaign', 'assign_follow_up', 'offer_discount'],
        },
        {
            level: 'churned',
            daysSinceLastVisit: 30,
            actions: ['mark_at_risk', 'escalate_to_manager', 'final_offer'],
        },
    ];

    /**
     * Detect inactive members (run daily)
     */
    async detectInactiveMembers(tenantId: string) {
        const activeMembers = await Member.find({
            tenantId,
            status: 'active',
        });

        const results = {
            warning: [] as any[],
            critical: [] as any[],
            churned: [] as any[],
        };

        for (const member of activeMembers) {
            const lastAttendance = await Attendance.findOne({
                memberId: member._id,
            }).sort({ checkInTime: -1 });

            if (!lastAttendance) {
                // Never attended
                continue;
            }

            const daysSinceLastVisit = Math.floor(
                (Date.now() - lastAttendance.checkInTime.getTime()) / (1000 * 60 * 60 * 24)
            );

            // Check inactivity levels
            for (const config of this.INACTIVITY_LEVELS) {
                if (daysSinceLastVisit >= config.daysSinceLastVisit) {
                    // Check if already alerted for this level
                    const existingAlert = await InactivityAlert.findOne({
                        memberId: member._id,
                        level: config.level,
                        createdAt: {
                            $gte: new Date(Date.now() - config.daysSinceLastVisit * 24 * 60 * 60 * 1000),
                        },
                    });

                    if (!existingAlert) {
                        // Create alert
                        const alert = await (InactivityAlert as any).create({
                            memberId: member._id,
                            tenantId,
                            level: config.level,
                            daysSinceLastVisit,
                            lastVisitDate: lastAttendance.checkInTime,
                            actionsTriggered: config.actions,
                            status: 'pending',
                            createdAt: new Date(),
                        });

                        results[config.level].push({
                            member,
                            alert,
                            daysSinceLastVisit,
                        });

                        logger.info('Inactivity alert created', {
                            memberId: member._id,
                            level: config.level,
                            daysSinceLastVisit,
                        });
                    }

                    break; // Only trigger highest applicable level
                }
            }
        }

        return results;
    }

    /**
     * Get inactive members by level
     */
    async getInactiveMembers(
        tenantId: string,
        level?: 'warning' | 'critical' | 'churned',
        page: number = 1,
        limit: number = 50
    ) {
        const query: any = { tenantId };
        if (level) query.level = level;

        const total = await InactivityAlert.countDocuments(query);
        const alerts = await InactivityAlert.find(query)
            .populate('memberId', 'firstName lastName email mobile profilePicture')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return {
            alerts,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Mark member as re-engaged
     */
    async markReEngaged(memberId: string) {
        await InactivityAlert.updateMany(
            { memberId, status: 'pending' },
            { status: 'resolved', resolvedAt: new Date() }
        );

        logger.info('Member marked as re-engaged', { memberId });

        return {
            success: true,
            message: 'Member marked as re-engaged',
        };
    }

    /**
     * Get inactivity statistics
     */
    async getInactivityStats(tenantId: string) {
        const totalActive = await Member.countDocuments({ tenantId, status: 'active' });

        const warningCount = await InactivityAlert.countDocuments({
            tenantId,
            level: 'warning',
            status: 'pending',
        });

        const criticalCount = await InactivityAlert.countDocuments({
            tenantId,
            level: 'critical',
            status: 'pending',
        });

        const churnedCount = await InactivityAlert.countDocuments({
            tenantId,
            level: 'churned',
            status: 'pending',
        });

        const reEngagedCount = await InactivityAlert.countDocuments({
            tenantId,
            status: 'resolved',
            resolvedAt: {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
        });

        return {
            totalActive,
            atRisk: {
                warning: warningCount,
                critical: criticalCount,
                churned: churnedCount,
                total: warningCount + criticalCount + churnedCount,
            },
            reEngaged: reEngagedCount,
            riskPercentage: ((warningCount + criticalCount + churnedCount) / totalActive * 100).toFixed(1),
        };
    }

    /**
     * Get member inactivity status
     */
    async getMemberInactivityStatus(memberId: string) {
        const lastAttendance = await Attendance.findOne({ memberId }).sort({ checkInTime: -1 });

        if (!lastAttendance) {
            return {
                isInactive: true,
                daysSinceLastVisit: null,
                level: null,
                message: 'Never attended',
            };
        }

        const daysSinceLastVisit = Math.floor(
            (Date.now() - lastAttendance.checkInTime.getTime()) / (1000 * 60 * 60 * 24)
        );

        let level = null;
        if (daysSinceLastVisit >= 30) level = 'churned';
        else if (daysSinceLastVisit >= 14) level = 'critical';
        else if (daysSinceLastVisit >= 7) level = 'warning';

        return {
            isInactive: daysSinceLastVisit >= 7,
            daysSinceLastVisit,
            lastVisitDate: lastAttendance.checkInTime,
            level,
            message: level ? `Inactive for ${daysSinceLastVisit} days` : 'Active',
        };
    }

    /**
     * Predict churn risk for member
     */
    async predictChurnRisk(memberId: string): Promise<number> {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        let riskScore = 0;

        // Factor 1: Attendance frequency (40%)
        const last30DaysAttendance = await Attendance.countDocuments({
            memberId,
            checkInTime: {
                $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
        });

        if (last30DaysAttendance === 0) riskScore += 40;
        else if (last30DaysAttendance < 4) riskScore += 30;
        else if (last30DaysAttendance < 8) riskScore += 15;

        // Factor 2: Days since last visit (30%)
        const status = await this.getMemberInactivityStatus(memberId);
        if (status.level === 'churned') riskScore += 30;
        else if (status.level === 'critical') riskScore += 20;
        else if (status.level === 'warning') riskScore += 10;

        // Factor 3: Membership expiry (20%)
        if (member.membershipExpiry) {
            const daysUntilExpiry = Math.floor(
                (member.membershipExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            if (daysUntilExpiry < 0) riskScore += 20; // Expired
            else if (daysUntilExpiry < 7) riskScore += 15;
            else if (daysUntilExpiry < 30) riskScore += 10;
        }

        // Factor 4: Engagement (10%)
        const gamificationPoints = member.gamification?.totalPoints || 0;
        if (gamificationPoints === 0) riskScore += 10;
        else if (gamificationPoints < 50) riskScore += 5;

        return Math.min(riskScore, 100); // Cap at 100
    }
}

export default new InactivityDetectionService();
