import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import EventPartnership from '../models/EventPartnership.model';

const router = Router();

// GET /api/event-partnerships — list active partnerships for the tenant
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const { city, category, featured } = req.query;

    const filter: Record<string, any> = { tenantId, isActive: true };
    if (city) filter.city = { $regex: city as string, $options: 'i' };
    if (category) filter.category = category;
    if (featured === 'true') filter.isFeatured = true;

    const partnerships = await EventPartnership.find(filter)
      .sort({ isFeatured: -1, eventDate: 1 })
      .lean();

    res.json({ success: true, data: partnerships });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/event-partnerships — create (admin only)
router.post('/', authenticate, requireRole(['admin', 'superadmin']), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const partnership = await EventPartnership.create({ ...req.body, tenantId });
    res.status(201).json({ success: true, data: partnership });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// PUT /api/event-partnerships/:id — update (admin only)
router.put('/:id', authenticate, requireRole(['admin', 'superadmin']), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const partnership = await EventPartnership.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!partnership) return res.status(404).json({ success: false, message: 'Partnership not found' });
    res.json({ success: true, data: partnership });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/event-partnerships/:id — delete (admin only)
router.delete('/:id', authenticate, requireRole(['admin', 'superadmin']), async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const partnership = await EventPartnership.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { isActive: false },
      { new: true }
    );
    if (!partnership) return res.status(404).json({ success: false, message: 'Partnership not found' });
    res.json({ success: true, message: 'Partnership removed' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/event-partnerships/:id/interest — member toggles interest
router.post('/:id/interest', authenticate, async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).user?.tenantId;
    const partnership = await EventPartnership.findOneAndUpdate(
      { _id: req.params.id, tenantId, isActive: true },
      { $inc: { interestedCount: 1 } },
      { new: true }
    );
    if (!partnership) return res.status(404).json({ success: false, message: 'Partnership not found' });
    res.json({ success: true, data: { interestedCount: partnership.interestedCount } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
