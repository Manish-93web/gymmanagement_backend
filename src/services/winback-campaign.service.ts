import WinbackCampaign from '../models/WinbackCampaign.model';
import WinbackRecipient from '../models/WinbackRecipient.model';
// import Member from '../models/Member.model'; // Removed unused
import InactivityAlert from '../models/InactivityAlert.model';
import EmailService from './email.service';
import WhatsAppService from './whatsapp.service';
import SMSService from './sms.service';
import logger from '../config/logger';

interface CampaignConfig {
    name: string;
    type: 'email' | 'sms' | 'whatsapp' | 'multi_channel';
    targetLevel: 'warning' | 'critical' | 'churned' | 'all';
    subject?: string;
    message: string;
    offerType?: 'discount' | 'free_session' | 'upgrade' | 'none';
    offerValue?: number;
    offerExpiry?: Date;
    tenantId: string;
}

class WinbackCampaignService {
    /**
     * Create win-back campaign
     */
    async createCampaign(config: CampaignConfig) {
        const campaign = await WinbackCampaign.create({
            ...config,
            status: 'draft',
            recipientCount: 0,
            sentCount: 0,
            openedCount: 0,
            convertedCount: 0,
            createdAt: new Date(),
        });

        logger.info('Win-back campaign created', { campaignId: campaign._id });

        return campaign;
    }

    /**
     * Send campaign
     */
    async sendCampaign(campaignId: string) {
        const campaign = await WinbackCampaign.findById(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        if (campaign.status === 'sent') {
            throw new Error('Campaign already sent');
        }

        // Get target members
        const query: any = {
            tenantId: campaign.tenantId,
            status: 'pending',
        };

        if (campaign.targetLevel !== 'all') {
            query.level = campaign.targetLevel;
        }

        const inactiveAlerts = await InactivityAlert.find(query).populate({
            path: 'memberId',
            populate: { path: 'userId' }
        });
        const members = inactiveAlerts.map((alert: any) => alert.memberId as any);

        let sentCount = 0;
        const results = {
            email: 0,
            sms: 0,
            whatsapp: 0,
            failed: 0,
        };

        for (const member of members) {
            try {
                // Personalize message
                const personalizedMessage = this.personalizeMessage(campaign.message, member, campaign);

                // Send based on campaign type
                if (campaign.type === 'email' || campaign.type === 'multi_channel') {
                    await EmailService.sendEmail(
                        member.userId.email,
                        campaign.subject || 'We Miss You!',
                        `<div>${personalizedMessage}</div>`
                    );
                    results.email++;
                }

                if (campaign.type === 'sms' || campaign.type === 'multi_channel') {
                    await SMSService.sendSMS(
                        member.userId.mobile,
                        personalizedMessage
                    );
                    results.sms++;
                }

                if (campaign.type === 'whatsapp' || campaign.type === 'multi_channel') {
                    await WhatsAppService.sendMessage({
                        to: member.userId.mobile,
                        message: personalizedMessage,
                    });
                    results.whatsapp++;
                }

                // Create recipient record
                await WinbackRecipient.create({
                    campaignId,
                    memberId: member._id,
                    status: 'sent',
                    sentAt: new Date(),
                });

                sentCount++;
            } catch (error) {
                logger.error('Failed to send win-back campaign', { error, memberId: member._id });
                results.failed++;
            }
        }

        // Update campaign
        campaign.status = 'sent';
        campaign.sentAt = new Date();
        campaign.recipientCount = members.length;
        campaign.sentCount = sentCount;
        await campaign.save();

        logger.info('Win-back campaign sent', {
            campaignId,
            recipients: members.length,
            sent: sentCount,
            results,
        });

        return {
            success: true,
            recipientCount: members.length,
            sentCount,
            results,
        };
    }

    /**
     * Personalize message
     */
    private personalizeMessage(template: string, member: any, campaign: any): string {
        const user = member.userId as any;
        let message = template
            .replace(/{firstName}/g, user.firstName)
            .replace(/{lastName}/g, user.lastName)
            .replace(/{name}/g, `${user.firstName} ${user.lastName}`);

        if (campaign.offerType && campaign.offerValue) {
            const offerText = this.getOfferText(campaign.offerType, campaign.offerValue);
            message += `\n\n${offerText}`;
        }

        return message;
    }

    /**
     * Get offer text
     */
    private getOfferText(offerType: string, offerValue: number): string {
        switch (offerType) {
            case 'discount':
                return `🎁 Special Offer: Get ${offerValue}% OFF on your next renewal!`;
            case 'free_session':
                return `🎁 Special Offer: Get ${offerValue} FREE personal training sessions!`;
            case 'upgrade':
                return `🎁 Special Offer: Upgrade to premium for just ₹${offerValue}!`;
            default:
                return '';
        }
    }

    /**
     * Track campaign open
     */
    async trackOpen(campaignId: string, memberId: string) {
        await WinbackRecipient.findOneAndUpdate(
            { campaignId, memberId },
            { status: 'opened', openedAt: new Date() }
        );

        await WinbackCampaign.findByIdAndUpdate(campaignId, {
            $inc: { openedCount: 1 },
        });

        return {
            success: true,
        };
    }

    /**
     * Track conversion
     */
    async trackConversion(campaignId: string, memberId: string) {
        await WinbackRecipient.findOneAndUpdate(
            { campaignId, memberId },
            { status: 'converted', convertedAt: new Date() }
        );

        await WinbackCampaign.findByIdAndUpdate(campaignId, {
            $inc: { convertedCount: 1 },
        });

        logger.info('Win-back conversion tracked', { campaignId, memberId });

        return {
            success: true,
        };
    }

    /**
     * Get campaign statistics
     */
    async getCampaignStats(campaignId: string) {
        const campaign = await WinbackCampaign.findById(campaignId);
        if (!campaign) throw new Error('Campaign not found');

        const openRate = campaign.sentCount > 0
            ? ((campaign.openedCount / campaign.sentCount) * 100).toFixed(1)
            : 0;

        const conversionRate = campaign.sentCount > 0
            ? ((campaign.convertedCount / campaign.sentCount) * 100).toFixed(1)
            : 0;

        return {
            recipientCount: campaign.recipientCount,
            sentCount: campaign.sentCount,
            openedCount: campaign.openedCount,
            convertedCount: campaign.convertedCount,
            openRate: `${openRate}%`,
            conversionRate: `${conversionRate}%`,
        };
    }

    /**
     * Get all campaigns
     */
    async getAllCampaigns(tenantId: string) {
        const campaigns = await WinbackCampaign.find({ tenantId }).sort({ createdAt: -1 });

        return campaigns;
    }

    /**
     * Auto-send win-back campaigns (run daily)
     */
    async autoSendWinbackCampaigns(tenantId: string) {
        // Auto-send for critical members (14 days inactive)
        const criticalCampaign = await this.createCampaign({
            name: 'Auto Win-back - Critical',
            type: 'multi_channel',
            targetLevel: 'critical',
            subject: 'We Miss You at the Gym!',
            message: 'Hi {firstName}, we noticed you haven\'t been to the gym in a while. Come back and get back on track!',
            offerType: 'discount',
            offerValue: 20,
            offerExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            tenantId,
        });

        await this.sendCampaign(criticalCampaign._id.toString());

        return {
            success: true,
            campaignId: criticalCampaign._id,
        };
    }
}

export default new WinbackCampaignService();
