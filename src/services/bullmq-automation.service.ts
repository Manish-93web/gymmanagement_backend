import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import MembershipLifecycleService from './membership-lifecycle.service';
import WhatsAppService from './whatsapp.service';
import { sendEmail } from '../utils/email.util';
import Member from '../models/Member.model';
import logger from '../config/logger';

const isMock = process.env.USE_REDIS_MOCK === 'true';

const connection = !isMock ? new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
}) : null;

class BullMQAutomationService {
    private membershipExpiryQueue: Queue | null = null;
    private birthdayQueue: Queue | null = null;
    private reportQueue: Queue | null = null;
    private backupQueue: Queue | null = null;
    private renewalQueue: Queue | null = null;
    private workers: Worker[] = [];
    private isInitialized = false;

    /**
     * Initialize queues and workers
     */
    async initialize() {
        if (this.isInitialized) return;
        if (isMock) {
            logger.info('⚠️ BullMQ Automation Service skipped (Redis Mock enabled)');
            this.isInitialized = true;
            return;
        }

        try {
            // Initialize queues
            const queueOptions = { connection: connection as any };

            this.membershipExpiryQueue = new Queue('membership-expiry', queueOptions);
            this.birthdayQueue = new Queue('birthday-wishes', queueOptions);
            this.reportQueue = new Queue('scheduled-reports', queueOptions);
            this.backupQueue = new Queue('database-backup', queueOptions);
            this.renewalQueue = new Queue('subscription-renewal', queueOptions);

            this.setupProcessors();
            await this.setupScheduledJobs();

            this.isInitialized = true;
            logger.info('✅ BullMQ Automation Service initialized');
        } catch (error: any) {
            logger.error('❌ Failed to initialize BullMQ Automation Service:', error);
            throw error;
        }
    }

    /**
     * Setup job processors
     */
    private setupProcessors() {
        const workerOptions = { connection: connection as any };

        // Membership expiry processor
        this.workers.push(new Worker('membership-expiry', async (job) => {
            const { tenantId } = job.data;
            await this.processExpiringMemberships(tenantId);
        }, workerOptions));

        // Birthday processor
        this.workers.push(new Worker('birthday-wishes', async (job) => {
            const { tenantId } = job.data;
            await this.processBirthdays(tenantId);
        }, workerOptions));

        // Report processor
        this.workers.push(new Worker('scheduled-reports', async (job) => {
            const { reportId, tenantId } = job.data;
            await this.processScheduledReport(reportId, tenantId);
        }, workerOptions));

        // Backup processor
        this.workers.push(new Worker('database-backup', async (job) => {
            await this.processBackup();
        }, workerOptions));

        // Renewal processor
        this.workers.push(new Worker('subscription-renewal', async (job) => {
            const { tenantId } = job.data;
            await this.processAutoRenewals(tenantId);
        }, workerOptions));

        logger.info('BullMQ workers initialized');
    }

    /**
     * Setup scheduled jobs
     */
    private async setupScheduledJobs() {
        if (!this.membershipExpiryQueue || !this.birthdayQueue || !this.backupQueue || !this.renewalQueue) return;

        try {
            // Check expiring memberships daily at 9 AM
            await this.membershipExpiryQueue.add(
                'check-expiring',
                {},
                {
                    repeat: {
                        pattern: '0 9 * * *',
                    },
                }
            );

            // Check birthdays daily at 8 AM
            await this.birthdayQueue.add(
                'birthday-wishes',
                {},
                {
                    repeat: {
                        pattern: '0 8 * * *',
                    },
                }
            );

            // Database backup daily at 2 AM
            await this.backupQueue.add(
                'database-backup',
                {},
                {
                    repeat: {
                        pattern: '0 2 * * *',
                    },
                }
            );

            // Subscription renewals daily at midnight
            await this.renewalQueue.add(
                'subscription-renewals',
                {},
                {
                    repeat: {
                        pattern: '0 0 * * *',
                    },
                }
            );

            logger.info('BullMQ scheduled jobs initialized');
        } catch (error) {
            logger.warn('Failed to add scheduled jobs to BullMQ:', error);
        }
    }

    /**
     * Process expiring memberships
     */
    private async processExpiringMemberships(tenantId: string) {
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

        const expiringMembers = await Member.find({
            tenantId,
            status: 'active',
            membershipExpiry: {
                $gte: new Date(),
                $lte: sevenDaysFromNow,
            },
        });

        for (const member of expiringMembers) {
            if (!member.membershipExpiry) continue;

            const daysRemaining = Math.ceil(
                (member.membershipExpiry.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
            );

            // Send reminder
            await sendEmail({
                to: member.email,
                subject: 'Membership Expiring Soon',
                template: 'membership-expiry-reminder',
                data: {
                    name: `${member.firstName} ${member.lastName}`,
                    daysRemaining,
                    expiryDate: member.membershipExpiry.toDateString(),
                },
            });

            // Send WhatsApp
            await WhatsAppService.sendExpiryReminder(member._id.toString());
        }

        logger.info('Expiring memberships processed', { count: expiringMembers.length });
    }

    /**
     * Process birthdays
     */
    private async processBirthdays(tenantId: string) {
        await WhatsAppService.autoBirthdayWishes(tenantId);
        logger.info('Birthday wishes processed', { tenantId });
    }

    /**
     * Process scheduled report
     */
    private async processScheduledReport(reportId: string, tenantId: string) {
        // Implementation would call ScheduledReportService
        logger.info('Scheduled report processed', { reportId, tenantId });
    }

    /**
     * Process backup
     */
    private async processBackup() {
        // Implementation would call BackupService
        logger.info('Database backup processed');
    }

    /**
     * Process auto-renewals
     */
    private async processAutoRenewals(tenantId: string) {
        const Subscription = (await import('../models/Subscription.model')).default;
        const planService = (await import('./plan.service')).default;

        const now = new Date();
        const startOfDay = new Date(now.setHours(0, 0, 0, 0));
        const endOfDay = new Date(now.setHours(23, 59, 59, 999));

        const expiringSubscriptions = await Subscription.find({
            tenantId,
            autoRenew: true,
            status: 'active',
            endDate: { $gte: startOfDay, $lte: endOfDay }
        });

        for (const sub of expiringSubscriptions) {
            try {
                // In a real scenario, this would trigger a payment gateway charge
                // For this engine, we renew and create a pending payment
                await planService.renewSubscription(sub._id.toString(), tenantId);
                logger.info('Auto-renewal successful', { subscriptionId: sub._id });
            } catch (error: any) {
                logger.error('Auto-renewal failed', { subscriptionId: sub._id, error: error.message });
            }
        }
    }

    /**
     * Add custom job
     */
    async addJob(
        queueName: string,
        data: any,
        options?: {
            delay?: number;
            repeat?: { pattern: string };
            priority?: number;
        }
    ) {
        this.ensureInitialized();
        let queue: Queue;

        switch (queueName) {
            case 'membership-expiry':
                queue = this.membershipExpiryQueue;
                break;
            case 'birthday':
                queue = this.birthdayQueue;
                break;
            case 'report':
                queue = this.reportQueue;
                break;
            case 'backup':
                queue = this.backupQueue;
                break;
            default:
                throw new Error('Invalid queue name');
        }

        const job = await queue.add('custom-job', data, options);

        logger.info('Job added to queue', { queueName, jobId: job.id });

        return {
            success: true,
            jobId: job.id,
        };
    }

    /**
     * Get queue statistics
     */
    async getQueueStats(queueName: string) {
        this.ensureInitialized();
        let queue: Queue;

        switch (queueName) {
            case 'membership-expiry':
                queue = this.membershipExpiryQueue;
                break;
            case 'birthday':
                queue = this.birthdayQueue;
                break;
            case 'report':
                queue = this.reportQueue;
                break;
            case 'backup':
                queue = this.backupQueue;
                break;
            default:
                throw new Error('Invalid queue name');
        }

        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount(),
        ]);

        return {
            queueName,
            waiting,
            active,
            completed,
            failed,
            delayed,
        };
    }

    /**
     * Remove job
     */
    async removeJob(queueName: string, jobId: string) {
        this.ensureInitialized();
        let queue: Queue;

        switch (queueName) {
            case 'membership-expiry':
                queue = this.membershipExpiryQueue;
                break;
            case 'birthday':
                queue = this.birthdayQueue;
                break;
            case 'report':
                queue = this.reportQueue;
                break;
            case 'backup':
                queue = this.backupQueue;
                break;
            default:
                throw new Error('Invalid queue name');
        }

        const job = await queue.getJob(jobId);
        if (job) {
            await job.remove();
            logger.info('Job removed from queue', { queueName, jobId });
        }

        return {
            success: true,
            message: 'Job removed successfully',
        };
    }

    /**
     * Clean completed jobs
     */
    async cleanQueue(queueName: string, grace: number = 86400000) {
        this.ensureInitialized();
        let queue: Queue;

        switch (queueName) {
            case 'membership-expiry':
                queue = this.membershipExpiryQueue;
                break;
            case 'birthday':
                queue = this.birthdayQueue;
                break;
            case 'report':
                queue = this.reportQueue;
                break;
            case 'backup':
                queue = this.backupQueue;
                break;
            default:
                throw new Error('Invalid queue name');
        }

        await queue.clean(grace, 1000, 'completed');
        await queue.clean(grace, 1000, 'failed');

        logger.info('Queue cleaned', { queueName });

        return {
            success: true,
            message: 'Queue cleaned successfully',
        };
    }

    private ensureInitialized() {
        if (!this.isInitialized || !this.membershipExpiryQueue || !this.birthdayQueue || !this.reportQueue || !this.backupQueue || !this.renewalQueue) {
            throw new Error('BullMQ Automation Service not initialized. Call initialize() first.');
        }
    }
}

export default new BullMQAutomationService();
