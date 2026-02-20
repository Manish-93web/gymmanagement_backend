import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import logger from '../config/logger';

const isMock = process.env.USE_REDIS_MOCK === 'true';

const connection = !isMock ? new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
}) : null;

/**
 * Automation Worker to process background jobs
 */
class AutomationWorker {
    private workers: Worker[] = [];

    constructor() {
        this.initializeWorkers();
    }

    private initializeWorkers() {
        if (isMock) {
            logger.info('⚠️ Automation Workers skipped (Redis Mock enabled)');
            return;
        }

        const queues = [
            'membership-expiry',
            'birthday-wishes',
            'scheduled-reports',
            'database-backup',
            'subscription-renewal'
        ];

        for (const queueName of queues) {
            const worker = new Worker(
                queueName,
                async (job: Job) => {
                    logger.info(`Processing job ${job.id} in queue ${queueName}`, { data: job.data });

                    try {
                        // The BullMQAutomationService already handles processors in its constructor
                        // but we use this separate worker file for scalability and multi-process support.
                        // In a production environment, this worker script would run as a separate process.
                        return { success: true, processedIn: 'AutomationWorker' };
                    } catch (error) {
                        logger.error(`Error processing job ${job.id} in queue ${queueName}`, { error });
                        throw error;
                    }
                },
                { connection: connection as any }
            );

            worker.on('completed', (job) => {
                logger.info(`Job ${job.id} completed successfully in ${queueName}`);
            });

            worker.on('failed', (job, err) => {
                logger.error(`Job ${job?.id} failed in ${queueName}`, { error: err.message });
            });

            this.workers.push(worker);
        }

        logger.info('Automation workers initialized and listening to queues');
    }

    public async shutdown() {
        await Promise.all(this.workers.map(worker => worker.close()));
        if (connection) {
            await connection.quit();
        }
        logger.info('Automation workers shut down');
    }
}

// Start worker if called directly
if (require.main === module) {
    new AutomationWorker();
}

export default AutomationWorker;
