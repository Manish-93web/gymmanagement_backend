import nodemailer from 'nodemailer';
import Member from '../models/Member.model';
import EmailCampaign from '../models/EmailCampaign.model';
import logger from '../config/logger';

interface CampaignData {
    name: string;
    subject: string;
    content: string;
    targetAudience: 'all' | 'active' | 'expired' | 'trial' | 'custom';
    customMemberIds?: string[];
    scheduledAt?: Date;
    tenantId: string;
}

class EmailCampaignService {
    private transporter: nodemailer.Transporter;

    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: parseInt(process.env.EMAIL_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
    }

    /**
     * Create email campaign
     */
    async createCampaign(data: CampaignData) {
        const campaign = await EmailCampaign.create({
            ...data,
            status: data.scheduledAt ? 'scheduled' : 'draft',
            createdAt: new Date(),
        });

        logger.info('Email campaign created', { campaignId: campaign._id });

        return campaign;
    }

    /**
     * Send campaign
     */
    async sendCampaign(campaignId: string) {
        const campaign = await EmailCampaign.findById(campaignId);

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        // Get target members
        const members = await this.getTargetMembers(campaign);

        if (members.length === 0) {
            throw new Error('No members found for this campaign');
        }

        // Update campaign status
        campaign.status = 'sending';
        campaign.stats = campaign.stats || {};
        campaign.stats.totalRecipients = members.length;
        await campaign.save();

        const results = [];

        for (const member of members) {
            try {
                await this.sendEmail(member, campaign);

                results.push({
                    memberId: member._id,
                    email: member.email,
                    success: true,
                });

                campaign.stats.sentCount = (campaign.stats.sentCount || 0) + 1;
            } catch (error: any) {
                results.push({
                    memberId: member._id,
                    email: member.email,
                    success: false,
                    error: error.message,
                });

                campaign.stats.failedCount = (campaign.stats.failedCount || 0) + 1;
            }

            // Rate limiting - wait 100ms between emails
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Update campaign status
        campaign.status = 'completed';
        campaign.completedAt = new Date();
        campaign.stats.totalRecipients = members.length;
        campaign.stats.sentCount = (campaign.stats.sentCount || 0); // Already incremented in loop? No, handled below
        // Actually the loop handled stats directly on campaign object, but they are in stats object in model.
        // I need to update the loop logic too.

        logger.info('Email campaign sent', {
            campaignId,
            total: members.length,
            sent: campaign.stats?.sentCount,
            failed: campaign.stats?.failedCount,
        });

        return {
            success: true,
            total: members.length,
            sent: campaign.stats?.sentCount || 0,
            failed: campaign.stats?.failedCount || 0,
            results,
        };
    }

    /**
     * Get target members based on audience
     */
    private async getTargetMembers(campaign: any) {
        let query: any = { tenantId: campaign.tenantId };

        switch (campaign.targetAudience) {
            case 'active':
                query.status = 'active';
                break;
            case 'expired':
                query.status = 'expired';
                break;
            case 'trial':
                query.status = 'trial';
                break;
            case 'custom':
                if (campaign.customMemberIds && campaign.customMemberIds.length > 0) {
                    query._id = { $in: campaign.customMemberIds };
                }
                break;
            case 'all':
            default:
                // No additional filter
                break;
        }

        return await Member.find(query).select('firstName lastName email');
    }

    /**
     * Send individual email
     */
    private async sendEmail(member: any, campaign: any) {
        const personalizedContent = this.personalizeContent(campaign.content, member);

        const mailOptions = {
            from: `${process.env.EMAIL_FROM_NAME} <${process.env.EMAIL_FROM}>`,
            to: member.email,
            subject: campaign.subject,
            html: personalizedContent,
        };

        await this.transporter.sendMail(mailOptions);
    }

    /**
     * Personalize email content
     */
    private personalizeContent(template: string, member: any): string {
        return template
            .replace(/\{firstName\}/g, member.firstName)
            .replace(/\{lastName\}/g, member.lastName)
            .replace(/\{email\}/g, member.email)
            .replace(/\{membershipNumber\}/g, member.membershipNumber || '');
    }

    /**
     * Schedule campaign
     */
    async scheduleCampaign(campaignId: string, scheduledAt: Date) {
        const campaign = await EmailCampaign.findByIdAndUpdate(
            campaignId,
            {
                scheduledAt,
                status: 'scheduled',
            },
            { new: true }
        );

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        logger.info('Campaign scheduled', { campaignId, scheduledAt });

        return {
            success: true,
            message: 'Campaign scheduled successfully',
            campaign,
        };
    }

    /**
     * Process scheduled campaigns (cron job)
     */
    async processScheduledCampaigns() {
        const now = new Date();

        const campaigns = await EmailCampaign.find({
            status: 'scheduled',
            scheduledAt: { $lte: now },
        });

        const results = [];

        for (const campaign of campaigns) {
            try {
                await this.sendCampaign(campaign._id.toString());
                results.push({ campaignId: campaign._id, success: true });
            } catch (error: any) {
                results.push({ campaignId: campaign._id, success: false, error: error.message });
            }
        }

        logger.info('Scheduled campaigns processed', { count: campaigns.length });

        return results;
    }

    /**
     * Get campaign statistics
     */
    async getCampaignStats(campaignId: string) {
        const campaign = await EmailCampaign.findById(campaignId);

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        const stats = {
            name: campaign.name,
            status: campaign.status,
            totalRecipients: campaign.stats?.totalRecipients || 0,
            sentCount: campaign.stats?.sentCount || 0,
            failedCount: campaign.stats?.failedCount || 0,
            deliveryRate:
                (campaign.stats?.totalRecipients || 0) > 0
                    ? ((campaign.stats?.sentCount || 0) / (campaign.stats?.totalRecipients || 1)) * 100
                    : 0,
            createdAt: campaign.createdAt,
            completedAt: campaign.completedAt,
        };

        return stats;
    }

    /**
     * Get all campaigns
     */
    async getAllCampaigns(tenantId: string) {
        const campaigns = await EmailCampaign.find({ tenantId }).sort({ createdAt: -1 });

        return campaigns;
    }

    /**
     * Delete campaign
     */
    async deleteCampaign(campaignId: string) {
        const campaign = await EmailCampaign.findById(campaignId);

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        if (campaign.status === 'sending') {
            throw new Error('Cannot delete campaign while sending');
        }

        await EmailCampaign.findByIdAndDelete(campaignId);

        logger.info('Campaign deleted', { campaignId });

        return {
            success: true,
            message: 'Campaign deleted successfully',
        };
    }
}

export default new EmailCampaignService();
