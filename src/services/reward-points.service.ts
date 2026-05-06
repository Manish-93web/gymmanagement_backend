import RewardItem from '../models/RewardItem.model';
import RewardRedemption from '../models/RewardRedemption.model';
import Member from '../models/Member.model';
import logger from '../config/logger';

interface RewardItemConfig {
    name: string;
    description: string;
    category: 'merchandise' | 'discount' | 'service' | 'upgrade';
    pointsCost: number;
    stock?: number;
    imageUrl?: string;
    validUntil?: Date;
    tenantId: string;
}

class RewardPointsService {
    /**
     * Create reward item
     */
    async createRewardItem(config: RewardItemConfig) {
        const item = await RewardItem.create({
            ...config,
            isActive: true,
            redeemedCount: 0,
            createdAt: new Date(),
        });

        logger.info('Reward item created', { itemId: item._id });

        return item;
    }

    /**
     * Get all reward items
     */
    async getAllRewardItems(tenantId: string) {
        const items = await RewardItem.find({
            tenantId,
            isActive: true,
            $or: [
                { validUntil: { $gte: new Date() } },
                { validUntil: null },
            ],
        }).sort({ pointsCost: 1 });

        return items;
    }

    /**
     * Redeem reward
     */
    async redeemReward(memberId: string, itemId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const item = await RewardItem.findById(itemId);
        if (!item) throw new Error('Reward item not found');

        if (!item.isActive) {
            throw new Error('Reward item is not available');
        }

        if (item.stock !== undefined && item.stock <= 0) {
            throw new Error('Reward item is out of stock');
        }

        const memberPoints = member.gamification?.totalPoints || 0;

        if (memberPoints < item.pointsCost) {
            throw new Error('Insufficient points');
        }

        // Create redemption
        const redemption = await RewardRedemption.create({
            memberId,
            itemId,
            pointsSpent: item.pointsCost,
            status: 'pending',
            redeemedAt: new Date(),
        });

        // Deduct points
        await Member.findByIdAndUpdate(memberId, {
            $inc: {
                'gamification.totalPoints': -item.pointsCost,
                'gamification.pointsSpent': item.pointsCost,
            },
        });

        // Update item
        await RewardItem.findByIdAndUpdate(itemId, {
            $inc: {
                redeemedCount: 1,
                ...(item.stock !== undefined && { stock: -1 }),
            },
        });

        logger.info('Reward redeemed', { memberId, itemId, pointsSpent: item.pointsCost });

        return redemption;
    }

    /**
     * Get member redemptions
     */
    async getMemberRedemptions(memberId: string) {
        const redemptions = await RewardRedemption.find({ memberId })
            .populate('itemId')
            .sort({ redeemedAt: -1 });

        return redemptions;
    }

    /**
     * Update redemption status
     */
    async updateRedemptionStatus(
        redemptionId: string,
        status: 'pending' | 'approved' | 'delivered' | 'cancelled'
    ) {
        const redemption = await RewardRedemption.findById(redemptionId);
        if (!redemption) throw new Error('Redemption not found');

        // If cancelling, refund points
        if (status === 'cancelled' && redemption.status !== 'cancelled') {
            await Member.findByIdAndUpdate(redemption.memberId, {
                $inc: {
                    'gamification.totalPoints': redemption.pointsSpent,
                    'gamification.pointsSpent': -redemption.pointsSpent,
                },
            });

            // Restore stock
            await RewardItem.findByIdAndUpdate(redemption.rewardId, {
                $inc: {
                    redeemedCount: -1,
                    stock: 1,
                },
            });
        }

        redemption.status = status as any;
        if (status === 'delivered') {
            (redemption as any).deliveredAt = new Date();
        }
        await redemption.save();

        logger.info('Redemption status updated', { redemptionId, status });

        return redemption;
    }

    /**
     * Add points to member (manual)
     */
    async addPoints(memberId: string, points: number, reason: string) {
        await Member.findByIdAndUpdate(memberId, {
            $inc: { 'gamification.totalPoints': points },
        });

        logger.info('Points added manually', { memberId, points, reason });

        return {
            success: true,
            message: `${points} points added`,
        };
    }

    /**
     * Get points summary
     */
    async getPointsSummary(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        const redemptions = await RewardRedemption.find({ memberId });

        return {
            totalPoints: member.gamification?.totalPoints || 0,
            pointsSpent: member.gamification?.pointsSpent || 0,
            pointsEarned: (member.gamification?.totalPoints || 0) + (member.gamification?.pointsSpent || 0),
            redemptionCount: redemptions.length,
        };
    }

    /**
     * Get reward statistics
     */
    async getRewardStatistics(tenantId: string) {
        const totalItems = await RewardItem.countDocuments({ tenantId });
        const totalRedemptions = await RewardRedemption.countDocuments();

        const mostPopular = await RewardRedemption.aggregate([
            {
                $group: {
                    _id: '$itemId',
                    count: { $sum: 1 },
                },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'rewarditems',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'item',
                },
            },
        ]);

        return {
            totalItems,
            totalRedemptions,
            mostPopular,
        };
    }
}

export default new RewardPointsService();
