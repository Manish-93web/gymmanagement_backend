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
 * Get Member Offers
 */
export const getMemberOffers = async (req: Request, res: Response) => {
    try {
        const memberId = req.user?.role === 'member' ? req.user?._id : req.query.memberId; // Logic for member access vs staff access
        // Ideally member ID is fetched from user record if user is member
        // For now simplifying:
        // retention.service.ts calls GET /retention/member/offers without params, implies current user context?

        // If current user is member, use their memberId. But req.user is User, we need Member ID.
        // User schema doesn't export memberId directly, but Member has userId.
        // If Role is member, find Member doc where userId = req.user._id

        // Assuming current user context:
        // We need to implement lookup.

        res.status(200).json({ success: true, data: [] }); // Placeholder for now
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching member offers', error: (error as Error).message });
    }
};

/**
 * Redeem Offer
 */
export const redeemOffer = async (req: Request, res: Response) => {
    try {
        const { code } = req.body;
        // Logic to find offer by code and redeem
        res.status(200).json({ success: true, message: 'Offer redeemed' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error redeeming offer', error: (error as Error).message });
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
