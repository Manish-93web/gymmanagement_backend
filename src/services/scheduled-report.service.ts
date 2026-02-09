import cron from 'node-cron';
import ScheduledReport from '../models/ScheduledReport.model';
import CustomReportService from './custom-report.service';
import { sendEmail } from '../utils/email.util';
import logger from '../config/logger';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { Parser } from 'json2csv';

interface ScheduledReportConfig {
    name: string;
    reportId: string;
    schedule: string; // cron expression
    format: 'pdf' | 'csv' | 'both';
    recipients: string[];
    filters?: any[];
    isActive: boolean;
    tenantId: string;
}

class ScheduledReportService {
    private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();

    /**
     * Create scheduled report
     */
    async createScheduledReport(config: ScheduledReportConfig) {
        // Validate cron expression
        if (!cron.validate(config.schedule)) {
            throw new Error('Invalid cron expression');
        }

        const scheduledReport = await ScheduledReport.create({
            ...config,
            createdAt: new Date(),
            lastRun: null,
            nextRun: this.getNextRunTime(config.schedule),
        });

        // Start the cron job
        if (config.isActive) {
            this.startScheduledReport(scheduledReport._id.toString());
        }

        logger.info('Scheduled report created', { scheduledReportId: scheduledReport._id });

        return scheduledReport;
    }

    /**
     * Start scheduled report job
     */
    startScheduledReport(scheduledReportId: string) {
        ScheduledReport.findById(scheduledReportId).then((scheduledReport) => {
            if (!scheduledReport) return;

            const job = cron.schedule(scheduledReport.schedule, async () => {
                await this.executeScheduledReport(scheduledReportId);
            });

            this.scheduledJobs.set(scheduledReportId, job);

            logger.info('Scheduled report job started', { scheduledReportId });
        });
    }

    /**
     * Execute scheduled report
     */
    async executeScheduledReport(scheduledReportId: string) {
        const scheduledReport = await ScheduledReport.findById(scheduledReportId);

        if (!scheduledReport || !scheduledReport.isActive) {
            return;
        }

        try {
            // Execute the report
            const reportData = await CustomReportService.executeReport(
                scheduledReport.reportId.toString(),
                scheduledReport.filters
            );

            // Generate files
            const files: { path: string; filename: string }[] = [];

            if (scheduledReport.format === 'pdf' || scheduledReport.format === 'both') {
                const pdfPath = await this.generatePDF(reportData, scheduledReport.name);
                files.push({ path: pdfPath, filename: `${scheduledReport.name}.pdf` });
            }

            if (scheduledReport.format === 'csv' || scheduledReport.format === 'both') {
                const csvPath = await this.generateCSV(reportData, scheduledReport.name);
                files.push({ path: csvPath, filename: `${scheduledReport.name}.csv` });
            }

            // Send email to recipients
            for (const recipient of scheduledReport.recipients) {
                await sendEmail({
                    to: recipient,
                    subject: `Scheduled Report: ${scheduledReport.name}`,
                    template: 'scheduled-report',
                    data: {
                        reportName: scheduledReport.name,
                        executedAt: new Date().toLocaleString(),
                        recordCount: reportData.recordCount,
                    },
                    attachments: files.map((f) => ({
                        filename: f.filename,
                        path: f.path,
                    })),
                });
            }

            // Update last run
            scheduledReport.lastRun = new Date();
            scheduledReport.nextRun = this.getNextRunTime(scheduledReport.schedule);
            scheduledReport.runCount = (scheduledReport.runCount || 0) + 1;
            await scheduledReport.save();

            logger.info('Scheduled report executed', {
                scheduledReportId,
                recordCount: reportData.recordCount,
            });
        } catch (error: any) {
            logger.error('Scheduled report execution failed', { error, scheduledReportId });

            // Update error count
            scheduledReport.errorCount = (scheduledReport.errorCount || 0) + 1;
            scheduledReport.lastError = error.message;
            await scheduledReport.save();
        }
    }

    /**
     * Generate PDF report
     */
    private async generatePDF(reportData: any, reportName: string): Promise<string> {
        const reportsDir = path.join(process.cwd(), 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const fileName = `${reportName}_${Date.now()}.pdf`;
        const filePath = path.join(reportsDir, fileName);

        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Header
        doc.fontSize(20).text(reportData.reportName, { align: 'center' });
        doc.fontSize(10).text(`Generated: ${reportData.executedAt.toLocaleString()}`, { align: 'center' });
        doc.moveDown();

        // Aggregations
        if (reportData.aggregations && Object.keys(reportData.aggregations).length > 0) {
            doc.fontSize(14).text('Summary', { underline: true });
            doc.fontSize(10);
            Object.entries(reportData.aggregations).forEach(([key, value]) => {
                doc.text(`${key}: ${value}`);
            });
            doc.moveDown();
        }

        // Data table
        doc.fontSize(14).text('Data', { underline: true });
        doc.fontSize(8);

        if (reportData.data.length > 0) {
            const headers = Object.keys(reportData.data[0]);
            const tableTop = doc.y;
            let yPosition = tableTop;

            // Headers
            headers.forEach((header, i) => {
                doc.text(header, 50 + i * 100, yPosition, { width: 90 });
            });

            yPosition += 20;
            doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
            yPosition += 5;

            // Rows (limit to 50 for PDF)
            reportData.data.slice(0, 50).forEach((row: any) => {
                headers.forEach((header, i) => {
                    doc.text(String(row[header] || ''), 50 + i * 100, yPosition, { width: 90 });
                });
                yPosition += 15;

                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }
            });

            if (reportData.data.length > 50) {
                doc.text(`... and ${reportData.data.length - 50} more records`, 50, yPosition);
            }
        }

        doc.end();

        await new Promise((resolve, reject) => {
            stream.on('finish', resolve);
            stream.on('error', reject);
        });

        return filePath;
    }

    /**
     * Generate CSV report
     */
    private async generateCSV(reportData: any, reportName: string): Promise<string> {
        const reportsDir = path.join(process.cwd(), 'reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const fileName = `${reportName}_${Date.now()}.csv`;
        const filePath = path.join(reportsDir, fileName);

        if (reportData.data.length === 0) {
            fs.writeFileSync(filePath, 'No data available');
            return filePath;
        }

        const parser = new Parser();
        const csv = parser.parse(reportData.data);

        fs.writeFileSync(filePath, csv);

        return filePath;
    }

    /**
     * Get next run time from cron expression
     */
    private getNextRunTime(cronExpression: string): Date {
        const interval = cron.schedule(cronExpression, () => { });
        const nextDate = new Date();
        nextDate.setMinutes(nextDate.getMinutes() + 1); // Approximate
        interval.stop();
        return nextDate;
    }

    /**
     * Get all scheduled reports
     */
    async getAllScheduledReports(tenantId: string) {
        const reports = await ScheduledReport.find({ tenantId })
            .populate('reportId', 'name description')
            .sort({ createdAt: -1 });

        return reports;
    }

    /**
     * Update scheduled report
     */
    async updateScheduledReport(scheduledReportId: string, updates: Partial<ScheduledReportConfig>) {
        const report = await ScheduledReport.findByIdAndUpdate(scheduledReportId, updates, { new: true });

        if (!report) {
            throw new Error('Scheduled report not found');
        }

        // Restart job if schedule changed
        if (updates.schedule || updates.isActive !== undefined) {
            this.stopScheduledReport(scheduledReportId);
            if (report.isActive) {
                this.startScheduledReport(scheduledReportId);
            }
        }

        logger.info('Scheduled report updated', { scheduledReportId });

        return report;
    }

    /**
     * Stop scheduled report
     */
    stopScheduledReport(scheduledReportId: string) {
        const job = this.scheduledJobs.get(scheduledReportId);
        if (job) {
            job.stop();
            this.scheduledJobs.delete(scheduledReportId);
            logger.info('Scheduled report job stopped', { scheduledReportId });
        }
    }

    /**
     * Delete scheduled report
     */
    async deleteScheduledReport(scheduledReportId: string) {
        this.stopScheduledReport(scheduledReportId);

        const report = await ScheduledReport.findByIdAndDelete(scheduledReportId);

        if (!report) {
            throw new Error('Scheduled report not found');
        }

        logger.info('Scheduled report deleted', { scheduledReportId });

        return {
            success: true,
            message: 'Scheduled report deleted successfully',
        };
    }

    /**
     * Initialize all active scheduled reports on server start
     */
    async initializeScheduledReports() {
        const activeReports = await ScheduledReport.find({ isActive: true });

        for (const report of activeReports) {
            this.startScheduledReport(report._id.toString());
        }

        logger.info('Scheduled reports initialized', { count: activeReports.length });
    }
}

export default new ScheduledReportService();
