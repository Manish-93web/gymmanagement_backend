import cron from 'node-cron';
import Member from '../models/Member.model';
import BiometricMember from '../models/BiometricMember.model';
import logger from '../config/logger';

/**
 * MembershipExpiryWorker
 *
 * Runs daily at 1:00 AM.
 * 1. Finds all active members whose membershipExpiry has passed.
 * 2. Marks them as 'expired'.
 * 3. Deactivates their BiometricMember enrollment so the device
 *    no longer recognises their punch in the fast-path lookup.
 *
 * When a member renews, changeMemberStatus / reactivateMember
 * in member.service.ts re-activates the enrollment.
 */

const INACTIVE_STATUSES = ['expired', 'paused', 'frozen', 'archived', 'cancelled'];

async function runExpiryCheck(): Promise<void> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 1. Find active members whose membership date has already passed
    const expiredMembers = await Member.find({
        status: 'active',
        membershipExpiry: { $lt: startOfToday },
    }).select('_id tenantId firstName lastName membershipExpiry').lean();

    if (!expiredMembers.length) {
        logger.info('[MembershipExpiry] No memberships to expire today.');
        return;
    }

    const memberIds = expiredMembers.map((m: any) => m._id);

    // 2. Bulk-mark as expired + append statusHistory entry
    const bulkOps = expiredMembers.map((m: any) => ({
        updateOne: {
            filter: { _id: m._id },
            update: {
                $set: { status: 'expired' as const },
                $push: {
                    statusHistory: {
                        status: 'expired' as const,
                        changedAt: new Date(),
                        reason: 'Membership expiry — auto-expired by system',
                    },
                },
            },
        },
    }));
    await Member.bulkWrite(bulkOps as any);

    // 3. Deactivate BiometricMember enrollments for all expired members
    const bioResult = await BiometricMember.updateMany(
        { memberId: { $in: memberIds }, active: true },
        { $set: { active: false } }
    );

    logger.info(
        `[MembershipExpiry] Expired ${expiredMembers.length} member(s); ` +
        `deactivated ${bioResult.modifiedCount} biometric enrollment(s).`
    );

    for (const m of expiredMembers) {
        logger.info(
            `[MembershipExpiry]  → ${(m as any).firstName} ${(m as any).lastName} ` +
            `(expiry: ${new Date((m as any).membershipExpiry).toISOString().slice(0, 10)})`
        );
    }
}

class MembershipExpiryWorker {
    private static instance: MembershipExpiryWorker;

    private constructor() {
        // Daily at 01:00 AM
        cron.schedule('0 1 * * *', async () => {
            logger.info('[MembershipExpiry] Running daily expiry check...');
            try {
                await runExpiryCheck();
            } catch (err: any) {
                logger.error('[MembershipExpiry] Expiry check failed:', err.message);
            }
        });

        logger.info('✅ MembershipExpiryWorker scheduled (daily 1 AM)');
    }

    public static getInstance(): MembershipExpiryWorker {
        if (!MembershipExpiryWorker.instance) {
            MembershipExpiryWorker.instance = new MembershipExpiryWorker();
        }
        return MembershipExpiryWorker.instance;
    }
}

export { runExpiryCheck };
export default MembershipExpiryWorker.getInstance();
