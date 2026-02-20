import nodemailer from 'nodemailer';
import { config } from '../config/config';
import logger from '../config/logger';

export interface EmailOptions {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    template?: string;
    data?: any;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
    try {
        const transporter = nodemailer.createTransport({
            host: config.email.host,
            port: config.email.port,
            secure: config.email.port === 465, // Use SSL/TLS
            auth: {
                user: config.email.user,
                pass: config.email.password,
            },
        });

        const mailOptions = {
            from: `"${config.email.fromName}" <${config.email.from}>`,
            to: options.to,
            subject: options.subject,
            html: options.html,
            text: options.text || '',
        };

        const info = await transporter.sendMail(mailOptions);
        logger.info(`Email sent: ${info.messageId}`);
    } catch (error) {
        logger.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};
