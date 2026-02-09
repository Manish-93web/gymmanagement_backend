import nodemailer from 'nodemailer';
import { config } from '../config/config';

class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<any> {
    try {
      const mailOptions = {
        from: `"${config.email.fromName}" <${config.email.from}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent:', info.messageId);
      return info;
    } catch (error) {
      console.error('Email sending failed:', error);
      throw error;
    }
  }

  async sendWelcomeEmail(to: string, name: string, membershipNumber: string): Promise<any> {
    const subject = 'Welcome to Our Gym!';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Welcome ${name}!</h1>
        <p>We're excited to have you join our fitness community.</p>
        <p>Your membership number is: <strong>${membershipNumber}</strong></p>
        <p>You can use this number to check in at the gym.</p>
        <p>If you have any questions, feel free to reach out to our team.</p>
        <p>Best regards,<br>The Gym Team</p>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }

  async sendOTPEmail(to: string, otp: string): Promise<any> {
    const subject = 'Your OTP Code';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Your OTP Code</h1>
        <p>Your one-time password is:</p>
        <h2 style="color: #4F46E5; font-size: 32px; letter-spacing: 5px;">${otp}</h2>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this code, please ignore this email.</p>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }

  async sendSubscriptionExpiryReminder(
    to: string,
    name: string,
    expiryDate: Date,
    daysRemaining: number
  ): Promise<any> {
    const subject = `Your Membership Expires in ${daysRemaining} Days`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Membership Expiry Reminder</h1>
        <p>Hi ${name},</p>
        <p>Your membership will expire on <strong>${expiryDate.toLocaleDateString()}</strong> (${daysRemaining} days from now).</p>
        <p>To continue enjoying our services, please renew your membership before it expires.</p>
        <p>Visit our gym or contact us to renew.</p>
        <p>Best regards,<br>The Gym Team</p>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }

  async sendPaymentReceipt(
    to: string,
    name: string,
    amount: number,
    invoiceNumber: string,
    paymentDate: Date
  ): Promise<any> {
    const subject = `Payment Receipt - ${invoiceNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #4F46E5;">Payment Receipt</h1>
        <p>Hi ${name},</p>
        <p>Thank you for your payment!</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Invoice Number:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${invoiceNumber}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Amount Paid:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">₹${amount.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Payment Date:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${paymentDate.toLocaleDateString()}</td>
          </tr>
        </table>
        <p>This is an automated receipt. Please keep it for your records.</p>
        <p>Best regards,<br>The Gym Team</p>
      </div>
    `;

    return this.sendEmail(to, subject, html);
  }
}

export default new EmailService();
