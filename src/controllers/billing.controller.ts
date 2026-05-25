import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Payment from '../models/Payment.model';
import WhatsAppLog from '../models/WhatsAppLog.model';
import InvoiceService from '../services/invoice.service';
import fs from 'fs';

class BillingController {
    // GET /billing/my-invoices  — returns payments for the logged-in member
    async getMyInvoices(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            if (!req.user) {
                return res.status(401).json({ success: false, message: 'Authentication required' });
            }

            const { page = '1', limit = '20' } = req.query;
            const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

            const filter = { memberId: req.user!._id, tenantId };

            const [payments, total] = await Promise.all([
                Payment.find(filter)
                    .populate('planId', 'name duration')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit as string)),
                Payment.countDocuments(filter),
            ]);

            return res.json({
                success: true,
                data: payments,
                pagination: {
                    total,
                    page: parseInt(page as string),
                    limit: parseInt(limit as string),
                    pages: Math.ceil(total / parseInt(limit as string)),
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /billing/payments  — admin: list all payments for the tenant
    async getPaymentHistory(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const {
                memberId,
                status,
                type,
                method,
                startDate,
                endDate,
                branchId,
                page = '1',
                limit = '20',
            } = req.query;

            const filter: Record<string, any> = { tenantId };

            if (memberId) filter.memberId = memberId;
            if (status) filter.status = status;
            if (type) filter.type = type;
            if (method) filter.method = method;
            if (branchId) filter.branchId = branchId;
            if (startDate || endDate) {
                filter.createdAt = {};
                if (startDate) filter.createdAt.$gte = new Date(startDate as string);
                if (endDate) filter.createdAt.$lte = new Date(endDate as string);
            }

            const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

            const [payments, total] = await Promise.all([
                Payment.find(filter)
                    .populate('memberId', 'firstName lastName email mobile membershipNumber')
                    .populate('planId', 'name duration')
                    .populate('collectedBy', 'firstName lastName role')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit as string)),
                Payment.countDocuments(filter),
            ]);

            return res.json({
                success: true,
                data: payments,
                pagination: {
                    total,
                    page: parseInt(page as string),
                    limit: parseInt(limit as string),
                    pages: Math.ceil(total / parseInt(limit as string)),
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /billing/stats  — total revenue, pending, refunded
    async getPaymentStats(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const tenantObjId = new mongoose.Types.ObjectId(tenantId);

            const { startDate, endDate } = req.query;

            const matchFilter: Record<string, any> = { tenantId: tenantObjId };
            if (startDate || endDate) {
                matchFilter.createdAt = {};
                if (startDate) matchFilter.createdAt.$gte = new Date(startDate as string);
                if (endDate) matchFilter.createdAt.$lte = new Date(endDate as string);
            }

            const [aggregated, statusCounts] = await Promise.all([
                Payment.aggregate([
                    { $match: matchFilter },
                    {
                        $group: {
                            _id: null,
                            totalRevenue: {
                                $sum: {
                                    $cond: [{ $eq: ['$status', 'completed'] }, '$amount.total', 0],
                                },
                            },
                            totalPending: {
                                $sum: {
                                    $cond: [{ $eq: ['$status', 'pending'] }, '$amount.total', 0],
                                },
                            },
                            totalRefunded: {
                                $sum: {
                                    $cond: [
                                        {
                                            $in: ['$status', ['refunded', 'partially_refunded']],
                                        },
                                        '$amount.total',
                                        0,
                                    ],
                                },
                            },
                            totalTransactions: { $sum: 1 },
                        },
                    },
                ]),
                Payment.aggregate([
                    { $match: matchFilter },
                    { $group: { _id: '$status', count: { $sum: 1 } } },
                ]),
            ]);

            const stats = aggregated[0] || {
                totalRevenue: 0,
                totalPending: 0,
                totalRefunded: 0,
                totalTransactions: 0,
            };

            const byStatus: Record<string, number> = {};
            statusCounts.forEach((s: any) => {
                byStatus[s._id] = s.count;
            });

            return res.json({
                success: true,
                data: {
                    totalRevenue: stats.totalRevenue,
                    totalPending: stats.totalPending,
                    totalRefunded: stats.totalRefunded,
                    totalTransactions: stats.totalTransactions,
                    byStatus,
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /billing/invoices/:paymentId  — return single payment record as invoice
    async getInvoiceById(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const payment = await Payment.findOne({ _id: req.params.paymentId, tenantId })
                .populate('memberId', 'firstName lastName email mobile membershipNumber')
                .populate('planId', 'name duration durationValue pricing')
                .populate('collectedBy', 'firstName lastName');

            if (!payment) {
                return res.status(404).json({ success: false, message: 'Invoice not found' });
            }

            return res.json({ success: true, data: payment });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /billing/invoices/:paymentId/download  — generate and stream PDF
    async downloadInvoice(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant context required' });
                return;
            }

            const payment = await Payment.findOne({ _id: req.params.paymentId, tenantId });
            if (!payment) {
                res.status(404).json({ success: false, message: 'Payment not found' });
                return;
            }

            const invoiceUrl = await InvoiceService.getInvoiceUrl(String(req.params.paymentId));

            // invoiceUrl is a local path like /invoices/INV-XXXXXXXX.pdf
            // Stream the file; fall back to redirect for cloud-storage URLs
            const localPath = `${process.cwd()}${invoiceUrl}`;

            if (fs.existsSync(localPath)) {
                const fileName = invoiceUrl.split('/').pop() || 'invoice.pdf';
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                fs.createReadStream(localPath).pipe(res);
            } else {
                res.redirect(invoiceUrl);
            }
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    // GET /billing/whatsapp-usage  — return WhatsApp message count for billing
    async getWhatsAppUsage(req: Request, res: Response): Promise<Response> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'Tenant context required' });
            }

            const { startDate, endDate, month, year } = req.query;

            const tenantObjId = new mongoose.Types.ObjectId(tenantId);
            const matchFilter: Record<string, any> = { tenantId: tenantObjId };

            if (month && year) {
                const start = new Date(
                    parseInt(year as string),
                    parseInt(month as string) - 1,
                    1
                );
                const end = new Date(
                    parseInt(year as string),
                    parseInt(month as string),
                    0,
                    23,
                    59,
                    59
                );
                matchFilter.sentAt = { $gte: start, $lte: end };
            } else if (startDate || endDate) {
                matchFilter.sentAt = {};
                if (startDate) matchFilter.sentAt.$gte = new Date(startDate as string);
                if (endDate) matchFilter.sentAt.$lte = new Date(endDate as string);
            }

            const [totalCount, byType] = await Promise.all([
                WhatsAppLog.countDocuments(matchFilter),
                WhatsAppLog.aggregate([
                    { $match: matchFilter },
                    { $group: { _id: '$type', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                ]),
            ]);

            const usageByType: Record<string, number> = {};
            byType.forEach((t: any) => {
                usageByType[t._id] = t.count;
            });

            return res.json({
                success: true,
                data: {
                    totalMessages: totalCount,
                    usageByType,
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: error.message });
        }
    }
}

export default new BillingController();
