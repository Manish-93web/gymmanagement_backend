import PDFDocument from 'pdfkit';
import { Parser } from 'json2csv';
import fs from 'fs';
import path from 'path';
import logger from '../config/logger';

interface ExportOptions {
    format: 'pdf' | 'csv' | 'excel';
    title: string;
    data: any[];
    columns?: { field: string; label: string }[];
    aggregations?: { [key: string]: any };
    orientation?: 'portrait' | 'landscape';
    pageSize?: 'A4' | 'letter';
}

class ExportService {
    /**
     * Export data to PDF
     */
    async exportToPDF(options: ExportOptions): Promise<string> {
        const {
            title,
            data,
            columns,
            aggregations,
            orientation = 'portrait',
            pageSize = 'A4',
        } = options;

        const exportsDir = path.join(process.cwd(), 'exports');
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }

        const fileName = `${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        const filePath = path.join(exportsDir, fileName);

        const doc = new PDFDocument({
            margin: 50,
            size: pageSize,
            layout: orientation,
        });

        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        // Title
        doc.fontSize(20).text(title, { align: 'center' });
        doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.moveDown();

        // Aggregations/Summary
        if (aggregations && Object.keys(aggregations).length > 0) {
            doc.fontSize(14).text('Summary', { underline: true });
            doc.fontSize(10);
            Object.entries(aggregations).forEach(([key, value]) => {
                doc.text(`${key}: ${this.formatValue(value)}`);
            });
            doc.moveDown();
        }

        // Data Table
        if (data.length > 0) {
            doc.fontSize(14).text('Details', { underline: true });
            doc.fontSize(8);

            const headers = columns
                ? columns.map((c) => c.label)
                : Object.keys(data[0]);

            const fields = columns
                ? columns.map((c) => c.field)
                : Object.keys(data[0]);

            const columnWidth = orientation === 'landscape' ? 120 : 80;
            const tableTop = doc.y;
            let yPosition = tableTop;

            // Headers
            headers.forEach((header, i) => {
                doc.font('Helvetica-Bold').text(header, 50 + i * columnWidth, yPosition, {
                    width: columnWidth - 10,
                });
            });

            yPosition += 20;
            doc.moveTo(50, yPosition).lineTo(50 + headers.length * columnWidth, yPosition).stroke();
            yPosition += 5;

            // Rows
            doc.font('Helvetica');
            data.forEach((row: any) => {
                fields.forEach((field, i) => {
                    const value = this.formatValue(row[field]);
                    doc.text(String(value || ''), 50 + i * columnWidth, yPosition, {
                        width: columnWidth - 10,
                    });
                });
                yPosition += 15;

                // Add new page if needed
                if (yPosition > 700) {
                    doc.addPage();
                    yPosition = 50;
                }
            });
        } else {
            doc.text('No data available', { align: 'center' });
        }

        // Footer
        const pages = doc.bufferedPageRange();
        for (let i = 0; i < pages.count; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).text(
                `Page ${i + 1} of ${pages.count}`,
                50,
                doc.page.height - 50,
                { align: 'center' }
            );
        }

        doc.end();

        await new Promise<void>((resolve, reject) => {
            stream.on('finish', () => resolve());
            stream.on('error', reject);
        });

        logger.info('PDF export generated', { fileName, recordCount: data.length });

        return filePath;
    }

    /**
     * Export data to CSV
     */
    async exportToCSV(options: ExportOptions): Promise<string> {
        const { title, data, columns } = options;

        const exportsDir = path.join(process.cwd(), 'exports');
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }

        const fileName = `${title.replace(/\s+/g, '_')}_${Date.now()}.csv`;
        const filePath = path.join(exportsDir, fileName);

        if (data.length === 0) {
            fs.writeFileSync(filePath, 'No data available');
            return filePath;
        }

        const fields = columns
            ? columns.map((c) => ({ label: c.label, value: c.field }))
            : Object.keys(data[0]).map((key) => ({ label: key, value: key }));

        const parser = new Parser({ fields });
        const csv = parser.parse(data);

        fs.writeFileSync(filePath, csv);

        logger.info('CSV export generated', { fileName, recordCount: data.length });

        return filePath;
    }

    /**
     * Export data to Excel (CSV format with .xlsx extension)
     */
    async exportToExcel(options: ExportOptions): Promise<string> {
        // For now, we'll use CSV format
        // In production, use a library like 'exceljs' for true Excel format
        const csvPath = await this.exportToCSV(options);
        const excelPath = csvPath.replace('.csv', '.xlsx');

        fs.renameSync(csvPath, excelPath);

        logger.info('Excel export generated', { fileName: path.basename(excelPath) });

        return excelPath;
    }

    /**
     * Export with automatic format detection
     */
    async export(options: ExportOptions): Promise<string> {
        switch (options.format) {
            case 'pdf':
                return await this.exportToPDF(options);
            case 'csv':
                return await this.exportToCSV(options);
            case 'excel':
                return await this.exportToExcel(options);
            default:
                throw new Error('Unsupported export format');
        }
    }

    /**
     * Format value for display
     */
    private formatValue(value: any): string {
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toLocaleDateString();
        if (typeof value === 'number') return value.toLocaleString();
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        return String(value);
    }

    /**
     * Get export file
     */
    async getExportFile(fileName: string): Promise<string> {
        const filePath = path.join(process.cwd(), 'exports', fileName);

        if (!fs.existsSync(filePath)) {
            throw new Error('Export file not found');
        }

        return filePath;
    }

    /**
     * Delete old export files (cleanup)
     */
    async cleanupOldExports(daysOld: number = 7) {
        const exportsDir = path.join(process.cwd(), 'exports');

        if (!fs.existsSync(exportsDir)) {
            return;
        }

        const files = fs.readdirSync(exportsDir);
        const now = Date.now();
        const maxAge = daysOld * 24 * 60 * 60 * 1000;

        let deletedCount = 0;

        files.forEach((file) => {
            const filePath = path.join(exportsDir, file);
            const stats = fs.statSync(filePath);
            const age = now - stats.mtimeMs;

            if (age > maxAge) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        });

        logger.info('Old exports cleaned up', { deletedCount });

        return {
            success: true,
            deletedCount,
        };
    }

    /**
     * Batch export multiple reports
     */
    async batchExport(exports: ExportOptions[]): Promise<string[]> {
        const filePaths: string[] = [];

        for (const exportOptions of exports) {
            try {
                const filePath = await this.export(exportOptions);
                filePaths.push(filePath);
            } catch (error: any) {
                logger.error('Batch export failed for item', { error, title: exportOptions.title });
            }
        }

        logger.info('Batch export completed', { totalExports: exports.length, successful: filePaths.length });

        return filePaths;
    }
}

export default new ExportService();
