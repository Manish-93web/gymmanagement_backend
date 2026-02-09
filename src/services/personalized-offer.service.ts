import PersonalizedOffer from '../models/PersonalizedOffer.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Payment from '../models/Payment.model';
import InactivityDetectionService from './inactivity-detection.service';
import logger from '../config/logger';

interface OfferConfig {
    memberId: string;
    type: 'discount' | 'free_session' | 'upgrade' | 'freeze_waiver' | 'referral_bonus';
    value: number;
    description: string;
    expiryDate: Date;
    conditions?: string[];
    tenantId: string;
}

class PersonalizedOfferService {
    /**
     * Generate personalized offer based on member behavior
     */
    async generatePersonalizedOffer(memberId: string) {
        const member = await Member.findById(memberId);
        if (!member) throw new Error('Member not found');

        // Get member behavior data
        const [churnRisk, last30DaysAttendance, totalSpent, inactivityStatus] = await Promise.all([
            InactivityDetectionService.predictChurnRisk(memberId),
            Attendance.countDocuments({
                memberId,
                checkInTime: {
                    $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                },
            }),
            Payment.aggregate([
                { $match: { memberId: member._id } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            InactivityDetectionService.getMemberInactivityStatus(memberId),
        ]);

        const totalSpentAmount = totalSpent[0]?.total || 0;

        // Determine offer based on behavior
        let offerConfig: Partial<OfferConfig> | null = null;

        // High churn risk - aggressive offer
        if (churnRisk >= 70) {
            offerConfig = {
                type: 'discount',
                value: 30,
                description: 'Special 30% discount on your next renewal - We want you back!',
                expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                conditions: ['Valid for next renewal only', 'Cannot be combined with other offers'],
            };
        }
        // Medium churn risk
        else if (churnRisk >= 40) {
            offerConfig = {
                type: 'free_session',
                value: 2,
                description: 'Get 2 FREE personal training sessions to get back on track!',
                expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                conditions: ['Must be used within 14 days', 'Subject to trainer availability'],
            };
        }
        // Inactive but low risk - gentle nudge
        else if (inactivityStatus.isInactive) {
            offerConfig = {
                type: 'freeze_waiver',
                value: 1,
                description: 'Free membership freeze for 1 month - No questions asked!',
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                conditions: ['Can be activated anytime', 'One-time offer'],
            };
        }
        // High value member - retention offer
        else if (totalSpentAmount > 10000 && last30DaysAttendance > 12) {
            offerConfig = {
                type: 'upgrade',
                value: 50,
                description: 'Exclusive 50% OFF on premium membership upgrade - You deserve it!',
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                conditions: ['Upgrade to premium plan', 'Lock in this rate for 6 months'],
            };
        }
        // Active member - referral incentive
        else if (last30DaysAttendance > 15) {
            offerConfig = {
                type: 'referral_bonus',
                value: 500,
                description: 'Refer a friend and get ₹500 credit - Share the fitness journey!',
                expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
                conditions: ['Friend must join and complete 1 month', 'Credit applied to your account'],
            };
        }

        if (!offerConfig) {
            return null; // No offer needed
        }

        // Create offer
        const offer = await PersonalizedOffer.create({
            memberId,
            tenantId: member.tenantId,
            ...offerConfig,
            status: 'active',
            churnRiskScore: churnRisk,
            createdAt: new Date(),
        });

        logger.info('Personalized offer generated', {
            memberId,
            offerType: offerConfig.type,
            churnRisk,
        });

        return offer;
    }

    /**
     * Get member offers
     */
    async getMemberOffers(memberId: string) {
        const offers = await PersonalizedOffer.find({
            memberId,
            status: 'active',
            expiryDate: { $gte: new Date() },
        }).sort({ createdAt: -1 });

        return offers;
    }

    /**
     * Redeem offer
     */
    async redeemOffer(offerId: string, memberId: string) {
        const offer = await PersonalizedOffer.findById(offerId);
        if (!offer) throw new Error('Offer not found');

        if (offer.memberId.toString() !== memberId) {
            throw new Error('Offer does not belong to this member');
        }

        if (offer.status !== 'active') {
            throw new Error('Offer is not active');
        }

        if (offer.expiryDate < new Date()) {
            throw new Error('Offer has expired');
        }

        offer.status = 'redeemed';
        offer.redeemedAt = new Date();
        await offer.save();

        logger.info('Offer redeemed', { offerId, memberId });

        return {
            success: true,
            offer,
        };
    }

    /**
     * Expire old offers (run daily)
     */
    async expireOldOffers() {
        const result = await PersonalizedOffer.updateMany(
            {
                status: 'active',
                expiryDate: { $lt: new Date() },
            },
            {
                status: 'expired',
            }
        );

        logger.info('Old offers expired', { count: result.modifiedCount });

        return {
            success: true,
            expiredCount: result.modifiedCount,
        };
    }

    /**
     * Get offer statistics
     */
    async getOfferStats(tenantId: string) {
        const totalOffers = await PersonalizedOffer.countDocuments({ tenantId });
        const activeOffers = await PersonalizedOffer.countDocuments({ tenantId, status: 'active' });
        const redeemedOffers = await PersonalizedOffer.countDocuments({ tenantId, status: 'redeemed' });
        const expiredOffers = await PersonalizedOffer.countDocuments({ tenantId, status: 'expired' });

        const offersByType = await PersonalizedOffer.aggregate([
            { $match: { tenantId } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
        ]);

        const redemptionRate = totalOffers > 0
            ? ((redeemedOffers / totalOffers) * 100).toFixed(1)
            : 0;

        return {
            totalOffers,
            activeOffers,
            redeemedOffers,
            expiredOffers,
            offersByType,
            redemptionRate: `${redemptionRate}%`,
        };
    }

    /**
     * Auto-generate offers for at-risk members (run daily)
     */
    async autoGenerateOffers(tenantId: string) {
        const members = await Member.find({ tenantId, status: 'active' });

        let generatedCount = 0;

        for (const member of members) {
            // Check if member already has active offers
            const existingOffers = await PersonalizedOffer.countDocuments({
                memberId: member._id,
                status: 'active',
                expiryDate: { $gte: new Date() },
            });

            if (existingOffers > 0) continue;

            // Check churn risk
            const churnRisk = await InactivityDetectionService.predictChurnRisk(member._id.toString());

            // Only generate for medium to high risk members
            if (churnRisk >= 40) {
                await this.generatePersonalizedOffer(member._id.toString());
                generatedCount++;
            }
        }

        logger.info('Auto-generated personalized offers', { tenantId, count: generatedCount });

        return {
            success: true,
            generatedCount,
        };
    }
}

export default new PersonalizedOfferService();
