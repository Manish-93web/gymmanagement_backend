import { Request, Response } from 'express';
import { Parser as CsvParser } from 'json2csv';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import customReportService from '../services/custom-report.service';
import CustomReport from '../models/CustomReport.model';
import Payment from '../models/Payment.model';
import Attendance from '../models/Attendance.model';
import StaffAttendance from '../models/StaffAttendance.model';
import logger from '../config/logger';

type DataSource = 'members' | 'payments' | 'attendance' | 'classes' | 'users' | 'leads';

const SOURCE_MAP: Record<string, DataSource> = {
    Members: 'members',
    Membership: 'members',
    Payments: 'payments',
    Revenue: 'payments',
    Attendance: 'attendance',
    Classes: 'classes',
    Staff: 'users',
    Leads: 'leads',
};

const DATE_FIELD: Record<DataSource, string> = {
    members: 'createdAt',
    payments: 'createdAt',
    attendance: 'checkInTime',
    classes: 'schedule.startDate',
    users: 'createdAt',
    leads: 'createdAt',
};

const COLUMN_SETS: Record<DataSource, { field: string; label: string; type: 'string' | 'number' | 'date' | 'boolean' }[]> = {
    members: [
        { field: 'firstName', label: 'First Name', type: 'string' },
        { field: 'lastName', label: 'Last Name', type: 'string' },
        { field: 'email', label: 'Email', type: 'string' },
        { field: 'mobile', label: 'Mobile', type: 'string' },
        { field: 'status', label: 'Status', type: 'string' },
        { field: 'membershipStart', label: 'Membership Start', type: 'date' },
        { field: 'membershipExpiry', label: 'Membership Expiry', type: 'date' },
        { field: 'createdAt', label: 'Joined Date', type: 'date' },
    ],
    payments: [
        { field: 'invoiceNumber', label: 'Invoice', type: 'string' },
        { field: 'method', label: 'Method', type: 'string' },
        { field: 'status', label: 'Status', type: 'string' },
        { field: 'amount.total', label: 'Amount', type: 'number' },
        { field: 'createdAt', label: 'Date', type: 'date' },
    ],
    attendance: [
        { field: 'checkInTime', label: 'Check In', type: 'date' },
        { field: 'checkOutTime', label: 'Check Out', type: 'date' },
        { field: 'duration', label: 'Duration (min)', type: 'number' },
    ],
    classes: [
        { field: 'name', label: 'Class Name', type: 'string' },
        { field: 'type', label: 'Type', type: 'string' },
        { field: 'category', label: 'Category', type: 'string' },
        { field: 'capacity.current', label: 'Booked', type: 'number' },
        { field: 'capacity.max', label: 'Capacity', type: 'number' },
    ],
    users: [
        { field: 'firstName', label: 'First Name', type: 'string' },
        { field: 'lastName', label: 'Last Name', type: 'string' },
        { field: 'role', label: 'Role', type: 'string' },
        { field: 'email', label: 'Email', type: 'string' },
        { field: 'isActive', label: 'Active', type: 'boolean' },
        { field: 'createdAt', label: 'Joined Date', type: 'date' },
    ],
    leads: [
        { field: 'firstName', label: 'First Name', type: 'string' },
        { field: 'lastName', label: 'Last Name', type: 'string' },
        { field: 'mobile', label: 'Mobile', type: 'string' },
        { field: 'status', label: 'Status', type: 'string' },
        { field: 'source', label: 'Source', type: 'string' },
        { field: 'createdAt', label: 'Created', type: 'date' },
    ],
};

function periodToRange(period?: string): { start: Date; end: Date } | null {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);

    switch (period) {
        case 'Today':
            return { start, end };
        case 'This Week': {
            start.setDate(start.getDate() - start.getDay());
            return { start, end };
        }
        case 'This Month':
            start.setDate(1);
            return { start, end };
        case 'Last Month': {
            start.setDate(1);
            start.setMonth(start.getMonth() - 1);
            const lastMonthEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
            return { start, end: lastMonthEnd };
        }
        case 'This Quarter': {
            const quarter = Math.floor(start.getMonth() / 3);
            start.setMonth(quarter * 3, 1);
            return { start, end };
        }
        case 'This Year':
            start.setMonth(0, 1);
            return { start, end };
        default:
            return null; // 'All Time' / 'Custom' / unspecified
    }
}

const num = (v: any): number => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};

async function computeSummary(
    dataSource: DataSource,
    metrics: string[],
    rows: Record<string, any>[],
    tenantId: string,
    range: { start: Date; end: Date } | null
): Promise<Record<string, number | string>> {
    const summary: Record<string, number | string> = {};

    for (const metric of metrics) {
        const key = `${dataSource}:${metric}`;
        switch (key) {
            case 'members:Count':
            case 'members:New Joins':
                summary[metric] = rows.length;
                break;
            case 'members:Cancellations':
                summary[metric] = rows.filter((r) => ['expired', 'archived'].includes(r['Status'])).length;
                break;
            case 'members:Renewals': {
                const q: any = { tenantId, type: 'renewal' };
                if (range) q.createdAt = { $gte: range.start, $lte: range.end };
                summary[metric] = await Payment.countDocuments(q);
                break;
            }
            case 'payments:Total Revenue':
                summary[metric] = Math.round(rows.reduce((s, r) => s + num(r['Amount']), 0) * 100) / 100;
                break;
            case 'payments:Avg Payment':
                summary[metric] = rows.length
                    ? Math.round((rows.reduce((s, r) => s + num(r['Amount']), 0) / rows.length) * 100) / 100
                    : 0;
                break;
            case 'payments:Count':
                summary[metric] = rows.length;
                break;
            case 'payments:Dues': {
                const q: any = { tenantId, status: { $in: ['pending', 'failed'] } };
                if (range) q.createdAt = { $gte: range.start, $lte: range.end };
                const agg = await Payment.aggregate([
                    { $match: q },
                    { $group: { _id: null, total: { $sum: '$amount.total' } } },
                ]);
                summary[metric] = Math.round((agg[0]?.total ?? 0) * 100) / 100;
                break;
            }
            case 'attendance:Check-ins':
                summary[metric] = rows.length;
                break;
            case 'attendance:Daily Avg': {
                const days = range ? Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / 86400000)) : 30;
                summary[metric] = Math.round((rows.length / days) * 10) / 10;
                break;
            }
            case 'attendance:Peak Hour': {
                const q: any = { tenantId };
                if (range) q.checkInTime = { $gte: range.start, $lte: range.end };
                const buckets = await Attendance.aggregate([
                    { $match: q },
                    { $group: { _id: { $hour: '$checkInTime' }, count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                    { $limit: 1 },
                ]);
                summary[metric] = buckets.length ? `${buckets[0]._id}:00 - ${buckets[0]._id + 1}:00` : 'Not enough data';
                break;
            }
            case 'classes:Attendance':
                summary[metric] = rows.reduce((s, r) => s + num(r['Booked']), 0);
                break;
            case 'classes:Occupancy %': {
                const withCap = rows.filter((r) => num(r['Capacity']) > 0);
                summary[metric] = withCap.length
                    ? Math.round((withCap.reduce((s, r) => s + num(r['Booked']) / num(r['Capacity']), 0) / withCap.length) * 1000) / 10
                    : 0;
                break;
            }
            case 'classes:Revenue':
                summary[metric] = 'Not tracked';
                break;
            case 'users:Attendance %': {
                const q: any = { tenantId };
                if (range) q.date = { $gte: range.start, $lte: range.end };
                const total = await StaffAttendance.countDocuments(q);
                const present = await StaffAttendance.countDocuments({ ...q, status: { $in: ['present', 'late', 'half_day'] } });
                summary[metric] = total ? Math.round((present / total) * 1000) / 10 : 'Not enough data';
                break;
            }
            case 'users:Tasks Done':
            case 'users:Payroll':
                summary[metric] = 'Not tracked';
                break;
            case 'leads:Count':
                summary[metric] = rows.length;
                break;
            case 'leads:Conversion Rate': {
                const converted = rows.filter((r) => r['Status'] === 'converted').length;
                summary[metric] = rows.length ? Math.round((converted / rows.length) * 1000) / 10 : 0;
                break;
            }
            case 'leads:By Source': {
                const bySource: Record<string, number> = {};
                rows.forEach((r) => {
                    const s = r['Source'] || 'unknown';
                    bySource[s] = (bySource[s] || 0) + 1;
                });
                Object.entries(bySource).forEach(([k, v]) => {
                    summary[`${metric}: ${k}`] = v;
                });
                break;
            }
            default:
                summary[metric] = rows.length;
        }
    }

    return summary;
}

export async function getRecentReports(req: Request, res: Response): Promise<void> {
    try {
        const tenantId = req.tenantId as string;
        const reports = await CustomReport.find({ tenantId }).sort({ updatedAt: -1 }).limit(15);
        res.json({
            success: true,
            data: reports.map((r: any) => ({
                id: r._id,
                name: r.name,
                generatedAt: r.updatedAt ?? r.createdAt,
            })),
        });
    } catch (err: any) {
        logger.error('getRecentReports failed', { error: err.message });
        res.status(500).json({ success: false, message: err.message });
    }
}

export async function createReportDefinition(req: Request, res: Response): Promise<void> {
    try {
        const tenantId = req.tenantId as string;
        const { source, period } = req.body || {};
        const dataSource = SOURCE_MAP[source];

        if (!dataSource) {
            res.status(400).json({ success: false, message: `Unsupported data source: ${source}` });
            return;
        }

        const range = periodToRange(period);
        const columns = COLUMN_SETS[dataSource];
        const filters = range
            ? [{ field: DATE_FIELD[dataSource], operator: 'between' as const, value: [range.start, range.end] }]
            : [];
        const name = `${source} Report`;

        const created = await customReportService.createReport({ name, dataSource, filters, columns, tenantId });
        res.status(201).json({ success: true, data: { id: (created as any)._id, name } });
    } catch (err: any) {
        logger.error('createReportDefinition failed', { error: err.message });
        res.status(500).json({ success: false, message: err.message });
    }
}

export async function generateCustomReport(req: Request, res: Response): Promise<void> {
    try {
        const tenantId = req.tenantId as string;
        const { source, metrics = [], period } = req.body || {};
        const dataSource = SOURCE_MAP[source];

        if (!dataSource) {
            res.status(400).json({ success: false, message: `Unsupported data source: ${source}` });
            return;
        }

        const range = periodToRange(period);
        const columns = COLUMN_SETS[dataSource];
        const filters = range
            ? [{ field: DATE_FIELD[dataSource], operator: 'between' as const, value: [range.start, range.end] }]
            : [];
        const name = `${source} Report - ${new Date().toLocaleDateString()}`;
        const description = JSON.stringify({ metrics });

        const created = await customReportService.createReport({ name, description, dataSource, filters, columns, tenantId });
        const result = await customReportService.executeReport((created as any)._id.toString());
        const summary = await computeSummary(dataSource, metrics, result.data, tenantId, range);

        res.json({
            success: true,
            data: {
                id: (created as any)._id,
                name,
                generatedAt: result.executedAt,
                columns: columns.map((c) => c.label),
                rows: result.data,
                summary,
                recordCount: result.recordCount,
            },
        });
    } catch (err: any) {
        logger.error('generateCustomReport failed', { error: err.message });
        res.status(500).json({ success: false, message: err.message });
    }
}

export async function getReportById(req: Request, res: Response): Promise<void> {
    try {
        const tenantId = req.tenantId as string;
        const reportId = String(req.params.reportId);
        const report = await CustomReport.findOne({ _id: reportId, tenantId });

        if (!report) {
            res.status(404).json({ success: false, message: 'Report not found' });
            return;
        }

        const result = await customReportService.executeReport(reportId);

        let metrics: string[] = [];
        try {
            metrics = JSON.parse(report.description || '{}').metrics || [];
        } catch {
            metrics = [];
        }

        const dateFilter = (report.filters || []).find((f: any) => f.operator === 'between');
        const range = dateFilter ? { start: new Date(dateFilter.value[0]), end: new Date(dateFilter.value[1]) } : null;
        const summary = metrics.length
            ? await computeSummary(report.dataSource as DataSource, metrics, result.data, tenantId, range)
            : result.aggregations;

        res.json({
            success: true,
            data: {
                id: report._id,
                name: report.name,
                generatedAt: result.executedAt,
                columns: (report.columns || []).map((c: any) => c.label),
                rows: result.data,
                summary,
                recordCount: result.recordCount,
            },
        });
    } catch (err: any) {
        logger.error('getReportById failed', { error: err.message });
        res.status(500).json({ success: false, message: err.message });
    }
}

export async function exportReport(req: Request, res: Response): Promise<void> {
    try {
        const tenantId = req.tenantId as string;
        const { type = 'Members', format = 'CSV', date_range } = req.body || {};
        const dataSource = SOURCE_MAP[type];

        if (!dataSource) {
            res.status(400).json({ success: false, message: `Unsupported export type: ${type}` });
            return;
        }

        const range = periodToRange(date_range);
        const columns = COLUMN_SETS[dataSource];
        const filters = range
            ? [{ field: DATE_FIELD[dataSource], operator: 'between' as const, value: [range.start, range.end] }]
            : [];
        const name = `${type}_Export_${Date.now()}`;

        const created = await customReportService.createReport({ name, dataSource, filters, columns, tenantId });
        const result = await customReportService.executeReport((created as any)._id.toString());
        const rows = result.data as Record<string, any>[];
        const headers = columns.map((c) => c.label);

        if (format === 'PDF') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`);
            const doc = new PDFDocument({ margin: 40, size: 'A4' });
            doc.pipe(res);
            doc.fontSize(16).text(name.replace(/_/g, ' '), { align: 'center' });
            doc.moveDown();
            doc.fontSize(9);
            if (rows.length === 0) {
                doc.text('No data available for this range.');
            } else {
                rows.slice(0, 200).forEach((row) => {
                    doc.text(headers.map((h) => `${h}: ${row[h] ?? '-'}`).join('   |   '));
                });
                if (rows.length > 200) doc.text(`... and ${rows.length - 200} more records`);
            }
            doc.end();
            return;
        }

        if (format === 'Excel') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet(type);
            sheet.columns = headers.map((h) => ({ header: h, key: h, width: 20 }));
            rows.forEach((row) => sheet.addRow(row));
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        const parser = new CsvParser({ fields: headers });
        const csv = rows.length ? parser.parse(rows) : headers.join(',');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
        res.send(csv);
    } catch (err: any) {
        logger.error('exportReport failed', { error: err.message });
        res.status(500).json({ success: false, message: err.message });
    }
}
