import Tenant from '../models/Tenant.model';
import SaaSInvoice from '../models/SaaSInvoice.model';
import SupportTicket from '../models/SupportTicket.model';
import logger from '../config/logger';

class PlatformBusinessService {
    async getGlobalStats() {
        try {
            const [totalTenants, activeTenants, pendingApprovals, openTickets] = await Promise.all([
                Tenant.countDocuments(),
                Tenant.countDocuments({ isActive: true, 'subscription.status': 'active' }),
                Tenant.countDocuments({ isActive: false, 'subscription.status': 'inactive' }),
                SupportTicket.countDocuments({ status: 'open' }).catch(() => 0),
            ]);

            const [totalRevenue, mrr] = await Promise.all([
                this.calculateTotalRevenue(),
                this.calculateMRR(),
            ]);
            const churnRate = await this.calculateChurnRate();

            return {
                tenants: { total: totalTenants, active: activeTenants, pending: pendingApprovals },
                revenue: { total: totalRevenue, totalCollected: totalRevenue, mrr, churnRate },
                support: { openTickets },
            };
        } catch (err) {
            logger.error('[PlatformBusiness] Error fetching global stats:', err);
            throw err;
        }
    }

    private async calculateMRR(): Promise<number> {
        const activePaid = await Tenant.find({
            'subscription.plan':   { $ne: 'trial' },
            'subscription.status': { $in: ['active'] as any },
        }).select('customPrice billingCycle').lean();

        let mrr = 0;
        for (const t of activePaid) {
            const price = (t as any).customPrice ?? 0;
            const cycle = (t as any).billingCycle ?? 'monthly';
            if (cycle === 'monthly')   mrr += price;
            else if (cycle === 'quarterly') mrr += price / 3;
            else if (cycle === 'yearly')    mrr += price / 12;
        }
        return Math.round(mrr);
    }

    private async calculateTotalRevenue(): Promise<number> {
        const result = await SaaSInvoice.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$total' } } },
        ]);
        return result.length > 0 ? Math.round(result[0].total) : 0;
    }

    async calculateCollectionsThisMonth(): Promise<number> {
        const now          = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const result = await SaaSInvoice.aggregate([
            { $match: { status: 'paid', paidAt: { $gte: startOfMonth } } },
            { $group: { _id: null, total: { $sum: '$total' } } },
        ]);
        return result.length > 0 ? Math.round(result[0].total) : 0;
    }

    private async calculateChurnRate(): Promise<number> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const [cancelled, total] = await Promise.all([
            Tenant.countDocuments({ isActive: false, updatedAt: { $gte: thirtyDaysAgo } }),
            Tenant.countDocuments(),
        ]);
        if (total === 0) return 0;
        return parseFloat(((cancelled / total) * 100).toFixed(2));
    }

    async approveGym(tenantId: string) {
        return Tenant.findByIdAndUpdate(
            tenantId,
            { isActive: true, 'subscription.status': 'active' },
            { new: true }
        );
    }

    async suspendGym(tenantId: string, _reason: string) {
        return Tenant.findByIdAndUpdate(
            tenantId,
            { isActive: false, 'subscription.status': 'suspended', lockState: 'hard' },
            { new: true }
        );
    }
}

export default new PlatformBusinessService();
