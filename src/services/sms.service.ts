import twilio from 'twilio';
import { config } from '../config/config';

class SMSService {
    private client: twilio.Twilio;

    constructor() {
        this.client = twilio(config.sms.accountSid, config.sms.authToken);
    }

    async sendSMS(to: string, message: string): Promise<any> {
        try {
            // Ensure phone number has country code
            const phoneNumber = to.startsWith('+') ? to : `+91${to}`;

            const result = await this.client.messages.create({
                body: message,
                from: config.sms.fromNumber,
                to: phoneNumber,
            });

            console.log('SMS sent:', result.sid);
            return result;
        } catch (error) {
            console.error('SMS sending failed:', error);
            throw error;
        }
    }

    async sendOTP(to: string, otp: string): Promise<any> {
        const message = `Your OTP code is: ${otp}. This code will expire in 10 minutes. Do not share this code with anyone.`;
        return this.sendSMS(to, message);
    }

    async sendWelcomeSMS(to: string, name: string, membershipNumber: string): Promise<any> {
        const message = `Welcome ${name}! Your membership number is ${membershipNumber}. We're excited to have you join our fitness community!`;
        return this.sendSMS(to, message);
    }

    async sendSubscriptionExpiryReminder(
        to: string,
        name: string,
        daysRemaining: number
    ): Promise<any> {
        const message = `Hi ${name}, your gym membership will expire in ${daysRemaining} days. Please renew to continue enjoying our services.`;
        return this.sendSMS(to, message);
    }

    async sendClassReminder(
        to: string,
        name: string,
        className: string,
        startTime: Date
    ): Promise<any> {
        const timeStr = startTime.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
        });
        const message = `Hi ${name}, reminder: Your ${className} class is scheduled for today at ${timeStr}. See you there!`;
        return this.sendSMS(to, message);
    }

    async sendPaymentConfirmation(
        to: string,
        name: string,
        amount: number,
        invoiceNumber: string
    ): Promise<any> {
        const message = `Hi ${name}, your payment of ₹${amount} has been received. Invoice: ${invoiceNumber}. Thank you!`;
        return this.sendSMS(to, message);
    }

    async sendBookingConfirmation(
        to: string,
        name: string,
        className: string,
        date: Date
    ): Promise<any> {
        const dateStr = date.toLocaleDateString('en-IN');
        const timeStr = date.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
        });
        const message = `Hi ${name}, your booking for ${className} on ${dateStr} at ${timeStr} is confirmed!`;
        return this.sendSMS(to, message);
    }
}

export default new SMSService();
