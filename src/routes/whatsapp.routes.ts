import { Router, Request, Response, NextFunction } from 'express';
import whatsappController from '../controllers/whatsapp.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import WhatsAppAutomationConfig from '../models/WhatsAppAutomationConfig.model';
import WhatsAppInbox from '../models/WhatsAppInbox.model';
import Member from '../models/Member.model';

const router = Router();

// ─── Webhook — no auth (called by WhatsApp Business API servers) ──────────────
router.post('/webhook/incoming', async (req: Request, res: Response) => {
  try {
    const { from, fromName, message, messageId, mediaUrl } = req.body;
    if (!from || !message) return res.status(400).json({ success: false, message: 'from and message are required' });

    // Try to match to a member by mobile phone
    const member = await Member.findOne({
      $or: [
        { mobile: from },
        { mobile: from.replace('+', '') },
        { mobile: from.replace(/^\+91/, '') },
      ],
    });

    const inbox = await WhatsAppInbox.create({
      tenantId: (req as any).tenantId || member?.tenantId,
      from,
      fromName: fromName || (member ? member.firstName : undefined),
      memberId: member?._id,
      message,
      mediaUrl,
      messageId: messageId || `${from}_${Date.now()}`,
      receivedAt: new Date(),
    });

    return res.json({ success: true, data: inbox });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Authenticated routes ─────────────────────────────────────────────────────
router.use(authenticate, tenantContext);

router.get('/scheduled', whatsappController.getScheduled.bind(whatsappController));
router.post('/scheduled', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), whatsappController.createScheduled.bind(whatsappController));
router.get('/scheduled/:id', whatsappController.getScheduledById.bind(whatsappController));
router.put('/scheduled/:id', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), whatsappController.updateScheduled.bind(whatsappController));
router.delete('/scheduled/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.deleteScheduled.bind(whatsappController));
router.get('/stats', whatsappController.getStats.bind(whatsappController));
router.get('/logs', whatsappController.getLogs.bind(whatsappController));
router.post('/create-pdf-link', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), whatsappController.createPdfLink.bind(whatsappController));
router.post('/send-bulk', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.sendBulk.bind(whatsappController));

// Broadcast campaigns (WhatsAppScheduled — segment-type records)
router.get('/broadcasts', whatsappController.getBroadcasts.bind(whatsappController));
router.post('/broadcasts', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.createBroadcast.bind(whatsappController));
router.patch('/broadcasts/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), whatsappController.updateBroadcast.bind(whatsappController));
router.delete('/broadcasts/:id', requireAnyRole('gym_owner', 'super_admin'), whatsappController.deleteBroadcast.bind(whatsappController));

// ─── Birthday & Festival Automation ──────────────────────────────────────────
// NOTE: Birthday cron runs daily via cron.routes.ts — queries Member.dob where month/day matches today

// GET /automation/birthday-config
router.get('/automation/birthday-config', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        let config = await WhatsAppAutomationConfig.findOne({ tenantId }).lean();
        if (!config) {
            config = await WhatsAppAutomationConfig.create({ tenantId });
            config = config.toObject ? (config as any).toObject() : config;
        }
        res.json({ success: true, data: (config as any).birthday });
    } catch (error) { next(error); }
});

// PUT /automation/birthday-config
router.put('/automation/birthday-config', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        const { enabled, template, sendTime } = req.body;
        const config = await WhatsAppAutomationConfig.findOneAndUpdate(
            { tenantId },
            { $set: { birthday: { enabled, template, sendTime } } },
            { new: true, upsert: true }
        ).lean();
        res.json({ success: true, data: (config as any).birthday });
    } catch (error) { next(error); }
});

// POST /automation/birthday-test
router.post('/automation/birthday-test', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone, name } = req.body;
        if (!phone || !name) {
            res.status(400).json({ success: false, message: 'phone and name are required' });
            return;
        }
        // WhatsApp API integration would send a test birthday message here
        res.json({ success: true, message: `Test birthday message would be sent to ${phone} for ${name} (WhatsApp API integration required)` });
    } catch (error) { next(error); }
});

// GET /automation/festivals
router.get('/automation/festivals', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        let config = await WhatsAppAutomationConfig.findOne({ tenantId }).lean();
        if (!config) {
            const created = await WhatsAppAutomationConfig.create({ tenantId });
            config = created.toObject ? (created as any).toObject() : created;
        }
        res.json({ success: true, data: (config as any).festivals });
    } catch (error) { next(error); }
});

// PUT /automation/festivals
router.put('/automation/festivals', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        const { festivals } = req.body;
        if (!Array.isArray(festivals)) {
            res.status(400).json({ success: false, message: 'festivals must be an array' });
            return;
        }
        const config = await WhatsAppAutomationConfig.findOneAndUpdate(
            { tenantId },
            { $set: { festivals } },
            { new: true, upsert: true }
        ).lean();
        res.json({ success: true, data: (config as any).festivals });
    } catch (error) { next(error); }
});

// POST /automation/festivals/test
router.post('/automation/festivals/test', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone, name, festivalName } = req.body;
        if (!phone || !name || !festivalName) {
            res.status(400).json({ success: false, message: 'phone, name, and festivalName are required' });
            return;
        }
        // WhatsApp API integration would send a test festival message here
        res.json({ success: true, message: `Test ${festivalName} greeting would be sent to ${phone} for ${name} (WhatsApp API integration required)` });
    } catch (error) { next(error); }
});

// ─── Inbox routes ─────────────────────────────────────────────────────────────

// GET /inbox — list incoming messages with optional status filter
router.get('/inbox', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const { status, page = '1', limit = '20' } = req.query;
    const filter: any = { tenantId };
    if (status && status !== 'all') filter.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [messages, total, unreadCount] = await Promise.all([
      WhatsAppInbox.find(filter)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('memberId', 'firstName lastName mobile'),
      WhatsAppInbox.countDocuments(filter),
      WhatsAppInbox.countDocuments({ tenantId, status: 'unread' }),
    ]);
    res.json({ success: true, data: { messages, total, unreadCount } });
  } catch (err) { next(err); }
});

// PATCH /inbox/:id/read — mark message as read
router.patch('/inbox/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const msg = await WhatsAppInbox.findByIdAndUpdate(req.params.id, { status: 'read' }, { new: true });
    if (!msg) { res.status(404).json({ success: false, message: 'Message not found' }); return; }
    res.json({ success: true, data: msg });
  } catch (err) { next(err); }
});

// POST /inbox/:id/reply — log a reply to a message
router.post('/inbox/:id/reply', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message } = req.body;
    if (!message) { res.status(400).json({ success: false, message: 'message is required' }); return; }
    const userId = (req as any).user?._id;
    const msg = await WhatsAppInbox.findByIdAndUpdate(
      req.params.id,
      {
        status: 'replied',
        $push: { replies: { message, sentAt: new Date(), sentBy: userId } },
      },
      { new: true }
    );
    if (!msg) { res.status(404).json({ success: false, message: 'Message not found' }); return; }
    // NOTE: Actual WhatsApp API send would go here
    res.json({ success: true, data: msg, note: 'Reply logged. Integrate WhatsApp Business API send here.' });
  } catch (err) { next(err); }
});

// DELETE /inbox/:id — delete a message
router.delete('/inbox/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await WhatsAppInbox.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
