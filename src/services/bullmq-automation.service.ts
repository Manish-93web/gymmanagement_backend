import Bull from 'bull';
import Redis from 'ioredis';
import MembershipLifecycleService from './membership-lifecycle.service';
import WhatsAppService from './whatsapp.service';
import { sendEmail } from '../utils/email.util';
import Member from '../models/Member.model';
import logger from '../config/logger';

const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
});

class BullMQAutomationService {
    private membershipExpiryQueue: Bull.Queue;
    private birthdayQueue: Bull.Queue;
    private reportQueue: Bull.Queue;
    private backupQueue: Bull.Queue;

    constructor() {
        // Initialize queues
        this.membershipExpiryQueue = new Bull('membership-expiry', {
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
            },
        });

        this.birthdayQueue = new Bull('birthday-wishes', {
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
            },
        });

        this.reportQueue = new Bull('scheduled-reports', {
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
            },
        });

        this.backupQueue = new Bull('database-backup', {
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
            },
        });

        this.setupProcessors();
        this.setupScheduledJobs();
    }

    /**
     * Setup job processors
     */
    private setupProcessors() {
        // Membership expiry processor
        this.membershipExpiryQueue.process(async (job) => {
            const { tenantId } = job.data;
            await this.processExpiringMemberships(tenantId);
        });

        // Birthday processor
        this.birthdayQueue.process(async (job) => {
            const { tenantId } = job.data;
            await this.processBirthdays(tenantId);
        });

        // Report processor
        this.reportQueue.process(async (job) => {
            const { reportId, tenantId } = job.data;
            await this.processScheduledReport(reportId, tenantId);
        });

        // Backup processor
        this.backupQueue.process(async (job) => {
            await this.processBackup();
        });

        logger.info('BullMQ processors initialized');
    }

    /**
     * Setup scheduled jobs
     */
    private setupScheduledJobs() {
        // Check expiring memberships daily at 9 AM
        this.membershipExpiryQueue.add(
            {},
            {
                repeat: {
                    cron: '0 9 * * *',
                },
            }
        );

        // Check birthdays daily at 8 AM
        this.birthdayQueue.add(
            {},
            {
                repeat: {
                    cron: '0 8 * * *',
                },
            }
        );

        // Database backup daily at 2 AM
        this.backupQueue.add(
            {},
            {
                repeat: {
                    cron: '0 2 * * *',
                },
            }
        );

        logger.info('BullMQ scheduled jobs initialized');
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
     * Add custom job
     */
    async addJob(
        queueName: string,
        data: any,
        options?: {
            delay?: number;
            repeat?: { cron: string };
            priority?: number;
        }
    ) {
        let queue: Bull.Queue;

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

        const job = await queue.add(data, options);

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
        let queue: Bull.Queue;

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
        let queue: Bull.Queue;

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
        let queue: Bull.Queue;

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

        await queue.clean(grace, 'completed');
        await queue.clean(grace, 'failed');

        logger.info('Queue cleaned', { queueName });

        return {
            success: true,
            message: 'Queue cleaned successfully',
        };
    }
}

export default new BullMQAutomationService();
