import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import logger from '../config/logger';

const execAsync = promisify(exec);

class BackupService {
    private backupDir: string;
    private retentionDays: number;

    constructor() {
        this.backupDir = process.env.BACKUP_STORAGE_PATH || './backups';
        this.retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');
    }

    /**
     * Initialize backup service and schedule
     */
    async initialize() {
        try {
            // Create backup directory if it doesn't exist
            await fs.mkdir(this.backupDir, { recursive: true });

            // Schedule daily backups (default: 2 AM)
            const schedule = process.env.BACKUP_SCHEDULE || '0 2 * * *';
            cron.schedule(schedule, async () => {
                await this.performBackup();
            });

            logger.info('Backup service initialized', { schedule, backupDir: this.backupDir });
        } catch (error) {
            logger.error('Failed to initialize backup service', { error });
        }
    }

    /**
     * Perform database backup
     */
    async performBackup(): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `gym_management_${timestamp}`;
        const backupPath = path.join(this.backupDir, backupName);

        try {
            logger.info('Starting database backup', { backupName });

            // MongoDB backup using mongodump
            const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym_management';
            const command = `mongodump --uri="${mongoUri}" --out="${backupPath}"`;

            await execAsync(command);

            // Compress backup
            const compressCommand = `tar -czf ${backupPath}.tar.gz -C ${this.backupDir} ${backupName}`;
            await execAsync(compressCommand);

            // Remove uncompressed backup
            await fs.rm(backupPath, { recursive: true });

            logger.info('Database backup completed', { backupFile: `${backupName}.tar.gz` });

            // Clean old backups
            await this.cleanOldBackups();

            return `${backupPath}.tar.gz`;
        } catch (error) {
            logger.error('Database backup failed', { error, backupName });
            throw error;
        }
    }

    /**
     * Restore database from backup
     */
    async restoreBackup(backupFile: string): Promise<void> {
        try {
            logger.info('Starting database restore', { backupFile });

            const backupPath = path.join(this.backupDir, backupFile);

            // Extract backup
            const extractDir = backupPath.replace('.tar.gz', '');
            const extractCommand = `tar -xzf ${backupPath} -C ${this.backupDir}`;
            await execAsync(extractCommand);

            // Restore using mongorestore
            const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym_management';
            const restoreCommand = `mongorestore --uri="${mongoUri}" --drop ${extractDir}`;
            await execAsync(restoreCommand);

            // Clean up extracted files
            await fs.rm(extractDir, { recursive: true });

            logger.info('Database restore completed', { backupFile });
        } catch (error) {
            logger.error('Database restore failed', { error, backupFile });
            throw error;
        }
    }

    /**
     * List available backups
     */
    async listBackups(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.backupDir);
            return files.filter((file) => file.endsWith('.tar.gz')).sort().reverse();
        } catch (error) {
            logger.error('Failed to list backups', { error });
            return [];
        }
    }

    /**
     * Clean old backups based on retention policy
     */
    private async cleanOldBackups(): Promise<void> {
        try {
            const backups = await this.listBackups();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

            for (const backup of backups) {
                const backupPath = path.join(this.backupDir, backup);
                const stats = await fs.stat(backupPath);

                if (stats.mtime < cutoffDate) {
                    await fs.unlink(backupPath);
                    logger.info('Deleted old backup', { backup, age: stats.mtime });
                }
            }
        } catch (error) {
            logger.error('Failed to clean old backups', { error });
        }
    }

    /**
     * Get backup statistics
     */
    async getBackupStats() {
        try {
            const backups = await this.listBackups();
            let totalSize = 0;

            for (const backup of backups) {
                const backupPath = path.join(this.backupDir, backup);
                const stats = await fs.stat(backupPath);
                totalSize += stats.size;
            }

            return {
                count: backups.length,
                totalSize: totalSize,
                totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
                oldestBackup: backups[backups.length - 1],
                latestBackup: backups[0],
            };
        } catch (error) {
            logger.error('Failed to get backup stats', { error });
            return null;
        }
    }
}

export default new BackupService();
