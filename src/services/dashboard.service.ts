import Member from '../models/Member.model';
import Payment from '../models/Payment.model';
import Trainer from '../models/Trainer.model';
import Branch from '../models/Branch.model';
import AuditLog from '../models/AuditLog.model';
import { UserRole } from '../models/User.model';
import mongoose from 'mongoose';

class DashboardService {
    async getDataForRole(role: UserRole, userId: string, tenantId: string, branchId?: string) {
        switch (role) {
            case 'gym_owner':
                return this.getGymOwnerStats(tenantId);
            case 'branch_manager':
                return this.getBranchManagerStats(tenantId, branchId!);
            case 'trainer':
                return this.getTrainerStats(tenantId, userId);
            case 'member':
                return this.getMemberStats(tenantId, userId);
            case 'accountant':
                return this.getAccountantStats(tenantId);
            case 'auditor':
                return this.getAuditorStats(tenantId);
            default:
                throw new Error('Invalid role for dashboard');
        }
    }

    private async getGymOwnerStats(tenantId: string) {
        const totalMembers = await Member.countDocuments({ tenantId });
        const revenue = await Payment.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const activeBranches = await Branch.countDocuments({ tenantId, isActive: true });

        return {
            stats: {
                totalMembers,
                revenue: revenue[0]?.total || 0,
                activeBranches,
            }
        };
    }

    private async getMemberStats(tenantId: string, userId: string) {
        const member = await Member.findOne({ tenantId, userId });
        // Simplified mockup for personal attendance and progress
        return {
            profile: member,
            metrics: {
                attendanceStreak: member?.gamification?.currentStreak || 0,
                totalPoints: member?.gamification?.totalPoints || 0,
                nextClass: 'Evening Yoga - 6:00 PM'
            }
        };
    }

    private async getTrainerStats(tenantId: string, userId: string) {
        const trainersMembers = await Member.countDocuments({ tenantId, 'preferences.preferredTrainer': userId });
        return {
            stats: {
                activeMembers: trainersMembers,
                classesToday: 4,
                averageMemberPulse: '88%'
            }
        };
    }

    private async getAccountantStats(tenantId: string) {
        const pendingPayments = await Payment.countDocuments({ tenantId, status: 'pending' });
        const monthlyRevenue = await Payment.aggregate([
            { $match: { tenantId: new mongoose.Types.ObjectId(tenantId), status: 'completed' } },
            { $group: { _id: { month: { $month: '$createdAt' } }, total: { $sum: '$amount' } } }
        ]);

        return {
            pendingInvoices: pendingPayments,
            revenueChart: monthlyRevenue,
            taxSummary: { gst: '18%', totalTax: 4500 }
        };
    }

    private async getAuditorStats(tenantId: string) {
        const recentLogs = await AuditLog.find({ tenantId }).sort({ createdAt: -1 }).limit(10);
        return {
            auditLogs: recentLogs,
            systemAlerts: 0,
            dataIntegrity: '100%'
        };
    }

    private async getBranchManagerStats(tenantId: string, branchId: string) {
        const branchMembers = await Member.countDocuments({ tenantId, branchId });
        return {
            stats: {
                totalMembers: branchMembers,
                branchStatus: 'Operational',
                occupancy: '75%'
            }
        };
    }
}

export default new DashboardService();
