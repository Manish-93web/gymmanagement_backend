import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import whatsappController from '../controllers/whatsapp.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import WhatsAppAutomationConfig from '../models/WhatsAppAutomationConfig.model';
import WhatsAppInbox from '../models/WhatsAppInbox.model';
import Member from '../models/Member.model';

const router = Router();

// ─── Meta webhook verification (no auth) ─────────────────────────────────────
router.get('/webhook', (req: Request, res: Response) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).json({ success: false, message: 'Verification failed' });
  }
});

// ─── Meta webhook inbound (no auth) ──────────────────────────────────────────
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) { res.sendStatus(200); return; }

    const senderPhone = msg.from;
    const text = msg.text?.body || msg.type || '';
    const messageId = msg.id || `${senderPhone}_${Date.now()}`;
    const member = await Member.findOne({
      $or: [
        { mobile: senderPhone },
        { mobile: senderPhone.replace('+', '') },
        { mobile: senderPhone.replace(/^\+91/, '') },
      ],
    });

    await WhatsAppInbox.create({
      tenantId: member?.tenantId,
      from: senderPhone,
      fromName: member ? `${member.firstName} ${member.lastName}`.trim() : undefined,
      memberId: member?._id,
      message: text,
      messageId,
      direction: 'inbound',
      receivedAt: new Date(Number(msg.timestamp) * 1000 || Date.now()),
    });

    res.sendStatus(200);
  } catch (err: any) {
    console.error('[WhatsApp webhook]', err.message);
    res.sendStatus(200);
  }
});

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
        res.json({ success: true, message: `Test ${festivalName} greeting would be sent to ${phone} for ${name} (WhatsApp API integration required)` });
    } catch (error) { next(error); }
});

// ─── Birthday template routes ─────────────────────────────────────────────────

router.get('/templates/birthday', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        let config = await WhatsAppAutomationConfig.findOne({ tenantId }).lean();
        if (!config) {
            const created = await WhatsAppAutomationConfig.create({ tenantId });
            config = (created as any).toObject();
        }
        const b = (config as any).birthday || {};
        res.json({ success: true, data: { message: b.template, enabled: b.enabled, sendTime: b.sendTime, daysInAdvance: b.daysInAdvance ?? 0 } });
    } catch (error) { next(error); }
});

router.put('/templates/birthday', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        const { message, enabled, sendTime, daysInAdvance } = req.body;
        const config = await WhatsAppAutomationConfig.findOneAndUpdate(
            { tenantId },
            { $set: { 'birthday.template': message, 'birthday.enabled': enabled, 'birthday.sendTime': sendTime, 'birthday.daysInAdvance': daysInAdvance ?? 0 } },
            { new: true, upsert: true }
        ).lean();
        const b = (config as any).birthday || {};
        res.json({ success: true, data: { message: b.template, enabled: b.enabled, sendTime: b.sendTime, daysInAdvance: b.daysInAdvance ?? 0 } });
    } catch (error) { next(error); }
});

router.post('/birthday/test', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone, name } = req.body;
        if (!phone) { res.status(400).json({ success: false, message: 'phone is required' }); return; }
        res.json({ success: true, message: `Test birthday message would be sent to ${phone}${name ? ` for ${name}` : ''} (WhatsApp API integration required)` });
    } catch (error) { next(error); }
});

// ─── Festival template routes ─────────────────────────────────────────────────

router.get('/templates/festival', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        let config = await WhatsAppAutomationConfig.findOne({ tenantId }).lean();
        if (!config) {
            const created = await WhatsAppAutomationConfig.create({ tenantId });
            config = (created as any).toObject();
        }
        res.json({ success: true, data: (config as any).festivalTemplate || { message: 'Happy {festivalName}, {name}! From {gymName}', enabled: true, sendTime: '09:00' } });
    } catch (error) { next(error); }
});

router.put('/templates/festival', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        const { message, enabled, sendTime } = req.body;
        const config = await WhatsAppAutomationConfig.findOneAndUpdate(
            { tenantId },
            { $set: { festivalTemplate: { message, enabled, sendTime } } },
            { new: true, upsert: true }
        ).lean();
        res.json({ success: true, data: (config as any).festivalTemplate });
    } catch (error) { next(error); }
});

router.get('/settings/festivals', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        let config = await WhatsAppAutomationConfig.findOne({ tenantId }).lean();
        if (!config) {
            const created = await WhatsAppAutomationConfig.create({ tenantId });
            config = (created as any).toObject();
        }
        res.json({ success: true, data: (config as any).festivals || [] });
    } catch (error) { next(error); }
});

router.put('/settings/festivals', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = req.tenantId!;
        const { festivals } = req.body;
        if (!Array.isArray(festivals)) { res.status(400).json({ success: false, message: 'festivals must be an array' }); return; }
        const config = await WhatsAppAutomationConfig.findOneAndUpdate(
            { tenantId },
            { $set: { festivals } },
            { new: true, upsert: true }
        ).lean();
        res.json({ success: true, data: (config as any).festivals });
    } catch (error) { next(error); }
});

router.post('/festival/test', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phone, festivalName } = req.body;
        if (!phone) { res.status(400).json({ success: false, message: 'phone is required' }); return; }
        res.json({ success: true, message: `Test ${festivalName || 'festival'} message would be sent to ${phone} (WhatsApp API integration required)` });
    } catch (error) { next(error); }
});

// ─── Inbox routes ─────────────────────────────────────────────────────────────

// GET /inbox — conversations grouped by sender phone
router.get('/inbox', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const rawTenantId = (req as any).user?.tenantId || tenantId;
    const matchTenantId = rawTenantId instanceof mongoose.Types.ObjectId
      ? rawTenantId
      : new mongoose.Types.ObjectId(String(rawTenantId));
    const conversations = await WhatsAppInbox.aggregate([
      { $match: { tenantId: matchTenantId } },
      { $sort: { receivedAt: -1 } },
      {
        $group: {
          _id: '$from',
          lastMessage: { $first: '$message' },
          lastMessageAt: { $first: '$receivedAt' },
          unreadCount: { $sum: { $cond: [{ $eq: ['$status', 'unread'] }, 1, 0] } },
          resolved: { $first: '$resolved' },
          memberId: { $first: '$memberId' },
          fromName: { $first: '$fromName' },
        },
      },
      { $sort: { lastMessageAt: -1 } },
    ]);

    await WhatsAppInbox.populate(conversations, { path: 'memberId', select: 'firstName lastName mobile' });

    const data = conversations.map((c: any) => ({
      conversationId: c._id,
      memberName: c.fromName || (c.memberId ? `${c.memberId.firstName} ${c.memberId.lastName}`.trim() : null),
      memberPhone: c._id,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      resolved: c.resolved || false,
    }));

    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /inbox/reply — send outbound message (static route before /:id routes)
router.post('/inbox/reply', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.tenantId!;
    const { to, message } = req.body;
    if (!to || !message) { res.status(400).json({ success: false, message: 'to and message are required' }); return; }
    const member = await Member.findOne({ $or: [{ mobile: to }, { mobile: to.replace('+', '') }] });
    const record = await WhatsAppInbox.create({
      tenantId: (req as any).user?.tenantId || tenantId,
      from: to,
      fromName: member ? `${member.firstName} ${member.lastName}`.trim() : undefined,
      memberId: member?._id,
      message,
      messageId: `out_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      direction: 'outbound',
      status: 'replied',
      receivedAt: new Date(),
    });
    res.json({ success: true, data: record, note: 'Outbound message logged. Integrate WhatsApp Business API send here.' });
  } catch (err) { next(err); }
});

// GET /inbox/:conversationId — all messages for a phone number
router.get('/inbox/:conversationId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).user?.tenantId || req.tenantId;
    const phone = req.params.conversationId;
    const messages = await WhatsAppInbox.find({ tenantId, from: phone })
      .sort({ receivedAt: 1 })
      .populate('memberId', 'firstName lastName mobile');
    res.json({ success: true, data: messages });
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

// PUT /inbox/:id/resolve — mark conversation as resolved
router.put('/inbox/:id/resolve', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const msg = await WhatsAppInbox.findByIdAndUpdate(req.params.id, { resolved: true }, { new: true });
    if (!msg) { res.status(404).json({ success: false, message: 'Message not found' }); return; }
    res.json({ success: true, data: msg });
  } catch (err) { next(err); }
});

// PUT /inbox/:id/assign — assign conversation to staff
router.put('/inbox/:id/assign', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { staffId } = req.body;
    if (!staffId) { res.status(400).json({ success: false, message: 'staffId is required' }); return; }
    const msg = await WhatsAppInbox.findByIdAndUpdate(req.params.id, { assignedTo: staffId }, { new: true });
    if (!msg) { res.status(404).json({ success: false, message: 'Message not found' }); return; }
    res.json({ success: true, data: msg });
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
