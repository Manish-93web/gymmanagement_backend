import twilio from 'twilio';
import Member from '../models/Member.model';
import logger from '../config/logger';

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

interface WhatsAppMessage {
    to: string;
    message: string;
    mediaUrl?: string;
}

interface BulkWhatsAppMessage {
    memberIds: string[];
    message: string;
    mediaUrl?: string;
}

class WhatsAppService {
    /**
     * Send WhatsApp message
     */
    async sendMessage(data: WhatsAppMessage) {
        const { to, message, mediaUrl } = data;

        try {
            const messageData: any = {
                from: whatsappNumber,
                to: `whatsapp:${to}`,
                body: message,
            };

            if (mediaUrl) {
                messageData.mediaUrl = [mediaUrl];
            }

            const response = await client.messages.create(messageData);

            logger.info('WhatsApp message sent', { to, messageId: response.sid });

            return {
                success: true,
                messageId: response.sid,
                status: response.status,
            };
        } catch (error: any) {
            logger.error('WhatsApp message failed', { error, to });
            throw new Error(`Failed to send WhatsApp message: ${error.message}`);
        }
    }

    /**
     * Send bulk WhatsApp messages
     */
    async sendBulkMessages(data: BulkWhatsAppMessage) {
        const { memberIds, message, mediaUrl } = data;

        const members = await Member.find({ _id: { $in: memberIds } });

        const results = [];

        for (const member of members) {
            try {
                const result = await this.sendMessage({
                    to: member.mobile,
                    message: this.personalizeMessage(message, member),
                    mediaUrl,
                });

                results.push({
                    memberId: member._id,
                    mobile: member.mobile,
                    success: true,
                    messageId: result.messageId,
                });
            } catch (error: any) {
                results.push({
                    memberId: member._id,
                    mobile: member.mobile,
                    success: false,
                    error: error.message,
                });
            }

            // Rate limiting - wait 1 second between messages
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        logger.info('Bulk WhatsApp messages sent', {
            total: memberIds.length,
            successful: results.filter((r) => r.success).length,
        });

        return {
            success: true,
            total: memberIds.length,
            successful: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
            results,
        };
    }

    /**
     * Send membership expiry reminder
     */
    async sendExpiryReminder(memberId: string) {
        const member = await Member.findById(memberId);

        if (!member) {
            throw new Error('Member not found');
        }

        const daysRemaining = Math.ceil(
            (member.membershipExpiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
        );

        const message = `Hi ${member.firstName}! 👋\n\nYour membership expires in ${daysRemaining} days (${member.membershipExpiry.toDateString()}).\n\nRenew now to continue enjoying our services! 💪\n\nReply RENEW to get started.`;

        return await this.sendMessage({
            to: member.mobile,
            message,
        });
    }

    /**
     * Send class reminder
     */
    async sendClassReminder(memberId: string, className: string, classTime: Date) {
        const member = await Member.findById(memberId);

        if (!member) {
            throw new Error('Member not found');
        }

        const message = `Hi ${member.firstName}! 🏋️\n\nReminder: You have "${className}" class today at ${classTime.toLocaleTimeString()}.\n\nSee you there! 💪`;

        return await this.sendMessage({
            to: member.mobile,
            message,
        });
    }

    /**
     * Send payment confirmation
     */
    async sendPaymentConfirmation(memberId: string, amount: number, planName: string) {
        const member = await Member.findById(memberId);

        if (!member) {
            throw new Error('Member not found');
        }

        const message = `Hi ${member.firstName}! ✅\n\nPayment of ₹${amount} received successfully for ${planName}.\n\nThank you for your payment! 🙏\n\nYour membership is now active.`;

        return await this.sendMessage({
            to: member.mobile,
            message,
        });
    }

    /**
     * Send birthday wishes
     */
    async sendBirthdayWish(memberId: string) {
        const member = await Member.findById(memberId);

        if (!member) {
            throw new Error('Member not found');
        }

        const message = `🎉 Happy Birthday ${member.firstName}! 🎂\n\nWishing you a fantastic year ahead filled with health and fitness! 💪\n\nEnjoy a special birthday workout on us today! 🎁`;

        return await this.sendMessage({
            to: member.mobile,
            message,
        });
    }

    /**
     * Send promotional message
     */
    async sendPromotion(memberIds: string[], promoMessage: string, imageUrl?: string) {
        return await this.sendBulkMessages({
            memberIds,
            message: promoMessage,
            mediaUrl: imageUrl,
        });
    }

    /**
     * Personalize message with member details
     */
    private personalizeMessage(template: string, member: any): string {
        return template
            .replace(/\{firstName\}/g, member.firstName)
            .replace(/\{lastName\}/g, member.lastName)
            .replace(/\{membershipNumber\}/g, member.membershipNumber || '')
            .replace(/\{email\}/g, member.email);
    }

    /**
     * Get message status
     */
    async getMessageStatus(messageId: string) {
        try {
            const message = await client.messages(messageId).fetch();

            return {
                status: message.status,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                dateSent: message.dateSent,
            };
        } catch (error: any) {
            logger.error('Failed to fetch message status', { error, messageId });
            throw new Error('Failed to fetch message status');
        }
    }

    /**
     * Auto-send birthday wishes (cron job)
     */
    async autoBirthdayWishes(tenantId: string) {
        const today = new Date();
        const month = today.getMonth() + 1;
        const day = today.getDate();

        // Find members with birthday today
        const members = await Member.find({
            tenantId,
            $expr: {
                $and: [
                    { $eq: [{ $month: '$dateOfBirth' }, month] },
                    { $eq: [{ $dayOfMonth: '$dateOfBirth' }, day] },
                ],
            },
        });

        const results = [];

        for (const member of members) {
            try {
                await this.sendBirthdayWish(member._id.toString());
                results.push({ memberId: member._id, success: true });
            } catch (error: any) {
                results.push({ memberId: member._id, success: false, error: error.message });
            }
        }

        logger.info('Auto birthday wishes sent', { count: members.length });

        return results;
    }
}

export default new WhatsAppService();
