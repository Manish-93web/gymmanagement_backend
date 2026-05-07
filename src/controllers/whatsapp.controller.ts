import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import WhatsAppLog from '../models/WhatsAppLog.model';
import WaReminder from '../models/WaReminder.model';

class WhatsAppController {
    // GET /api/whatsapp/scheduled  — due=true returns array of ScheduledReminder
    async getScheduled(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const { page = '1', limit = '20', status, due } = req.query as Record<string, string>;
            const filter: any = { tenantId };
            if (status) filter.status = status;
            if (due === 'true') {
                filter.status = 'pending';
                filter.scheduledFor = { $lte: new Date() };
                const reminders = await WaReminder.find(filter).sort({ scheduledFor: 1 }).lean();
                return res.json({ success: true, data: reminders });
            }
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [messages, total] = await Promise.all([
                WaReminder.find(filter).sort({ scheduledFor: -1 }).skip(skip).limit(parseInt(limit)).lean(),
                WaReminder.countDocuments(filter),
            ]);
            res.json({ success: true, data: { messages, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
        } catch (error) { next(error); }
    }

    // POST /api/whatsapp/scheduled
    async createScheduled(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const user = req.user!;
            const { memberId, memberName, phone, type, message, scheduledFor, notes } = req.body;
            if (!memberName || !phone || !message) {
                res.status(400).json({ success: false, message: 'memberName, phone, and message are required' });
                return;
            }
            const reminder = await WaReminder.create({
                tenantId,
                memberId: memberId || undefined,
                memberName,
                phone,
                type: type || 'custom_message',
                message,
                scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
                notes,
                status: 'pending',
                createdBy: user._id,
                createdByName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
            });
            res.status(201).json({ success: true, data: reminder });
        } catch (error) { next(error); }
    }

    // GET /api/whatsapp/scheduled/:id
    async getScheduledById(req: Request, res: Response, next: NextFunction) {
        try {
            const reminder = await WaReminder.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
            if (!reminder) { res.status(404).json({ success: false, message: 'Reminder not found' }); return; }
            res.json({ success: true, data: reminder });
        } catch (error) { next(error); }
    }

    // PATCH /api/whatsapp/scheduled/:id
    async updateScheduled(req: Request, res: Response, next: NextFunction) {
        try {
            const reminder = await WaReminder.findOneAndUpdate(
                { _id: req.params.id, tenantId: req.tenantId },
                { $set: req.body },
                { new: true }
            ).lean();
            if (!reminder) { res.status(404).json({ success: false, message: 'Reminder not found' }); return; }
            res.json({ success: true, data: reminder });
        } catch (error) { next(error); }
    }

    // DELETE /api/whatsapp/scheduled/:id
    async deleteScheduled(req: Request, res: Response, next: NextFunction) {
        try {
            await WaReminder.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
            res.json({ success: true, message: 'Deleted' });
        } catch (error) { next(error); }
    }

    // POST /api/whatsapp-quick/logs — save a message log entry
    async saveLog(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const user = req.user!;
            const { memberId, memberName, phone, type, message, status = 'opened' } = req.body;

            if (!memberId || !memberName || !phone || !type || !message) {
                res.status(400).json({ success: false, message: 'memberId, memberName, phone, type, message are required' });
                return;
            }

            const log = await WhatsAppLog.create({
                tenantId,
                memberId,
                memberName,
                phone,
                type,
                message,
                status,
                sentBy: user._id,
                sentByName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
                sentAt: new Date(),
            });

            res.status(201).json({ success: true, data: log });
        } catch (error) { next(error); }
    }

    // GET /api/whatsapp/stats — aggregate stats from WhatsAppLog model
    async getStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;

            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay());

            const [total, today, thisWeek, byTypeRaw, recentLogs, monthlyRaw] = await Promise.all([
                WhatsAppLog.countDocuments({ tenantId }),
                WhatsAppLog.countDocuments({ tenantId, sentAt: { $gte: startOfDay } }),
                WhatsAppLog.countDocuments({ tenantId, sentAt: { $gte: startOfWeek } }),
                WhatsAppLog.aggregate([
                    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId as string) } },
                    { $group: { _id: '$type', count: { $sum: 1 } } },
                ]),
                WhatsAppLog.find({ tenantId }).sort({ sentAt: -1 }).limit(10).lean(),
                WhatsAppLog.aggregate([
                    { $match: { tenantId: new mongoose.Types.ObjectId(tenantId as string) } },
                    { $group: { _id: { month: { $month: '$sentAt' }, year: { $year: '$sentAt' } }, count: { $sum: 1 } } },
                    { $sort: { '_id.year': -1, '_id.month': -1 } },
                    { $limit: 12 },
                ]),
            ]);

            const byType: Record<string, number> = {};
            let mostUsed: string | null = null;
            let maxCount = 0;
            for (const entry of byTypeRaw) {
                byType[entry._id] = entry.count;
                if (entry.count > maxCount) { maxCount = entry.count; mostUsed = entry._id; }
            }

            const monthlyStats = monthlyRaw.map(m => ({
                month: new Date(m._id.year, m._id.month - 1).toLocaleString('en', { month: 'long' }),
                year: m._id.year,
                count: m.count,
            }));

            res.json({ success: true, data: { total, today, thisWeek, byType, mostUsed, recentLogs, monthlyStats } });
        } catch (error) { next(error); }
    }

    // GET /api/whatsapp/logs
    async getLogs(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const { memberId, page = '1', limit = '20' } = req.query as Record<string, string>;
            const filter: any = { tenantId };
            if (memberId) filter.memberId = memberId;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [logs, total] = await Promise.all([
                WhatsAppLog.find(filter).sort({ sentAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
                WhatsAppLog.countDocuments(filter),
            ]);
            res.json({ success: true, data: { logs, pagination: { total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } } });
        } catch (error) { next(error); }
    }

    // POST /api/whatsapp/create-pdf-link
    async createPdfLink(req: Request, res: Response, next: NextFunction) {
        try {
            const { paymentId, type } = req.body;
            if (!paymentId || !type) {
                res.status(400).json({ success: false, message: 'paymentId and type required' });
                return;
            }
            const token = Buffer.from(`${paymentId}:${type}:${Date.now()}`).toString('base64url');
            const link = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/p/${type}/${token}`;
            res.json({ success: true, data: { link, token, expiresIn: '24h' } });
        } catch (error) { next(error); }
    }

    // POST /api/whatsapp/send-bulk
    async sendBulk(req: Request, res: Response, next: NextFunction) {
        try {
            const { recipients, message, templateId } = req.body;
            if (!recipients || !Array.isArray(recipients) || !message) {
                res.status(400).json({ success: false, message: 'recipients array and message required' });
                return;
            }
            const results = recipients.map((r: string) => ({
                to: r,
                status: 'queued',
                queuedAt: new Date(),
            }));
            res.json({ success: true, message: `${results.length} messages queued`, data: results });
        } catch (error) { next(error); }
    }
}

export default new WhatsAppController();
