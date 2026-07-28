import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import FitnessEvent from '../models/FitnessEvent.model';

const router = Router();
router.use(authenticate, tenantContext);

// GET /events — list events
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status, category, upcoming, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const filter: any = { tenantId };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (upcoming === 'true') filter.startDate = { $gte: new Date() };
    const [events, total] = await Promise.all([
      FitnessEvent.find(filter)
        .select('-registrations')
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(parseInt(String(limit)))
        .lean(),
      FitnessEvent.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { events, total, page: parseInt(String(page)), pages: Math.ceil(total / parseInt(String(limit))) } });
  } catch (err) { next(err); }
});

// POST /events — create event
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const createdBy = (req as any).user?._id;
    const event = await FitnessEvent.create({ ...req.body, tenantId, createdBy });
    return res.status(201).json({ success: true, data: event });
  } catch (err) { next(err); }
});

// GET /events/:id — single event with registrations
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const event = await FitnessEvent.findOne({ _id: req.params.id, tenantId }).lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    return res.json({ success: true, data: event });
  } catch (err) { next(err); }
});

// PUT /events/:id
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { registrations, registeredCount, ...update } = req.body;
    const event = await FitnessEvent.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: update }, { new: true });
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: event });
  } catch (err) { next(err); }
});

// DELETE /events/:id
router.delete('/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    await FitnessEvent.findOneAndDelete({ _id: req.params.id, tenantId });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /events/:id/publish — toggle published
router.post('/:id/publish', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const event = await FitnessEvent.findOne({ _id: req.params.id, tenantId });
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    event.status = event.status === 'published' ? 'draft' : 'published';
    await event.save();
    return res.json({ success: true, data: { status: event.status } });
  } catch (err) { next(err); }
});

// POST /events/:id/register — register member
router.post('/:id/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { memberId, name, email, phone } = req.body;
    if (!memberId || !name) return res.status(400).json({ success: false, message: 'memberId and name required' });

    const event = await FitnessEvent.findOne({ _id: req.params.id, tenantId, status: 'published' });
    if (!event) return res.status(404).json({ success: false, message: 'Event not found or not published' });

    const existing = event.registrations.find(r => String(r.memberId) === String(memberId));
    if (existing) return res.status(400).json({ success: false, message: 'Already registered' });

    const isWaitlisted = event.maxParticipants ? event.registeredCount >= event.maxParticipants : false;
    event.registrations.push({
      memberId, name, email, phone,
      status: isWaitlisted ? 'waitlisted' : 'registered',
      paymentStatus: event.isFree ? 'waived' : 'pending',
      registeredAt: new Date(),
      checkedIn: false,
    } as any);
    if (!isWaitlisted) event.registeredCount += 1;
    await event.save();
    return res.json({ success: true, data: { status: isWaitlisted ? 'waitlisted' : 'registered' } });
  } catch (err) { next(err); }
});

// DELETE /events/:id/register/:memberId — cancel registration
router.delete('/:id/register/:memberId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const event = await FitnessEvent.findOne({ _id: req.params.id, tenantId });
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    const reg = event.registrations.find(r => String(r.memberId) === req.params.memberId);
    if (!reg) return res.status(404).json({ success: false, message: 'Registration not found' });
    if (reg.status !== 'waitlisted') event.registeredCount = Math.max(0, event.registeredCount - 1);
    reg.status = 'cancelled';
    await event.save();
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /events/:id/checkin/:memberId
router.post('/:id/checkin/:memberId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'staff_reception', 'trainer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const event = await FitnessEvent.findOne({ _id: req.params.id, tenantId });
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    const reg = event.registrations.find(r => String(r.memberId) === req.params.memberId && r.status !== 'cancelled');
    if (!reg) return res.status(404).json({ success: false, message: 'Registration not found' });
    reg.checkedIn = true;
    reg.checkedInAt = new Date();
    await event.save();
    return res.json({ success: true, data: { name: reg.name, checkedInAt: reg.checkedInAt } });
  } catch (err) { next(err); }
});

// GET /events/:id/export-registrations — CSV export
router.get('/:id/export-registrations', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const event = await FitnessEvent.findOne({ _id: req.params.id, tenantId }).lean();
    if (!event) return res.status(404).json({ success: false, message: 'Not found' });
    const headers = 'Name,Email,Phone,Status,Payment,Checked In,Registered At';
    const rows = event.registrations.map(r =>
      [r.name, r.email ?? '', r.phone ?? '', r.status, r.paymentStatus, r.checkedIn ? 'Yes' : 'No', new Date(r.registeredAt).toLocaleDateString()].map(v => `"${v}"`).join(',')
    );
    const csv = [headers, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="event-registrations-${event._id}.csv"`);
    return res.send(csv);
  } catch (err) { next(err); }
});

export default router;
