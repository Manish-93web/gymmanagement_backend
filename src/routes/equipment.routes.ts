import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import Equipment from '../models/Equipment.model';

const router = Router();
router.use(authenticate, tenantContext);

// GET /equipment — list all equipment
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status, category, dueSoon } = req.query;
    const filter: any = { tenantId };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (dueSoon === 'true') {
      const in7Days = new Date(Date.now() + 7 * 86400000);
      filter.nextMaintenanceDue = { $lte: in7Days };
    }
    const equipment = await Equipment.find(filter).select('-maintenanceLogs').sort({ nextMaintenanceDue: 1, name: 1 }).lean();
    return res.json({ success: true, data: equipment });
  } catch (err) { next(err); }
});

// POST /equipment — add new equipment
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const item = await Equipment.create({ ...req.body, tenantId });
    return res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

// GET /equipment/summary — dashboard stats
router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const now = new Date();
    const in7Days = new Date(Date.now() + 7 * 86400000);
    const [total, active, underMaintenance, outOfOrder, overdue, dueSoon] = await Promise.all([
      Equipment.countDocuments({ tenantId }),
      Equipment.countDocuments({ tenantId, status: 'active' }),
      Equipment.countDocuments({ tenantId, status: 'under_maintenance' }),
      Equipment.countDocuments({ tenantId, status: 'out_of_order' }),
      Equipment.countDocuments({ tenantId, nextMaintenanceDue: { $lt: now } }),
      Equipment.countDocuments({ tenantId, nextMaintenanceDue: { $gte: now, $lte: in7Days } }),
    ]);
    // Total maintenance cost
    const costAgg = await Equipment.aggregate([
      { $match: { tenantId } },
      { $group: { _id: null, total: { $sum: '$totalMaintenanceCost' } } },
    ]);
    const totalCost = costAgg[0]?.total ?? 0;
    return res.json({ success: true, data: { total, active, underMaintenance, outOfOrder, overdue, dueSoon, totalMaintenanceCost: totalCost } });
  } catch (err) { next(err); }
});

// GET /equipment/:id — single equipment with logs
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const item = await Equipment.findOne({ _id: req.params.id, tenantId }).lean();
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// PUT /equipment/:id
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { maintenanceLogs, totalMaintenanceCost, ...update } = req.body;
    const item = await Equipment.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: update }, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// DELETE /equipment/:id
router.delete('/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    await Equipment.findOneAndDelete({ _id: req.params.id, tenantId });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /equipment/:id/maintenance — log a maintenance event
router.post('/:id/maintenance', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer', 'staff_reception'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { type, description, performedBy, cost = 0, nextDue, attachments } = req.body;
    if (!type || !description) return res.status(400).json({ success: false, message: 'type and description required' });

    const item = await Equipment.findOne({ _id: req.params.id, tenantId });
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });

    const logEntry: any = { type, description, performedBy, cost, date: new Date(), attachments: attachments ?? [] };
    if (nextDue) logEntry.nextDue = new Date(nextDue);
    item.maintenanceLogs.push(logEntry);
    item.lastMaintenanceDate = new Date();
    item.totalMaintenanceCost = (item.totalMaintenanceCost ?? 0) + Number(cost);

    // Update next maintenance due
    if (nextDue) {
      item.nextMaintenanceDue = new Date(nextDue);
    } else if (item.maintenanceIntervalDays) {
      item.nextMaintenanceDue = new Date(Date.now() + item.maintenanceIntervalDays * 86400000);
    }
    // Auto-update status back to active if it was under maintenance
    if (item.status === 'under_maintenance') item.status = 'active';
    await item.save();
    return res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// PATCH /equipment/:id/status — quick status change
router.patch('/:id/status', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer', 'staff_reception'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status, condition } = req.body;
    const update: any = {};
    if (status) update.status = status;
    if (condition) update.condition = condition;
    const item = await Equipment.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: update }, { new: true }).select('-maintenanceLogs');
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// GET /equipment/overdue/list — equipment needing maintenance
router.get('/overdue/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const equipment = await Equipment.find({
      tenantId,
      nextMaintenanceDue: { $lt: new Date() },
      status: { $ne: 'decommissioned' },
    }).select('-maintenanceLogs').sort({ nextMaintenanceDue: 1 }).lean();
    return res.json({ success: true, data: equipment });
  } catch (err) { next(err); }
});

export default router;
