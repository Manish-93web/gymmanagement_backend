import { Request, Response } from 'express';
import Member, { IMember } from '../models/Member.model';
import WinbackCampaign from '../models/WinbackCampaign.model';
import PersonalizedOffer from '../models/PersonalizedOffer.model';
import RetentionAction from '../models/RetentionAction.model';
import mongoose from 'mongoose';

/**
 * Get Inactivity Stats
 */
export const getInactivityStats = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const query: any = { status: 'active' }; // Only consider active members for risk analysis? Or all?
        if (tenantId) query.tenantId = tenantId;

        const members = await Member.find(query).select('lastCheckIn createdAt');

        const now = new Date();
        let low = 0, medium = 0, high = 0, critical = 0;

        members.forEach(member => {
            const lastActivity = member.lastCheckIn || member.createdAt;
            const daysInactive = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));

            if (daysInactive > 60) critical++;
            else if (daysInactive > 30) high++;
            else if (daysInactive > 14) medium++;
            else low++;
        });

        // Simplified calculation
        const totalActive = members.length;
        const retentionRate = totalActive > 0 ? ((totalActive - critical) / totalActive) * 100 : 100;

        res.status(200).json({
            success: true,
            data: {
                atRiskCount: high + medium,
                criticalCount: critical,
                churnedCount: 0, // Need churn definition
                totalInactive: critical + high + medium,
                retentionRate: Math.round(retentionRate),
                riskLevels: { low, medium, high, critical }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching inactivity stats', error: (error as Error).message });
    }
};

/**
 * Get Inactive Members
 */
export const getInactiveMembers = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const { riskLevel, minDays, limit = 20 } = req.query;

        const query: any = { status: 'active' };
        if (tenantId) query.tenantId = tenantId;

        // This is inefficient for large datasets, better to use aggregation or stored risk score
        // For now, implementing basic fetching
        const members = await Member.find(query)
            .select('firstName lastName email mobile lastCheckIn createdAt status profilePicture membershipNumber')
            .limit(1000); // Fetch mostly recent/active ones

        const now = new Date();
        const inactiveMembers = members.map(m => {
            const lastActivity = m.lastCheckIn || m.createdAt;
            const daysInactive = Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));

            let level = 'low';
            let score = 0;
            if (daysInactive > 60) { level = 'critical'; score = 90; }
            else if (daysInactive > 30) { level = 'high'; score = 70; }
            else if (daysInactive > 14) { level = 'medium'; score = 40; }

            return {
                _id: m._id,
                firstName: m.firstName,
                lastName: m.lastName,
                profilePicture: m.personalInfo?.profilePicture,
                email: m.email,
                phoneNumber: m.mobile,
                lastVisit: lastActivity,
                daysInactive,
                riskScore: score,
                riskLevel: level,
                membershipType: 'Standard', // Placeholder
                totalVisits: 0 // Placeholder
            };
        });

        // Filter
        let filtered = inactiveMembers;
        if (riskLevel) {
            filtered = filtered.filter(m => m.riskLevel === riskLevel);
        }
        if (minDays) {
            filtered = filtered.filter(m => m.daysInactive >= Number(minDays));
        }

        // Sort by inactivity desc
        filtered.sort((a, b) => b.daysInactive - a.daysInactive);

        res.status(200).json({ success: true, data: filtered.slice(0, Number(limit)) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching inactive members', error: (error as Error).message });
    }
};

/**
 * Get Win-back Campaigns
 */
export const getCampaigns = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const query: any = {};
        if (tenantId) query.tenantId = tenantId;

        const campaigns = await WinbackCampaign.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: campaigns });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching campaigns', error: (error as Error).message });
    }
};

/**
 * Create Win-back Campaign
 */
export const createCampaign = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? req.body.tenantId : req.user?.tenantId;
        const campaign = await WinbackCampaign.create({ ...req.body, tenantId });
        res.status(201).json({ success: true, data: campaign });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error creating campaign', error: (error as Error).message });
    }
};

/**
 * Get Campaign By ID
 */
export const getCampaignById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const query: any = { _id: id };
        if (tenantId) query.tenantId = tenantId;

        const campaign = await WinbackCampaign.findOne(query);
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

        res.status(200).json({ success: true, data: campaign });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching campaign', error: (error as Error).message });
    }
};

/**
 * Get Personalized Offers
 */
export const getOffers = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const { segment } = req.query;
        const query: any = {};
        if (tenantId) query.tenantId = tenantId;
        if (segment) query.targetSegment = segment;

        const offers = await PersonalizedOffer.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: offers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching offers', error: (error as Error).message });
    }
};

/**
 * Get Member Offers — for member role: looks up their Member doc via userId,
 * then returns their active/pending offers. Staff can pass ?memberId=.
 */
export const getMemberOffers = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        let memberId: mongoose.Types.ObjectId | string | undefined;

        if (req.user?.role === 'member') {
            // Look up the Member document for this logged-in user
            const memberDoc = await Member.findOne({ userId: req.user._id }).select('_id');
            if (!memberDoc) return res.status(404).json({ success: false, message: 'Member record not found' });
            memberId = memberDoc._id as mongoose.Types.ObjectId;
        } else {
            memberId = req.query.memberId as string;
            if (!memberId) return res.status(400).json({ success: false, message: 'memberId query param required for non-member roles' });
        }

        const query: any = { memberId, status: { $in: ['active', 'pending', 'sent'] } };
        if (tenantId) query.tenantId = tenantId;

        // Expire any offers past their expiryDate
        await PersonalizedOffer.updateMany(
            { ...query, expiryDate: { $lt: new Date() } },
            { $set: { status: 'expired' } }
        );

        const offers = await PersonalizedOffer.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: offers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching member offers', error: (error as Error).message });
    }
};

/**
 * Redeem Offer — marks offer as redeemed for the current member.
 * Body: { offerId }
 */
export const redeemOffer = async (req: Request, res: Response) => {
    try {
        const { offerId } = req.body;
        if (!offerId) return res.status(400).json({ success: false, message: 'offerId is required' });

        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const query: any = { _id: offerId };
        if (tenantId) query.tenantId = tenantId;

        const offer = await PersonalizedOffer.findOne(query);
        if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
        if (offer.status === 'redeemed') return res.status(409).json({ success: false, message: 'Offer already redeemed' });
        if (offer.status === 'expired' || (offer.expiryDate && offer.expiryDate < new Date())) {
            return res.status(410).json({ success: false, message: 'Offer has expired' });
        }

        offer.status = 'redeemed';
        offer.redeemedAt = new Date();
        await offer.save();

        // Log a retention action for this redemption
        await RetentionAction.create({
            tenantId: offer.tenantId,
            memberId: offer.memberId,
            type: 'offer',
            status: 'completed',
            notes: `Redeemed offer: ${offer.title || offer.type} (value: ${offer.value})`,
            performedBy: req.user?._id,
            completedAt: new Date(),
        });

        res.status(200).json({ success: true, message: 'Offer redeemed successfully', data: offer });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error redeeming offer', error: (error as Error).message });
    }
};

/**
 * Send Offer to a Member — creates a PersonalizedOffer and logs a RetentionAction.
 * Body fields are all optional; sensible defaults are applied.
 */
export const sendOffer = async (req: Request, res: Response) => {
    try {
        const memberId = String(req.params.memberId);
        const tenantId = req.tenantId as string | undefined;

        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });
        if (!mongoose.Types.ObjectId.isValid(memberId)) {
            return res.status(400).json({ success: false, message: 'Invalid memberId' });
        }

        const tid = new mongoose.Types.ObjectId(tenantId);
        const mid = new mongoose.Types.ObjectId(memberId);

        const member = await Member.findOne({ _id: mid, tenantId: tid }).select('firstName lastName email');
        if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 30);

        const body = req.body ?? {};
        const offerDoc = await PersonalizedOffer.create({
            tenantId: tid,
            memberId: mid,
            type: body.type ?? 'discount',
            title: body.title ?? 'Special Re-engagement Offer',
            description: body.description ?? `We miss you, ${member.firstName}! Here is a special offer to welcome you back.`,
            value: body.value ?? 10,
            expiryDate: body.expiryDate ? new Date(body.expiryDate) : expiryDate,
            status: 'sent',
            sentAt: new Date(),
        });

        await RetentionAction.create({
            tenantId: tid,
            memberId: mid,
            type: 'offer',
            status: 'completed',
            notes: `Sent offer: ${offerDoc.title} (${offerDoc.type}, value: ${offerDoc.value})`,
            performedBy: req.user?._id,
            completedAt: new Date(),
        });

        const offer = offerDoc;

        res.status(201).json({ success: true, message: 'Offer sent successfully', data: offer });
    } catch (error) {
        console.error('[sendOffer] error:', error);
        res.status(500).json({ success: false, message: 'Error sending offer', error: (error as Error).message });
    }
};

/**
 * Log Retention Action
 */
export const logAction = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? req.body.tenantId : req.user?.tenantId;
        const action = await RetentionAction.create({
            ...req.body,
            tenantId,
            performedBy: req.user?._id
        });
        res.status(201).json({ success: true, data: action });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error logging action', error: (error as Error).message });
    }
};

/**
 * Get Member Actions
 */
export const getMemberActions = async (req: Request, res: Response) => {
    try {
        const { memberId } = req.params;
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const query: any = { memberId };
        if (tenantId) query.tenantId = tenantId;

        const actions = await RetentionAction.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: actions });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching actions', error: (error as Error).message });
    }
};
