import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import Complaint from '../models/Complaint.model';

const router = Router();
router.use(authenticate, tenantContext);

// ─── GET / — list complaints with filters and pagination ─────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status, priority, category, assignedTo, memberId, page = '1', limit = '20' } = req.query;
    const filter: any = { tenantId };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;
    if (assignedTo) filter.assignedTo = assignedTo;
    if (memberId) filter.memberId = memberId;

    const skip = (Number(page) - 1) * Number(limit);
    const [complaints, total] = await Promise.all([
      Complaint.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-thread')
        .lean(),
      Complaint.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: { complaints, total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) { next(err); }
});

// ─── GET /stats — aggregate stats ────────────────────────────────────────────
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;

    const [statusCounts, slaBreached, pendingUrgent, resolutionAgg, satisfactionAgg] = await Promise.all([
      Complaint.aggregate([
        { $match: { tenantId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Complaint.countDocuments({ tenantId, slaBreached: true }),
      Complaint.countDocuments({ tenantId, priority: 'urgent', status: { $in: ['open', 'in_progress'] } }),
      Complaint.aggregate([
        { $match: { tenantId, status: 'resolved', resolvedAt: { $exists: true } } },
        { $project: { diffHours: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] } } },
        { $group: { _id: null, avg: { $avg: '$diffHours' } } },
      ]),
      Complaint.aggregate([
        { $match: { tenantId, satisfaction: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$satisfaction' } } },
      ]),
    ]);

    const byStatus: Record<string, number> = {};
    for (const s of statusCounts) byStatus[s._id] = s.count;

    return res.json({
      success: true,
      data: {
        total: Object.values(byStatus).reduce((a: number, b: number) => a + b, 0),
        open: byStatus['open'] ?? 0,
        inProgress: byStatus['in_progress'] ?? 0,
        resolved: byStatus['resolved'] ?? 0,
        closed: byStatus['closed'] ?? 0,
        avgResolutionHours: resolutionAgg[0]?.avg ? Math.round(resolutionAgg[0].avg * 10) / 10 : null,
        slaBreached,
        pendingUrgent,
        satisfactionAvg: satisfactionAgg[0]?.avg ? Math.round(satisfactionAgg[0].avg * 10) / 10 : null,
      },
    });
  } catch (err) { next(err); }
});

// ─── GET /unread-count — badge count for admin notifications ──────────────────
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const count = await Complaint.countDocuments({ tenantId, status: { $in: ['open', 'in_progress'] } });
    return res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
});

// ─── GET /:id — single complaint with full thread ─────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId }).lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });
    return res.json({ success: true, data: complaint });
  } catch (err) { next(err); }
});

// ─── POST / — create complaint ────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const { memberId, memberName, memberPhone, memberEmail, category, subject, description, priority, source } = req.body;

    if (!memberId || !memberName || !subject || !description) {
      return res.status(400).json({ success: false, message: 'memberId, memberName, subject and description are required' });
    }

    const initialThread = {
      message: description,
      authorId: memberId,
      authorName: memberName,
      authorRole: 'member',
      timestamp: new Date(),
      isInternal: false,
    };

    const complaint = await Complaint.create({
      tenantId,
      memberId,
      memberName,
      memberPhone,
      memberEmail,
      category: category ?? 'other',
      subject,
      description,
      priority: priority ?? 'medium',
      source: source ?? 'member_app',
      thread: [initialThread],
    });

    return res.status(201).json({ success: true, data: complaint });
  } catch (err) { next(err); }
});

// ─── PATCH /:id/status — update status ───────────────────────────────────────
router.patch('/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const { status, note } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'status is required' });

    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId });
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });

    const prevStatus = complaint.status;
    complaint.status = status;

    if (status === 'resolved') {
      complaint.resolvedAt = new Date();
      complaint.resolvedBy = user?.name ?? user?._id ?? 'admin';
      if (note) complaint.resolutionNote = note;
    } else if (status === 'closed') {
      complaint.closedAt = new Date();
    } else if (status === 'reopened') {
      complaint.reopenedAt = new Date();
    }

    // Log status change to thread
    const threadMsg = note
      ? `Status changed from ${prevStatus} to ${status}. Note: ${note}`
      : `Status changed from ${prevStatus} to ${status}`;

    complaint.thread.push({
      message: threadMsg,
      authorId: user?._id ?? 'system',
      authorName: user?.name ?? 'System',
      authorRole: user?.role ?? 'staff',
      timestamp: new Date(),
      isInternal: true,
    });

    await complaint.save();
    return res.json({ success: true, data: complaint });
  } catch (err) { next(err); }
});

// ─── PATCH /:id/assign — assign to staff ─────────────────────────────────────
router.patch('/:id/assign', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'staff'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const { assignedTo, assignedToName } = req.body;

    if (!assignedTo) return res.status(400).json({ success: false, message: 'assignedTo is required' });

    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId });
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });

    complaint.assignedTo = assignedTo;
    complaint.assignedToName = assignedToName ?? assignedTo;

    // Log assignment to thread
    complaint.thread.push({
      message: `Assigned to ${assignedToName ?? assignedTo}`,
      authorId: user?._id ?? 'system',
      authorName: user?.name ?? 'System',
      authorRole: user?.role ?? 'staff',
      timestamp: new Date(),
      isInternal: true,
    });

    await complaint.save();
    return res.json({ success: true, data: complaint });
  } catch (err) { next(err); }
});

// ─── PATCH /:id/escalate — mark escalated ────────────────────────────────────
router.patch('/:id/escalate', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;

    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId });
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });

    complaint.escalated = true;
    complaint.escalatedAt = new Date();

    complaint.thread.push({
      message: 'Complaint escalated to management',
      authorId: user?._id ?? 'system',
      authorName: user?.name ?? 'System',
      authorRole: user?.role ?? 'staff',
      timestamp: new Date(),
      isInternal: true,
    });

    await complaint.save();
    return res.json({ success: true, data: complaint });
  } catch (err) { next(err); }
});

// ─── POST /:id/reply — add thread message ────────────────────────────────────
router.post('/:id/reply', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const { message, isInternal } = req.body;

    if (!message?.trim()) return res.status(400).json({ success: false, message: 'message is required' });

    const complaint = await Complaint.findOne({ _id: req.params.id, tenantId });
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });

    complaint.thread.push({
      message: message.trim(),
      authorId: user?._id ?? 'unknown',
      authorName: user?.name ?? 'Staff',
      authorRole: user?.role ?? 'staff',
      timestamp: new Date(),
      isInternal: Boolean(isInternal),
    });

    await complaint.save();
    return res.json({ success: true, data: complaint });
  } catch (err) { next(err); }
});

// ─── PATCH /:id/satisfaction — member rates resolution ───────────────────────
router.patch('/:id/satisfaction', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { satisfaction, satisfactionComment } = req.body;

    if (!satisfaction || satisfaction < 1 || satisfaction > 5) {
      return res.status(400).json({ success: false, message: 'satisfaction must be 1-5' });
    }

    const complaint = await Complaint.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { $set: { satisfaction: Number(satisfaction), satisfactionComment } },
      { new: true }
    );
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });
    return res.json({ success: true, data: complaint });
  } catch (err) { next(err); }
});

// ─── DELETE /:id — admin only ─────────────────────────────────────────────────
router.delete('/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const deleted = await Complaint.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!deleted) return res.status(404).json({ success: false, message: 'Complaint not found' });
    return res.json({ success: true, message: 'Complaint deleted' });
  } catch (err) { next(err); }
});

export default router;
