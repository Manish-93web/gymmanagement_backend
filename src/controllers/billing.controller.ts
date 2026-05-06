import { Request, Response, NextFunction } from 'express';
import Payment from '../models/Payment.model';
import Member from '../models/Member.model';
import mongoose from 'mongoose';

export class BillingController {
    async getMyInvoices(req: Request, res: Response, next: NextFunction) {
        try {
            const user = req.user!;
            let query: any = { tenantId: user.tenantId };
            if (user.role === 'member') {
                const member = await Member.findOne({ userId: user._id });
                if (!member) return res.status(404).json({ success: false, message: 'Member not found' });
                query.memberId = member._id;
            }
            const payments = await Payment.find(query)
                .sort({ createdAt: -1 })
                .limit(50)
                .populate('memberId', 'firstName lastName');
            return res.json({ success: true, data: payments });
        } catch (error) { return next(error); }
    }

    async getInvoiceById(req: Request, res: Response, next: NextFunction) {
        try {
            const payment = await Payment.findById(req.params.paymentId)
                .populate('memberId', 'firstName lastName email mobile')
                .populate('planId', 'name');
            if (!payment) return res.status(404).json({ success: false, message: 'Invoice not found' });
            return res.json({ success: true, data: payment });
        } catch (error) { return next(error); }
    }

    async downloadInvoice(req: Request, res: Response, next: NextFunction) {
        try {
            const payment = await Payment.findById(req.params.paymentId)
                .populate('memberId', 'firstName lastName email')
                .populate('planId', 'name price');
            if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
            const member = (payment as any).memberId;
            const plan = (payment as any).planId;
            // Return invoice data for frontend to generate PDF
            const invoiceData = {
                invoiceNumber: payment.invoiceNumber || `INV-${payment._id.toString().slice(-6).toUpperCase()}`,
                date: payment.createdAt,
                member: {
                    name: `${member?.firstName || ''} ${member?.lastName || ''}`.trim(),
                    email: member?.email
                },
                plan: {
                    name: plan?.name || 'Membership',
                    price: plan?.price || (payment as any).amount?.total
                },
                amount: (payment as any).amount,
                method: (payment as any).method,
                status: (payment as any).status
            };
            return res.json({ success: true, data: invoiceData });
        } catch (error) { return next(error); }
    }

    async getPaymentHistory(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { page = 1, limit = 20, startDate, endDate, status, memberId } = req.query;
            const query: any = { tenantId };
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate as string);
                if (endDate) query.createdAt.$lte = new Date(endDate as string);
            }
            if (status) query.status = status;
            if (memberId) query.memberId = new mongoose.Types.ObjectId(memberId as string);
            const skip = (Number(page) - 1) * Number(limit);
            const [payments, total] = await Promise.all([
                Payment.find(query)
                    .populate('memberId', 'firstName lastName membershipNumber')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(Number(limit)),
                Payment.countDocuments(query)
            ]);
            return res.json({ success: true, data: { payments, total, page: Number(page) } });
        } catch (error) { return next(error); }
    }

    async getPaymentStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const tenantObjId = new mongoose.Types.ObjectId(tenantId as unknown as string);
            const [monthlyRevenue, totalRevenue, pending] = await Promise.all([
                Payment.aggregate([
                    { $match: { tenantId: tenantObjId, status: 'completed', createdAt: { $gte: monthStart } } },
                    { $group: { _id: null, total: { $sum: '$amount.total' }, count: { $sum: 1 } } }
                ]),
                Payment.aggregate([
                    { $match: { tenantId: tenantObjId, status: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$amount.total' } } }
                ]),
                Payment.countDocuments({ tenantId, status: 'pending' })
            ]);
            return res.json({
                success: true,
                data: {
                    monthlyRevenue: monthlyRevenue[0]?.total || 0,
                    monthlyCount: monthlyRevenue[0]?.count || 0,
                    totalRevenue: totalRevenue[0]?.total || 0,
                    pendingPayments: pending
                }
            });
        } catch (error) { return next(error); }
    }

    async getWhatsAppUsage(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const AuditLog = (await import('../models/AuditLog.model')).default;
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const [total, thisMonth] = await Promise.all([
                AuditLog.countDocuments({ tenantId, action: 'whatsapp_sent' }),
                AuditLog.countDocuments({ tenantId, action: 'whatsapp_sent', createdAt: { $gte: monthStart } })
            ]);
            return res.json({ success: true, data: { totalSent: total, sentThisMonth: thisMonth } });
        } catch (error) { return next(error); }
    }
}

export default new BillingController();
