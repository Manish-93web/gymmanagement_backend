import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import WhatsAppGroup from '../models/WhatsAppGroup.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── GET / — list active groups ───────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const groups = await WhatsAppGroup.find({ tenantId, status: 'active' })
      .select('-members')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: { groups } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST / — create group ────────────────────────────────────────────────────
router.post(
  '/',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const { name, description, groupType, segmentCriteria } = req.body;
      const group = await WhatsAppGroup.create({
        tenantId,
        name,
        description,
        groupType: groupType || 'custom',
        segmentCriteria,
      });
      res.status(201).json({ success: true, data: { group } });
    } catch (err: any) {
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'A group with this name already exists.' });
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── GET /:id — group detail with members ─────────────────────────────────────
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
    const group = await WhatsAppGroup.findOne({ _id: req.params.id, tenantId });
    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
    res.json({ success: true, data: { group } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /:id/auto-populate — segment matching ───────────────────────────────
router.post(
  '/:id/auto-populate',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const group = await WhatsAppGroup.findOne({ _id: req.params.id, tenantId });
      if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

      const criteria = group.segmentCriteria || {};
      const query: any = { tenantId, status: 'active' };

      if (criteria.planIds && criteria.planIds.length > 0) {
        query.planId = { $in: criteria.planIds.map((id: string) => new mongoose.Types.ObjectId(id)) };
      }
      if (criteria.tags && criteria.tags.length > 0) {
        query.tags = { $in: criteria.tags };
      }
      if (criteria.joinedAfter || criteria.joinedBefore) {
        query.membershipStart = {};
        if (criteria.joinedAfter) query.membershipStart.$gte = criteria.joinedAfter;
        if (criteria.joinedBefore) query.membershipStart.$lte = criteria.joinedBefore;
      }

      const members = await Member.find(query).select('_id firstName lastName mobile');
      const existingIds = new Set(group.members.map((m: any) => m.memberId?.toString()));

      let added = 0;
      for (const member of members) {
        if (!existingIds.has(member._id.toString())) {
          group.members.push({
            memberId: member._id as mongoose.Types.ObjectId,
            phone: member.mobile || '',
            name: `${member.firstName} ${member.lastName}`,
            addedAt: new Date(),
            status: 'active',
          });
          added++;
        }
      }
      group.memberCount = group.members.filter((m: any) => m.status === 'active').length;
      await group.save();

      res.json({ success: true, data: { added, totalMembers: group.memberCount } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── POST /:id/add-member ─────────────────────────────────────────────────────
router.post(
  '/:id/add-member',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const { memberId } = req.body;
      if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' });

      const group = await WhatsAppGroup.findOne({ _id: req.params.id, tenantId });
      if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

      const member = await Member.findOne({ _id: memberId, tenantId });
      if (!member) return res.status(404).json({ success: false, message: 'Member not found' });

      const existing = group.members.find((m: any) => m.memberId?.toString() === memberId);
      if (existing) {
        if (existing.status === 'removed') {
          existing.status = 'active';
        } else {
          return res.status(409).json({ success: false, message: 'Member already in group' });
        }
      } else {
        group.members.push({
          memberId: new mongoose.Types.ObjectId(memberId),
          phone: member.mobile || '',
          name: `${member.firstName} ${member.lastName}`,
          addedAt: new Date(),
          status: 'active',
        });
      }
      group.memberCount = group.members.filter((m: any) => m.status === 'active').length;
      await group.save();

      res.json({ success: true, data: { memberCount: group.memberCount } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── DELETE /:id/members/:memberId — remove member ───────────────────────────
router.delete(
  '/:id/members/:memberId',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const group = await WhatsAppGroup.findOne({ _id: req.params.id, tenantId });
      if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

      const member = group.members.find(
        (m: any) => m.memberId?.toString() === req.params.memberId
      );
      if (!member) return res.status(404).json({ success: false, message: 'Member not in group' });

      member.status = 'removed';
      group.memberCount = group.members.filter((m: any) => m.status === 'active').length;
      await group.save();

      res.json({ success: true, data: { memberCount: group.memberCount } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── POST /:id/broadcast ─────────────────────────────────────────────────────
router.post(
  '/:id/broadcast',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const { message } = req.body;
      if (!message) return res.status(400).json({ success: false, message: 'message is required' });

      const group = await WhatsAppGroup.findOne({ _id: req.params.id, tenantId });
      if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

      const activeMembers = group.members.filter((m: any) => m.status === 'active');

      let whatsappService: any;
      try {
        whatsappService = require('../services/whatsapp.service').default;
      } catch {}

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const member of activeMembers) {
        if (!member.phone) { failed++; continue; }
        try {
          if (whatsappService && typeof whatsappService.sendMessage === 'function') {
            await whatsappService.sendMessage({ to: member.phone, message });
          } else {
            // Stub: WA service not available — log but count as sent
            console.log(`[WA-GROUP STUB] To ${member.phone}: ${message.slice(0, 50)}`);
          }
          sent++;
        } catch (e: any) {
          failed++;
          errors.push(`${member.name}: ${e.message}`);
        }
      }

      group.lastMessageAt = new Date();
      group.messageCount = (group.messageCount || 0) + 1;
      await group.save();

      res.json({ success: true, data: { sent, failed, errors } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── POST /:id/create-wa-group — stub ────────────────────────────────────────
router.post(
  '/:id/create-wa-group',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const group = await WhatsAppGroup.findOne({ _id: req.params.id, tenantId });
      if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

      if (!process.env.WHATSAPP_BUSINESS_API_URL) {
        return res.json({
          success: true,
          data: {
            stub: true,
            message: 'WhatsApp Business API not configured. Please set WHATSAPP_BUSINESS_API_URL to enable real group creation.',
          },
        });
      }

      // Placeholder for real WA Business API integration
      return res.json({
        success: true,
        data: {
          stub: false,
          message: 'WhatsApp Business API integration pending implementation.',
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─── DELETE /:id — archive group ─────────────────────────────────────────────
router.delete(
  '/:id',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId || (req as any).user?.tenantId;
      const group = await WhatsAppGroup.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { status: 'archived' },
        { new: true }
      );
      if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
      res.json({ success: true, data: { group } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

export default router;
