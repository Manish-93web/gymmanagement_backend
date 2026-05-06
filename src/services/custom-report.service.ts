import Member from '../models/Member.model';
import Payment from '../models/Payment.model';
import Attendance from '../models/Attendance.model';
import Class from '../models/Class.model';
import User from '../models/User.model';
import CustomReport from '../models/CustomReport.model';
import logger from '../config/logger';

interface ReportConfig {
    name: string;
    description?: string;
    dataSource: 'members' | 'payments' | 'attendance' | 'classes' | 'users';
    filters: ReportFilter[];
    columns: ReportColumn[];
    groupBy?: string[];
    aggregations?: ReportAggregation[];
    sortBy?: { field: string; order: 'asc' | 'desc' }[];
    tenantId: string;
}

interface ReportFilter {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'between' | 'in';
    value: any;
}

interface ReportColumn {
    field: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
    format?: string;
}

interface ReportAggregation {
    field: string;
    function: 'sum' | 'avg' | 'count' | 'min' | 'max';
    label: string;
}

class CustomReportService {
    /**
     * Create custom report configuration
     */
    async createReport(config: ReportConfig) {
        const report = await CustomReport.create({
            ...config,
            createdAt: new Date(),
        });

        logger.info('Custom report created', { reportId: report._id });

        return report;
    }

    /**
     * Execute custom report
     */
    async executeReport(reportId: string, additionalFilters?: ReportFilter[]) {
        const report = await CustomReport.findById(reportId);

        if (!report) {
            throw new Error('Report not found');
        }

        // Get data source model
        const Model = this.getModel(report.dataSource);

        // Build query
        const query = this.buildQuery(report.filters as any, additionalFilters as any);

        // Execute query
        let queryBuilder = Model.find(query);
        if (report.dataSource !== 'users') {
            queryBuilder = queryBuilder.populate('userId');
        }
        let data = await queryBuilder;

        // Apply column selection
        if (report.columns && report.columns.length > 0) {
            data = data.map((item: any) => {
                const obj: any = {};
                report.columns.forEach((col: any) => {
                    // Handle nested fields like personalInfo.firstName or userId.firstName
                    const value = col.field.split('.').reduce((acc: any, part: string) => acc && acc[part], item);
                    obj[col.label] = this.formatValue(value, col.type, col.format);
                });
                return obj;
            });
        }

        // Apply grouping
        if (report.groupBy && report.groupBy.length > 0) {
            data = this.groupData(data, report.groupBy);
        }

        // Apply aggregations
        let aggregations: any = {};
        if (report.aggregations && report.aggregations.length > 0) {
            aggregations = this.calculateAggregations(data, report.aggregations as any);
        }

        // Apply sorting
        if (report.sortBy && report.sortBy.length > 0) {
            data = this.sortData(data, report.sortBy);
        }

        logger.info('Custom report executed', { reportId, recordCount: data.length });

        return {
            reportName: report.name,
            executedAt: new Date(),
            recordCount: data.length,
            data,
            aggregations,
        };
    }

    /**
     * Get available data sources
     */
    async getDataSources() {
        return [
            {
                name: 'members',
                label: 'Members',
                fields: [
                    { name: 'firstName', label: 'First Name', type: 'string' },
                    { name: 'lastName', label: 'Last Name', type: 'string' },
                    { name: 'email', label: 'Email', type: 'string' },
                    { name: 'mobile', label: 'Mobile', type: 'string' },
                    { name: 'status', label: 'Status', type: 'string' },
                    { name: 'membershipStart', label: 'Membership Start', type: 'date' },
                    { name: 'membershipExpiry', label: 'Membership Expiry', type: 'date' },
                    { name: 'createdAt', label: 'Joined Date', type: 'date' },
                ],
            },
            {
                name: 'payments',
                label: 'Payments',
                fields: [
                    { name: 'amount', label: 'Amount', type: 'number' },
                    { name: 'status', label: 'Status', type: 'string' },
                    { name: 'gateway', label: 'Payment Gateway', type: 'string' },
                    { name: 'createdAt', label: 'Payment Date', type: 'date' },
                    { name: 'discount', label: 'Discount', type: 'number' },
                ],
            },
            {
                name: 'attendance',
                label: 'Attendance',
                fields: [
                    { name: 'checkInTime', label: 'Check In Time', type: 'date' },
                    { name: 'checkOutTime', label: 'Check Out Time', type: 'date' },
                    { name: 'duration', label: 'Duration (minutes)', type: 'number' },
                    { name: 'createdAt', label: 'Date', type: 'date' },
                ],
            },
            {
                name: 'classes',
                label: 'Classes',
                fields: [
                    { name: 'name', label: 'Class Name', type: 'string' },
                    { name: 'type', label: 'Class Type', type: 'string' },
                    { name: 'startTime', label: 'Start Time', type: 'date' },
                    { name: 'endTime', label: 'End Time', type: 'date' },
                    { name: 'maxCapacity', label: 'Max Capacity', type: 'number' },
                    { name: 'currentCapacity', label: 'Current Capacity', type: 'number' },
                ],
            },
            {
                name: 'users',
                label: 'Staff',
                fields: [
                    { name: 'firstName', label: 'First Name', type: 'string' },
                    { name: 'lastName', label: 'Last Name', type: 'string' },
                    { name: 'role', label: 'Role', type: 'string' },
                    { name: 'email', label: 'Email', type: 'string' },
                    { name: 'isActive', label: 'Active', type: 'boolean' },
                    { name: 'createdAt', label: 'Joined Date', type: 'date' },
                ],
            },
        ];
    }

    /**
     * Get model by data source
     */
    private getModel(dataSource: string) {
        const models: any = {
            members: Member,
            payments: Payment,
            attendance: Attendance,
            classes: Class,
            users: User,
        };

        return models[dataSource] || Member;
    }

    /**
     * Build MongoDB query from filters
     */
    private buildQuery(filters: ReportFilter[], additionalFilters?: ReportFilter[]) {
        const query: any = {};

        const allFilters = [...filters];
        if (additionalFilters) {
            allFilters.push(...additionalFilters);
        }

        allFilters.forEach((filter) => {
            switch (filter.operator) {
                case 'equals':
                    query[filter.field] = filter.value;
                    break;
                case 'not_equals':
                    query[filter.field] = { $ne: filter.value };
                    break;
                case 'contains':
                    query[filter.field] = { $regex: filter.value, $options: 'i' };
                    break;
                case 'greater_than':
                    query[filter.field] = { $gt: filter.value };
                    break;
                case 'less_than':
                    query[filter.field] = { $lt: filter.value };
                    break;
                case 'between':
                    query[filter.field] = { $gte: filter.value[0], $lte: filter.value[1] };
                    break;
                case 'in':
                    query[filter.field] = { $in: filter.value };
                    break;
            }
        });

        return query;
    }

    /**
     * Format value based on type
     */
    private formatValue(value: any, type: string, format?: string): any {
        if (value === null || value === undefined) return '';

        switch (type) {
            case 'date':
                return new Date(value).toLocaleDateString();
            case 'number':
                return format === 'currency' ? `₹${value.toFixed(2)}` : value;
            case 'boolean':
                return value ? 'Yes' : 'No';
            default:
                return value;
        }
    }

    /**
     * Group data
     */
    private groupData(data: any[], groupBy: string[]) {
        const grouped: any = {};

        data.forEach((item) => {
            const key = groupBy.map((field) => item[field]).join('_');
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(item);
        });

        return Object.entries(grouped).map(([key, items]) => ({
            group: key,
            items,
            count: (items as any[]).length,
        }));
    }

    /**
     * Calculate aggregations
     */
    private calculateAggregations(data: any[], aggregations: ReportAggregation[]) {
        const results: any = {};

        aggregations.forEach((agg) => {
            const values = data.map((item) => item[agg.field]).filter((v) => v !== null && v !== undefined);

            switch (agg.function) {
                case 'sum':
                    results[agg.label] = values.reduce((sum, val) => sum + val, 0);
                    break;
                case 'avg':
                    results[agg.label] = values.reduce((sum, val) => sum + val, 0) / values.length;
                    break;
                case 'count':
                    results[agg.label] = values.length;
                    break;
                case 'min':
                    results[agg.label] = Math.min(...values);
                    break;
                case 'max':
                    results[agg.label] = Math.max(...values);
                    break;
            }
        });

        return results;
    }

    /**
     * Sort data
     */
    private sortData(data: any[], sortBy: { field: string; order: 'asc' | 'desc' }[]) {
        return data.sort((a, b) => {
            for (const sort of sortBy) {
                const aVal = a[sort.field];
                const bVal = b[sort.field];

                if (aVal < bVal) return sort.order === 'asc' ? -1 : 1;
                if (aVal > bVal) return sort.order === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }

    /**
     * Get all reports
     */
    async getAllReports(tenantId: string) {
        const reports = await CustomReport.find({ tenantId }).sort({ createdAt: -1 });
        return reports;
    }

    /**
     * Update report
     */
    async updateReport(reportId: string, updates: Partial<ReportConfig>) {
        const report = await CustomReport.findByIdAndUpdate(reportId, updates, { new: true });

        if (!report) {
            throw new Error('Report not found');
        }

        logger.info('Custom report updated', { reportId });

        return report;
    }

    /**
     * Delete report
     */
    async deleteReport(reportId: string) {
        const report = await CustomReport.findByIdAndDelete(reportId);

        if (!report) {
            throw new Error('Report not found');
        }

        logger.info('Custom report deleted', { reportId });

        return {
            success: true,
            message: 'Report deleted successfully',
        };
    }
}

export default new CustomReportService();
