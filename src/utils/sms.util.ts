import twilio from 'twilio';
import { config } from '../config/config';
import logger from '../config/logger';

export const sendSMS = async (to: string, message: string): Promise<void> => {
    try {
        if (!config.sms.accountSid || !config.sms.authToken) {
            logger.warn('SMS service not configured. Skipping SMS send.');
            return;
        }

        const client = twilio(config.sms.accountSid, config.sms.authToken);

        await client.messages.create({
            body: message,
            from: config.sms.fromNumber,
            to: to,
        });

        logger.info(`SMS sent to ${to}`);
    } catch (error) {
        logger.error('Error sending SMS:', error);
        throw new Error('Failed to send SMS');
    }
};
