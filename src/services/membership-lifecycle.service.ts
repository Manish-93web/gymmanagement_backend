import Member from '../models/Member.model';
import Plan from '../models/Plan.model';
import Payment from '../models/Payment.model';
import logger from '../config/logger';
import { sendEmail } from '../utils/email.util';
import { sendSMS } from '../utils/sms.util';

interface FreezeRequest {
    memberId: string;
    reason: string;
    startDate: Date;
    endDate: Date;
    freezeDays: number;
}

interface TransferRequest {
    memberId: string;
    fromBranchId: string;
    toBranchId: string;
    reason: string;
    effectiveDate: Date;
}

class MembershipLifecycleService {
    /**
     * Freeze/Pause membership
     */
    async freezeMembership(data: FreezeRequest) {
        const { memberId, reason, startDate, endDate, freezeDays } = data;

        const member = await Member.findById(memberId);
        if (!member) {
            throw new Error('Member not found');
        }

        // Check if already frozen
        if (member.status === 'paused') {
            throw new Error('Membership is already frozen');
        }

        // Validate freeze duration
        const maxFreezeDays = 90; // 3 months max
        if (freezeDays > maxFreezeDays) {
            throw new Error(`Maximum freeze duration is ${maxFreezeDays} days`);
        }

        // Calculate new expiry date
        const currentExpiry = member.membershipExpiry;
        const newExpiry = new Date(currentExpiry);
        newExpiry.setDate(newExpiry.getDate() + freezeDays);

        // Update member
        member.status = 'paused';
        member.freezeHistory = member.freezeHistory || [];
        member.freezeHistory.push({
            reason,
            startDate,
            endDate,
            freezeDays,
            createdAt: new Date(),
        });
        member.membershipExpiry = newExpiry;

        await member.save();

        // Send notification
        await sendEmail({
            to: member.email,
            subject: 'Membership Frozen',
            template: 'membership-frozen',
            data: {
                name: `${member.firstName} ${member.lastName}`,
                startDate,
                endDate,
                newExpiry,
            },
        });

        logger.info('Membership frozen', { memberId, freezeDays });

        return {
            success: true,
            message: 'Membership frozen successfully',
            member: {
                _id: member._id,
                status: member.status,
                membershipExpiry: member.membershipExpiry,
            },
        };
    }

    /**
     * Unfreeze membership
     */
    async unfreezeMembership(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) {
            throw new Error('Member not found');
        }

        if (member.status !== 'paused') {
            throw new Error('Membership is not frozen');
        }

        // Update status
        member.status = 'active';
        await member.save();

        // Send notification
        await sendEmail({
            to: member.email,
            subject: 'Membership Reactivated',
            template: 'membership-unfrozen',
            data: {
                name: `${member.firstName} ${member.lastName}`,
            },
        });

        logger.info('Membership unfrozen', { memberId });

        return {
            success: true,
            message: 'Membership reactivated successfully',
        };
    }

    /**
     * Transfer member to another branch
     */
    async transferBranch(data: TransferRequest) {
        const { memberId, fromBranchId, toBranchId, reason, effectiveDate } = data;

        const member = await Member.findById(memberId);
        if (!member) {
            throw new Error('Member not found');
        }

        if (member.branchId.toString() !== fromBranchId) {
            throw new Error('Member does not belong to the specified branch');
        }

        // Record transfer history
        member.transferHistory = member.transferHistory || [];
        member.transferHistory.push({
            fromBranchId,
            toBranchId,
            reason,
            effectiveDate,
            createdAt: new Date(),
        });

        // Update branch
        member.branchId = toBranchId;
        await member.save();

        // Send notification
        await sendEmail({
            to: member.email,
            subject: 'Branch Transfer Confirmation',
            template: 'branch-transfer',
            data: {
                name: `${member.firstName} ${member.lastName}`,
                effectiveDate,
            },
        });

        logger.info('Member transferred to new branch', { memberId, fromBranchId, toBranchId });

        return {
            success: true,
            message: 'Member transferred successfully',
            member: {
                _id: member._id,
                branchId: member.branchId,
            },
        };
    }

    /**
     * Reactivate expired membership
     */
    async reactivateMembership(memberId: string, planId: string) {
        const member = await Member.findById(memberId);
        if (!member) {
            throw new Error('Member not found');
        }

        const plan = await Plan.findById(planId);
        if (!plan) {
            throw new Error('Plan not found');
        }

        // Check if member is expired or cancelled
        if (!['expired', 'cancelled'].includes(member.status)) {
            throw new Error('Only expired or cancelled memberships can be reactivated');
        }

        // Calculate new expiry
        const startDate = new Date();
        const expiryDate = new Date(startDate);
        expiryDate.setDate(expiryDate.getDate() + plan.durationDays);

        // Update member
        member.status = 'active';
        member.planId = planId;
        member.membershipStart = startDate;
        member.membershipExpiry = expiryDate;

        await member.save();

        // Send welcome back email
        await sendEmail({
            to: member.email,
            subject: 'Welcome Back!',
            template: 'membership-reactivated',
            data: {
                name: `${member.firstName} ${member.lastName}`,
                planName: plan.name,
                expiryDate,
            },
        });

        logger.info('Membership reactivated', { memberId, planId });

        return {
            success: true,
            message: 'Membership reactivated successfully',
            member: {
                _id: member._id,
                status: member.status,
                membershipExpiry: member.membershipExpiry,
            },
        };
    }

    /**
     * Auto-reactivation workflow for expiring memberships
     */
    async autoReactivationWorkflow() {
        // Find members expiring in next 7 days
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

        const expiringMembers = await Member.find({
            status: 'active',
            membershipExpiry: {
                $gte: new Date(),
                $lte: sevenDaysFromNow,
            },
        });

        for (const member of expiringMembers) {
            // Send renewal reminder
            await sendEmail({
                to: member.email,
                subject: 'Membership Expiring Soon',
                template: 'renewal-reminder',
                data: {
                    name: `${member.firstName} ${member.lastName}`,
                    expiryDate: member.membershipExpiry,
                    daysRemaining: Math.ceil(
                        (member.membershipExpiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                    ),
                },
            });

            // Send SMS
            await sendSMS({
                to: member.mobile,
                message: `Hi ${member.firstName}, your membership expires on ${member.membershipExpiry.toDateString()}. Renew now to continue enjoying our services!`,
            });
        }

        logger.info('Auto-reactivation workflow completed', { count: expiringMembers.length });

        return {
            success: true,
            notificationsSent: expiringMembers.length,
        };
    }

    /**
     * Bulk freeze memberships (e.g., for gym closure)
     */
    async bulkFreeze(branchId: string, freezeDays: number, reason: string) {
        const members = await Member.find({
            branchId,
            status: 'active',
        });

        const results = [];

        for (const member of members) {
            try {
                await this.freezeMembership({
                    memberId: member._id.toString(),
                    reason,
                    startDate: new Date(),
                    endDate: new Date(Date.now() + freezeDays * 24 * 60 * 60 * 1000),
                    freezeDays,
                });
                results.push({ memberId: member._id, success: true });
            } catch (error: any) {
                results.push({ memberId: member._id, success: false, error: error.message });
            }
        }

        logger.info('Bulk freeze completed', { branchId, totalMembers: members.length });

        return {
            success: true,
            totalMembers: members.length,
            results,
        };
    }
}

export default new MembershipLifecycleService();
