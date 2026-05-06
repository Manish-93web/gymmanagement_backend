import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';

// In-memory scheduled messages store (replace with DB model in production)
const scheduledMessages: any[] = [];

class WhatsAppController {
    // GET /api/whatsapp-quick/scheduled
    async getScheduled(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const { page = '1', limit = '20', status } = req.query as Record<string, string>;
            let msgs = scheduledMessages.filter(m => m.tenantId === tenantId);
            if (status) msgs = msgs.filter(m => m.status === status);
            const total = msgs.length;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const data = msgs.slice(skip, skip + parseInt(limit));
            res.json({ success: true, data: { messages: data, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
        } catch (error) { next(error); }
    }

    // POST /api/whatsapp-quick/scheduled
    async createScheduled(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const { to, message, scheduledAt, templateId, variables, recipientType } = req.body;
            if (!to || !message) {
                res.status(400).json({ success: false, message: 'to and message are required' });
                return;
            }
            const msg = {
                _id: new mongoose.Types.ObjectId().toString(),
                tenantId,
                to,
                message,
                scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
                templateId,
                variables,
                recipientType: recipientType || 'individual',
                status: 'scheduled',
                createdBy: req.user?._id,
                createdAt: new Date(),
            };
            scheduledMessages.push(msg);
            res.status(201).json({ success: true, data: msg });
        } catch (error) { next(error); }
    }

    // GET /api/whatsapp-quick/scheduled/:id
    async getScheduledById(req: Request, res: Response, next: NextFunction) {
        try {
            const msg = scheduledMessages.find(m => m._id === req.params.id && m.tenantId === req.tenantId);
            if (!msg) { res.status(404).json({ success: false, message: 'Scheduled message not found' }); return; }
            res.json({ success: true, data: msg });
        } catch (error) { next(error); }
    }

    // PUT /api/whatsapp-quick/scheduled/:id
    async updateScheduled(req: Request, res: Response, next: NextFunction) {
        try {
            const idx = scheduledMessages.findIndex(m => m._id === req.params.id && m.tenantId === req.tenantId);
            if (idx === -1) { res.status(404).json({ success: false, message: 'Not found' }); return; }
            Object.assign(scheduledMessages[idx], req.body, { updatedAt: new Date() });
            res.json({ success: true, data: scheduledMessages[idx] });
        } catch (error) { next(error); }
    }

    // DELETE /api/whatsapp-quick/scheduled/:id
    async deleteScheduled(req: Request, res: Response, next: NextFunction) {
        try {
            const idx = scheduledMessages.findIndex(m => m._id === req.params.id && m.tenantId === req.tenantId);
            if (idx !== -1) scheduledMessages.splice(idx, 1);
            res.json({ success: true, message: 'Deleted' });
        } catch (error) { next(error); }
    }

    // GET /api/whatsapp-quick/stats
    async getStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const msgs = scheduledMessages.filter(m => m.tenantId === tenantId);
            const stats = {
                total: msgs.length,
                scheduled: msgs.filter(m => m.status === 'scheduled').length,
                sent: msgs.filter(m => m.status === 'sent').length,
                failed: msgs.filter(m => m.status === 'failed').length,
                creditsUsed: msgs.filter(m => m.status === 'sent').length,
                creditsRemaining: 1000, // placeholder
            };
            res.json({ success: true, data: stats });
        } catch (error) { next(error); }
    }

    // GET /api/whatsapp-quick/logs
    async getLogs(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const sent = scheduledMessages.filter(m => m.tenantId === tenantId && m.status === 'sent');
            res.json({ success: true, data: sent });
        } catch (error) { next(error); }
    }

    // POST /api/whatsapp-quick/create-pdf-link
    async createPdfLink(req: Request, res: Response, next: NextFunction) {
        try {
            const { paymentId, type } = req.body;
            if (!paymentId || !type) {
                res.status(400).json({ success: false, message: 'paymentId and type required' });
                return;
            }
            // Generate a shareable link token
            const token = Buffer.from(`${paymentId}:${type}:${Date.now()}`).toString('base64url');
            const link = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/p/${type}/${token}`;
            res.json({ success: true, data: { link, token, expiresIn: '24h' } });
        } catch (error) { next(error); }
    }

    // POST /api/whatsapp-quick/send-bulk
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
