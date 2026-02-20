import Payment from '../models/Payment.model';
import Member from '../models/Member.model';
import PaymentService from './payment.service';
import logger from '../config/logger';
import { sendEmail } from '../utils/email.util';

interface RetryConfig {
    maxAttempts: number;
    retryIntervals: number[]; // in hours
}

const defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    retryIntervals: [24, 72, 168], // 1 day, 3 days, 7 days
};

class PaymentRetryService {
    /**
     * Retry failed payment
     */
    async retryPayment(paymentId: string) {
        const payment = await Payment.findById(paymentId).populate('userId');

        if (!payment) {
            throw new Error('Payment not found');
        }

        if (payment.status !== 'failed') {
            throw new Error('Only failed payments can be retried');
        }

        const member = payment.userId as any;

        // Check retry attempts
        const retryAttempts = payment.retryAttempts || 0;
        if (retryAttempts >= defaultRetryConfig.maxAttempts) {
            throw new Error('Maximum retry attempts reached');
        }

        try {
            // Retry not yet implemented - throw immediately
            throw new Error("Retry not implemented yet");
        } catch (error: any) {
            // Update retry history with non-null assertion since we checked above
            payment!.retryAttempts = (payment!.retryAttempts || 0) + 1;
            payment!.retryHistory = payment!.retryHistory || [];
            payment!.retryHistory.push({
                attemptNumber: (payment!.retryAttempts || 0),
                attemptedAt: new Date(),
                status: 'failed',
                error: error.message,
            });

            await payment!.save();

            logger.error('Payment retry failed', { paymentId, error });

            throw new Error(`Payment retry failed: ${error.message}`);
        }
    }

    /**
     * Auto-retry failed payments
     */
    async autoRetryFailedPayments() {
        const now = new Date();

        // Find failed payments eligible for retry
        const failedPayments = await Payment.find({
            status: 'failed',
            $or: [
                { retryAttempts: { $exists: false } },
                { retryAttempts: { $lt: defaultRetryConfig.maxAttempts } },
            ],
        }).populate('userId');

        const results = [];

        for (const payment of failedPayments) {
            const retryAttempts = payment.retryAttempts || 0;
            const lastRetry = payment.retryHistory?.[payment.retryHistory.length - 1]?.attemptedAt;

            // Calculate next retry time
            const retryInterval = defaultRetryConfig.retryIntervals[retryAttempts];
            if (!retryInterval) continue;

            const nextRetryTime = lastRetry
                ? new Date(lastRetry.getTime() + retryInterval * 60 * 60 * 1000)
                : new Date(payment.createdAt.getTime() + retryInterval * 60 * 60 * 1000);

            // Check if it's time to retry
            if (now >= nextRetryTime) {
                try {
                    await this.retryPayment(payment._id.toString());
                    results.push({ paymentId: payment._id, success: true });
                } catch (error: any) {
                    results.push({ paymentId: payment._id, success: false, error: error.message });

                    // Send notification if max attempts reached
                    if (retryAttempts + 1 >= defaultRetryConfig.maxAttempts) {
                        const member = payment.userId as any;
                        await this.sendMaxAttemptsNotification(member, payment);
                    }
                }
            }
        }

        logger.info('Auto-retry completed', { totalProcessed: results.length });

        return {
            success: true,
            results,
        };
    }

    /**
     * Send notification when max retry attempts reached
     */
    private async sendMaxAttemptsNotification(member: any, payment: any) {
        await sendEmail({
            to: member.email,
            subject: 'Payment Failed - Action Required',
            template: 'payment-max-retries',
            data: {
                name: `${member.firstName} ${member.lastName}`,
                amount: payment.amount,
                attempts: payment.retryAttempts,
            },
        });

        logger.info('Max retry attempts notification sent', { memberId: member._id, paymentId: payment._id });
    }

    /**
     * Manual retry with custom payment method
     */
    async manualRetry(paymentId: string, newGateway: 'razorpay' | 'stripe') {
        const payment = await Payment.findById(paymentId).populate('userId');

        if (!payment) {
            throw new Error('Payment not found');
        }

        const member = payment.userId as any;

        try {
            // Manual retry not yet implemented
            throw new Error("Manual retry not implemented");
        } catch (error: any) {
            logger.error('Manual payment retry failed', { paymentId, newGateway, error });
            throw error;
        }
    }

    /**
     * Get retry statistics
     */
    async getRetryStatistics(tenantId: string) {
        const failedPayments = await Payment.find({
            tenantId,
            status: 'failed',
        });

        const stats = {
            totalFailed: failedPayments.length,
            pendingRetry: failedPayments.filter((p) => (p.retryAttempts || 0) < defaultRetryConfig.maxAttempts).length,
            maxAttemptsReached: failedPayments.filter((p) => (p.retryAttempts || 0) >= defaultRetryConfig.maxAttempts).length,
            totalAmount: failedPayments.reduce((sum, p) => sum + (p.amount?.total || 0), 0),
        };

        return stats;
    }
}

export default new PaymentRetryService();
