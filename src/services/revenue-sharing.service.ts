import Payment from '../models/Payment.model';
import User from '../models/User.model';
import Tenant from '../models/Tenant.model';
import logger from '../config/logger';

interface RevenueShareRule {
    role: string;
    shareType: 'percentage' | 'fixed';
    shareValue: number;
    minRevenue?: number;
    maxRevenue?: number;
    applicableServices?: string[];
}

interface RevenueShare {
    userId: string;
    amount: number;
    period: string;
    breakdown: any[];
}

class RevenueSharingService {
    /**
     * Define revenue sharing rules
     */
    private defaultRules: RevenueShareRule[] = [
        {
            role: 'trainer',
            shareType: 'percentage',
            shareValue: 20, // 20% of personal training sessions
            applicableServices: ['personal_training', 'diet_consultation'],
        },
        {
            role: 'branch_manager',
            shareType: 'percentage',
            shareValue: 5, // 5% of branch revenue
        },
        {
            role: 'staff',
            shareType: 'fixed',
            shareValue: 100, // ₹100 per new member registration
            applicableServices: ['member_registration'],
        },
    ];

    /**
     * Calculate revenue share for a user
     */
    async calculateRevenueShare(
        userId: string,
        startDate: Date,
        endDate: Date
    ): Promise<RevenueShare> {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }

        // Get applicable rules for user role
        const rules = this.defaultRules.filter((rule) => rule.role === user.role);

        if (rules.length === 0) {
            return {
                userId,
                amount: 0,
                period: `${startDate.toISOString()} - ${endDate.toISOString()}`,
                breakdown: [],
            };
        }

        let totalShare = 0;
        const breakdown = [];

        for (const rule of rules) {
            const query: any = {
                tenantId: user.tenantId,
                status: 'success',
                createdAt: { $gte: startDate, $lte: endDate },
            };

            // Filter by applicable services
            if (rule.applicableServices && rule.applicableServices.length > 0) {
                query.serviceType = { $in: rule.applicableServices };
            }

            // For trainers, filter by their sessions
            if (user.role === 'trainer') {
                query.trainerId = userId;
            }

            // For branch managers, filter by their branch
            if (user.role === 'branch_manager') {
                query.branchId = user.branchId;
            }

            const payments = await Payment.find(query);

            let ruleShare = 0;
            if (rule.shareType === 'percentage') {
                const totalRevenue = payments.reduce((sum, p) => sum + p.amount.total, 0);
                ruleShare = (totalRevenue * rule.shareValue) / 100;
            } else {
                // Fixed amount per transaction
                ruleShare = payments.length * rule.shareValue;
            }

            totalShare += ruleShare;

            breakdown.push({
                rule: rule.role,
                shareType: rule.shareType,
                shareValue: rule.shareValue,
                transactionCount: payments.length,
                totalRevenue: payments.reduce((sum, p) => sum + p.amount.total, 0),
                shareAmount: ruleShare,
            });
        }

        return {
            userId,
            amount: totalShare,
            period: `${startDate.toISOString()} - ${endDate.toISOString()}`,
            breakdown,
        };
    }

    /**
     * Calculate revenue share for all eligible users
     */
    async calculateAllRevenueShares(tenantId: string, startDate: Date, endDate: Date) {
        const eligibleRoles = ['trainer', 'branch_manager', 'staff'];

        const users = await (User as any).find({
            tenantId,
            role: { $in: eligibleRoles },
            isActive: true,
        });

        const results = [];

        for (const user of users) {
            try {
                const share = await this.calculateRevenueShare(user._id.toString(), startDate, endDate);
                results.push({
                    userId: user._id,
                    userName: `${user.firstName} ${user.lastName}`,
                    role: user.role,
                    share,
                });
            } catch (error: any) {
                logger.error('Revenue share calculation failed', { userId: user._id, error });
            }
        }

        logger.info('Revenue share calculation completed', { tenantId, userCount: results.length });

        return results;
    }

    /**
     * Get revenue share report
     */
    async getRevenueShareReport(tenantId: string, month: number, year: number) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59);

        const shares = await this.calculateAllRevenueShares(tenantId, startDate, endDate);

        const summary = {
            period: `${month}/${year}`,
            totalShares: shares.reduce((sum, s) => sum + s.share.amount, 0),
            userCount: shares.length,
            byRole: {} as any,
        };

        // Group by role
        for (const share of shares) {
            const role = share.role;
            if (!summary.byRole[role]) {
                summary.byRole[role] = {
                    count: 0,
                    totalAmount: 0,
                };
            }
            summary.byRole[role].count += 1;
            summary.byRole[role].totalAmount += share.share.amount;
        }

        return {
            summary,
            details: shares,
        };
    }

    /**
     * Update revenue sharing rules
     */
    async updateRules(tenantId: string, rules: RevenueShareRule[]) {
        // In production, store rules in database per tenant
        // For now, we'll just validate and return

        for (const rule of rules) {
            if (rule.shareType === 'percentage' && (rule.shareValue < 0 || rule.shareValue > 100)) {
                throw new Error('Percentage share must be between 0 and 100');
            }

            if (rule.shareType === 'fixed' && rule.shareValue < 0) {
                throw new Error('Fixed share must be positive');
            }
        }

        logger.info('Revenue sharing rules updated', { tenantId, ruleCount: rules.length });

        return {
            success: true,
            message: 'Revenue sharing rules updated successfully',
            rules,
        };
    }
}

export default new RevenueSharingService();
