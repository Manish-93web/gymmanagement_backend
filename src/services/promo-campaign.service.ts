import PromoCampaign from '../models/PromoCampaign.model';
import Member from '../models/Member.model';
import Coupon from '../models/Coupon.model';
import WhatsAppService from './whatsapp.service';
import EmailCampaignService from './email-campaign.service';
import logger from '../config/logger';

interface PromoCampaignData {
    name: string;
    description: string;
    type: 'discount' | 'free_trial' | 'referral_bonus' | 'seasonal' | 'custom';
    channels: ('email' | 'sms' | 'whatsapp' | 'push')[];
    targetAudience: 'all' | 'new' | 'expired' | 'active' | 'custom';
    customMemberIds?: string[];
    discountType?: 'percentage' | 'fixed';
    discountValue?: number;
    startDate: Date;
    endDate: Date;
    budget?: number;
    tenantId: string;
}

class PromoCampaignService {
    /**
     * Create promotional campaign
     */
    async createCampaign(data: PromoCampaignData) {
        const campaign = await PromoCampaign.create({
            ...data,
            status: 'draft',
            createdAt: new Date(),
        });

        // Auto-create coupon if discount campaign
        if (data.type === 'discount' && data.discountValue) {
            const couponCode = `PROMO${campaign._id.toString().slice(-6).toUpperCase()}`;

            await Coupon.create({
                code: couponCode,
                type: data.discountType || 'percentage',
                value: data.discountValue,
                validFrom: data.startDate,
                validUntil: data.endDate,
                tenantId: data.tenantId,
                campaignId: campaign._id,
            });

            campaign.couponCode = couponCode;
            await campaign.save();
        }

        logger.info('Promo campaign created', { campaignId: campaign._id });

        return campaign;
    }

    /**
     * Launch campaign
     */
    async launchCampaign(campaignId: string) {
        const campaign = await PromoCampaign.findById(campaignId);

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        if (campaign.status !== 'draft') {
            throw new Error('Only draft campaigns can be launched');
        }

        // Get target members
        const members = await this.getTargetMembers(campaign);

        if (members.length === 0) {
            throw new Error('No members found for this campaign');
        }

        campaign.status = 'active';
        campaign.launchedAt = new Date();
        campaign.totalReach = members.length;
        await campaign.save();

        // Send through selected channels
        const results = {
            email: { sent: 0, failed: 0 },
            sms: { sent: 0, failed: 0 },
            whatsapp: { sent: 0, failed: 0 },
            push: { sent: 0, failed: 0 },
        };

        const memberIds = members.map((m) => m._id.toString());

        // Email
        if (campaign.channels.includes('email')) {
            try {
                const emailResult = await this.sendEmailPromo(campaign, memberIds);
                results.email = emailResult;
            } catch (error) {
                logger.error('Email promo failed', { error, campaignId });
            }
        }

        // WhatsApp
        if (campaign.channels.includes('whatsapp')) {
            try {
                const whatsappResult = await this.sendWhatsAppPromo(campaign, memberIds);
                results.whatsapp = whatsappResult;
            } catch (error) {
                logger.error('WhatsApp promo failed', { error, campaignId });
            }
        }

        // Update campaign stats
        campaign.emailsSent = results.email.sent;
        campaign.smsSent = results.sms.sent;
        campaign.whatsappSent = results.whatsapp.sent;
        await campaign.save();

        logger.info('Promo campaign launched', { campaignId, totalReach: members.length });

        return {
            success: true,
            campaignId,
            totalReach: members.length,
            results,
        };
    }

    /**
     * Send email promotion
     */
    private async sendEmailPromo(campaign: any, memberIds: string[]) {
        const emailContent = this.generateEmailContent(campaign);

        const emailCampaign = await EmailCampaignService.createCampaign({
            name: `Promo: ${campaign.name}`,
            subject: campaign.name,
            content: emailContent,
            targetAudience: 'custom',
            customMemberIds: memberIds,
            tenantId: campaign.tenantId,
        });

        const result = await EmailCampaignService.sendCampaign(emailCampaign._id.toString());

        return {
            sent: result.sent || 0,
            failed: result.failed || 0,
        };
    }

    /**
     * Send WhatsApp promotion
     */
    private async sendWhatsAppPromo(campaign: any, memberIds: string[]) {
        const message = this.generateWhatsAppMessage(campaign);

        const result = await WhatsAppService.sendBulkMessages({
            memberIds,
            message,
        });

        return {
            sent: result.successful || 0,
            failed: result.failed || 0,
        };
    }

    /**
     * Generate email content
     */
    private generateEmailContent(campaign: any): string {
        let content = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">${campaign.name}</h1>
        <p style="font-size: 16px; color: #666;">${campaign.description}</p>
    `;

        if (campaign.couponCode) {
            content += `
        <div style="background: #f0f0f0; padding: 20px; margin: 20px 0; text-align: center;">
          <h2 style="margin: 0; color: #333;">Use Code:</h2>
          <p style="font-size: 32px; font-weight: bold; color: #e74c3c; margin: 10px 0;">${campaign.couponCode}</p>
          <p style="color: #666;">Get ${campaign.discountValue}${campaign.discountType === 'percentage' ? '%' : '₹'} OFF!</p>
        </div>
      `;
        }

        content += `
        <p style="font-size: 14px; color: #999;">Offer valid until ${campaign.endDate.toDateString()}</p>
        <a href="#" style="display: inline-block; background: #e74c3c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px;">Claim Offer</a>
      </div>
    `;

        return content;
    }

    /**
     * Generate WhatsApp message
     */
    private generateWhatsAppMessage(campaign: any): string {
        let message = `🎉 ${campaign.name}\n\n${campaign.description}\n\n`;

        if (campaign.couponCode) {
            message += `Use code: *${campaign.couponCode}*\nGet ${campaign.discountValue}${campaign.discountType === 'percentage' ? '%' : '₹'} OFF! 💰\n\n`;
        }

        message += `Valid until: ${campaign.endDate.toDateString()}\n\nReply YES to claim this offer! 🏋️`;

        return message;
    }

    /**
     * Get target members
     */
    private async getTargetMembers(campaign: any) {
        let query: any = { tenantId: campaign.tenantId };

        switch (campaign.targetAudience) {
            case 'new':
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                query.createdAt = { $gte: thirtyDaysAgo };
                break;
            case 'expired':
                query.status = 'expired';
                break;
            case 'active':
                query.status = 'active';
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

        return await Member.find(query);
    }

    /**
     * Get campaign performance
     */
    async getCampaignPerformance(campaignId: string) {
        const campaign = await PromoCampaign.findById(campaignId);

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        // Get coupon usage if applicable
        let couponUsage = 0;
        let revenue = 0;

        if (campaign.couponCode) {
            const coupon = await Coupon.findOne({ code: campaign.couponCode });
            if (coupon) {
                couponUsage = coupon.usageCount || 0;
            }
        }

        const performance = {
            name: campaign.name,
            status: campaign.status,
            totalReach: campaign.totalReach || 0,
            emailsSent: campaign.emailsSent || 0,
            smsSent: campaign.smsSent || 0,
            whatsappSent: campaign.whatsappSent || 0,
            couponUsage,
            conversionRate: campaign.totalReach > 0 ? (couponUsage / campaign.totalReach) * 100 : 0,
            estimatedRevenue: revenue,
            roi: campaign.budget ? ((revenue - campaign.budget) / campaign.budget) * 100 : 0,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
        };

        return performance;
    }

    /**
     * Get all campaigns
     */
    async getAllCampaigns(tenantId: string) {
        const campaigns = await PromoCampaign.find({ tenantId }).sort({ createdAt: -1 });

        return campaigns;
    }

    /**
     * Stop campaign
     */
    async stopCampaign(campaignId: string) {
        const campaign = await PromoCampaign.findByIdAndUpdate(
            campaignId,
            {
                status: 'stopped',
                stoppedAt: new Date(),
            },
            { new: true }
        );

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        logger.info('Campaign stopped', { campaignId });

        return {
            success: true,
            message: 'Campaign stopped successfully',
        };
    }

    /**
     * Delete campaign
     */
    async deleteCampaign(campaignId: string) {
        const campaign = await PromoCampaign.findById(campaignId);

        if (!campaign) {
            throw new Error('Campaign not found');
        }

        if (campaign.status === 'active') {
            throw new Error('Cannot delete active campaign. Stop it first.');
        }

        await PromoCampaign.findByIdAndDelete(campaignId);

        logger.info('Campaign deleted', { campaignId });

        return {
            success: true,
            message: 'Campaign deleted successfully',
        };
    }
}

export default new PromoCampaignService();
