import Lead, { ILead, LeadStatus } from '../models/Lead.model';
import { generateReferralCode } from '../utils/helpers.utils';

export interface CreateLeadDTO {
    tenantId: string;
    branchId: string;
    firstName: string;
    lastName: string;
    email?: string;
    mobile: string;
    source: 'walk_in' | 'website' | 'referral' | 'social_media' | 'advertisement' | 'other';
    referredBy?: string;
    interestedIn?: string[];
    assignedTo?: string;
    notes?: string;
}

export interface UpdateLeadDTO {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    status?: LeadStatus;
    interestedIn?: string[];
    budget?: number;
    notes?: string;
}

export interface AddFollowUpDTO {
    date: Date;
    type: 'call' | 'email' | 'sms' | 'whatsapp' | 'visit';
    notes: string;
    outcome?: 'interested' | 'not_interested' | 'callback' | 'converted' | 'no_response';
    nextFollowUp?: Date;
}

export class CRMService {
    // Create lead
    async createLead(data: CreateLeadDTO): Promise<ILead> {
        const lead = await (Lead as any).create({
            ...data,
            status: 'new',
            statusHistory: [{
                status: 'new',
                changedAt: new Date(),
                changedBy: 'system',
            }],
        });

        return lead;
    }

    // Get lead by ID
    async getLeadById(leadId: string, tenantId: string): Promise<ILead | null> {
        return await Lead.findOne({ _id: leadId, tenantId });
    }

    // Update lead
    async updateLead(leadId: string, tenantId: string, data: UpdateLeadDTO): Promise<ILead | null> {
        const updateData: any = { ...data };

        // If status is being updated, add to status history
        if (data.status) {
            updateData.$push = {
                statusHistory: {
                    status: data.status,
                    changedAt: new Date(),
                    changedBy: 'system', // Would be actual user ID in production
                },
            };
        }

        return await Lead.findOneAndUpdate(
            { _id: leadId, tenantId },
            updateData,
            { new: true, runValidators: true }
        );
    }

    // Change lead status
    async updateLeadStatus(
        leadId: string,
        newStatus: LeadStatus,
        tenantId: string,
        changedBy: string = 'system'
    ): Promise<ILead | null> {
        return await Lead.findOneAndUpdate(
            { _id: leadId, tenantId },
            {
                $set: { status: newStatus },
                $push: {
                    statusHistory: {
                        status: newStatus,
                        changedAt: new Date(),
                        changedBy,
                    },
                },
            },
            { new: true }
        );
    }

    // Add follow-up
    async addFollowUp(
        leadId: string,
        data: AddFollowUpDTO,
        tenantId: string,
        userId: string = 'system'
    ): Promise<ILead | null> {
        const lead = await Lead.findOneAndUpdate(
            { _id: leadId, tenantId },
            {
                $push: {
                    followUps: {
                        ...data,
                        performedBy: userId,
                    },
                },
                $set: {
                    lastContactDate: data.date,
                    nextFollowUpDate: data.nextFollowUp,
                },
            },
            { new: true }
        );

        // Auto-update status based on outcome
        if (data.outcome === 'converted' && lead) {
            await this.updateLeadStatus(leadId, 'converted', tenantId, userId);
        } else if (data.outcome === 'not_interested' && lead) {
            await this.updateLeadStatus(leadId, 'lost', tenantId, userId);
        }

        return lead;
    }

    // Get leads with filters
    async getLeads(
        tenantId: string,
        branchId?: string,
        status?: LeadStatus,
        source?: string,
        assignedTo?: string,
        page: number = 1,
        limit: number = 20,
        search?: string,
        hasFollowUp?: boolean
    ): Promise<{ leads: ILead[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;
        if (status) filter.status = status;
        if (source) filter.source = source;
        if (assignedTo) filter.assignedTo = assignedTo;
        if (hasFollowUp) filter.nextFollowUpDate = { $exists: true, $ne: null };
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
            ];
        }

        const [leads, total] = await Promise.all([
            Lead.find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .populate('assignedTo', 'firstName lastName'),
            Lead.countDocuments(filter),
        ]);

        return { leads, total };
    }

    // Get leads requiring follow-up
    async getLeadsRequiringFollowUp(tenantId: string, branchId?: string): Promise<ILead[]> {
        const filter: any = {
            tenantId,
            status: { $in: ['new', 'contacted', 'qualified', 'negotiation'] },
            nextFollowUpDate: { $lte: new Date() },
        };

        if (branchId) filter.branchId = branchId;

        return await Lead.find(filter)
            .sort({ nextFollowUpDate: 1 })
            .populate('assignedTo', 'firstName lastName');
    }

    // Assign lead to user
    async assignLead(leadId: string, tenantId: string, userId: string): Promise<ILead | null> {
        return await Lead.findOneAndUpdate(
            { _id: leadId, tenantId },
            { $set: { assignedTo: userId } },
            { new: true }
        );
    }

    // Get lead statistics
    async getLeadStats(tenantId: string, branchId?: string): Promise<any> {
        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;

        const total = await Lead.countDocuments(filter);

        const byStatus = await Lead.aggregate([
            { $match: filter },
            { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        const bySource = await Lead.aggregate([
            { $match: filter },
            { $group: { _id: '$source', count: { $sum: 1 } } },
        ]);

        const conversionRate = await Lead.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    converted: {
                        $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] },
                    },
                },
            },
        ]);

        return {
            total,
            byStatus: byStatus.reduce((acc: any, curr: any) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
            bySource: bySource.reduce((acc: any, curr: any) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
            conversionRate: conversionRate[0]
                ? ((conversionRate[0].converted / conversionRate[0].total) * 100).toFixed(2)
                : 0,
        };
    }

    // Get sales funnel data
    async getSalesFunnel(tenantId: string, branchId?: string): Promise<any> {
        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;

        const funnel = await Lead.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const statusOrder = ['new', 'contacted', 'qualified', 'negotiation', 'converted', 'lost'];

        return statusOrder.map(status => ({
            status,
            count: funnel.find(f => f._id === status)?.count || 0,
        }));
    }
}

export default new CRMService();
