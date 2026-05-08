import cron from 'node-cron';
import Subscription from '../models/Subscription.model';
import Payment from '../models/Payment.model';
import paymentService from '../services/payment.service';
import logger from '../config/logger';

export class BillingWorker {
    private static instance: BillingWorker;

    private constructor() {
        this.initializeSchedules();
    }

    public static getInstance(): BillingWorker {
        if (!BillingWorker.instance) {
            BillingWorker.instance = new BillingWorker();
        }
        return BillingWorker.instance;
    }

    private initializeSchedules() {
        // Midnight daily: trigger auto-renewal for subscriptions expiring within 24h
        cron.schedule('0 0 * * *', async () => {
            logger.info('[Billing] Starting auto-renewal processing...');
            try {
                const expiringSubscriptions = await Subscription.find({
                    status: 'active',
                    autoRenew: true,
                    endDate: { $lte: new Date(Date.now() + 24 * 60 * 60 * 1000) },
                });

                let renewed = 0;
                for (const sub of expiringSubscriptions) {
                    try {
                        await paymentService.createPayment({
                            tenantId:       sub.tenantId.toString(),
                            branchId:       sub.branchId?.toString() ?? '',
                            memberId:       sub.memberId.toString(),
                            subscriptionId: sub._id.toString(),
                            amount:         sub.pricing?.totalAmount ?? 0,
                            paymentType:    'renewal',
                            paymentMethod:  'razorpay',
                            description:    `Auto-renewal for subscription ${sub._id}`,
                        });
                        renewed++;
                        logger.info(`[Billing] Renewal initiated for subscription ${sub._id}`);
                    } catch (err: any) {
                        logger.error(`[Billing] Auto-renewal failed for subscription ${sub._id}: ${err.message}`);
                    }
                }
                logger.info(`[Billing] Auto-renewal complete: ${renewed}/${expiringSubscriptions.length} processed`);
            } catch (err: any) {
                logger.error('[Billing] Auto-renewal job error:', err.message);
            }
        });

        // Every 4 hours: retry failed payments (max 3 attempts, spaced 4h apart)
        cron.schedule('0 */4 * * *', async () => {
            logger.info('[Billing] Starting failed payment retry job...');
            try {
                const failedPayments = await Payment.find({
                    status: 'failed',
                    retryAttempts: { $lt: 3 },
                    updatedAt: { $lte: new Date(Date.now() - 4 * 60 * 60 * 1000) },
                });

                for (const payment of failedPayments) {
                    try {
                        payment.retryAttempts = (payment.retryAttempts || 0) + 1;
                        if (!payment.retryHistory) payment.retryHistory = [];
                        payment.retryHistory.push({
                            attemptNumber: payment.retryAttempts,
                            attemptedAt:   new Date(),
                            status:        'failed',
                            error:         'Automated retry attempt',
                        });
                        await payment.save();
                        logger.info(`[Billing] Retry attempt ${payment.retryAttempts} recorded for payment ${payment._id}`);
                    } catch (err: any) {
                        logger.error(`[Billing] Retry failed for payment ${payment._id}: ${err.message}`);
                    }
                }
                logger.info(`[Billing] Payment retry job complete: ${failedPayments.length} payment(s) processed`);
            } catch (err: any) {
                logger.error('[Billing] Failed payment retry job error:', err.message);
            }
        });

        logger.info('✅ Billing Worker initialized (midnight renewal + every-4h retry)');
    }
}

export default BillingWorker.getInstance();
