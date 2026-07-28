import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import CorporateClient from '../models/CorporateClient.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate, tenantContext);

// GET /corporate — list all corporate clients
router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'accountant'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status } = req.query;
    const filter: any = { tenantId };
    if (status) filter.status = status;
    const clients = await CorporateClient.find(filter).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: clients });
  } catch (err) { next(err); }
});

// GET /corporate/summary
router.get('/summary', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'accountant'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const [total, active, expiringSoon] = await Promise.all([
      CorporateClient.countDocuments({ tenantId }),
      CorporateClient.countDocuments({ tenantId, status: 'active' }),
      CorporateClient.countDocuments({ tenantId, status: 'active', contractEndDate: { $lte: new Date(Date.now() + 30 * 86400000) } }),
    ]);
    const revenueAgg = await CorporateClient.aggregate([
      { $match: { tenantId, status: 'active' } },
      {
        $group: {
          _id: null,
          monthlyRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$planType', 'flat_rate'] },
                '$monthlyRate',
                { $multiply: ['$enrolledCount', '$perHeadRate'] }
              ]
            }
          },
          totalEnrolled: { $sum: '$enrolledCount' },
        }
      }
    ]);
    return res.json({
      success: true,
      data: {
        total, active, expiringSoon,
        monthlyRevenue: revenueAgg[0]?.monthlyRevenue ?? 0,
        totalEnrolled: revenueAgg[0]?.totalEnrolled ?? 0,
      }
    });
  } catch (err) { next(err); }
});

// POST /corporate — create client
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const createdBy = (req as any).user?._id;
    const client = await CorporateClient.create({ ...req.body, tenantId, createdBy });
    return res.status(201).json({ success: true, data: client });
  } catch (err) { next(err); }
});

// GET /corporate/:id
router.get('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'accountant'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const client = await CorporateClient.findOne({ _id: req.params.id, tenantId }).lean();
    if (!client) return res.status(404).json({ success: false, message: 'Not found' });
    // Fetch enrolled members (members where corporateClientId matches)
    const members = await Member.find({ tenantId, corporateClientId: req.params.id })
      .select('firstName lastName email phone status').lean();
    return res.json({ success: true, data: { ...client, members } });
  } catch (err) { next(err); }
});

// PUT /corporate/:id
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const client = await CorporateClient.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: req.body }, { new: true });
    if (!client) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: client });
  } catch (err) { next(err); }
});

// POST /corporate/:id/enroll — enroll a member under corporate
router.post('/:id/enroll', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'staff_reception'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { memberId } = req.body;
    if (!memberId) return res.status(400).json({ success: false, message: 'memberId required' });
    const client = await CorporateClient.findOne({ _id: req.params.id, tenantId, status: 'active' });
    if (!client) return res.status(404).json({ success: false, message: 'Active corporate client not found' });
    if (client.enrolledCount >= client.memberLimit) {
      return res.status(400).json({ success: false, message: `Member limit of ${client.memberLimit} reached` });
    }
    // Mark the member as corporate-enrolled
    await Member.findByIdAndUpdate(memberId, { $set: { corporateClientId: req.params.id } });
    client.enrolledCount += 1;
    await client.save();
    return res.json({ success: true, data: { enrolledCount: client.enrolledCount } });
  } catch (err) { next(err); }
});

// DELETE /corporate/:id/enroll/:memberId — unenroll member
router.delete('/:id/enroll/:memberId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const client = await CorporateClient.findOne({ _id: req.params.id, tenantId });
    if (!client) return res.status(404).json({ success: false, message: 'Not found' });
    await Member.findByIdAndUpdate(req.params.memberId, { $unset: { corporateClientId: '' } });
    client.enrolledCount = Math.max(0, client.enrolledCount - 1);
    await client.save();
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /corporate/:id/invoice — compute current period invoice
router.get('/:id/invoice', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'accountant'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const client = await CorporateClient.findOne({ _id: req.params.id, tenantId }).lean();
    if (!client) return res.status(404).json({ success: false, message: 'Not found' });
    let amount = 0;
    if (client.planType === 'flat_rate') {
      amount = client.monthlyRate ?? 0;
    } else if (client.planType === 'per_head') {
      amount = (client.perHeadRate ?? 0) * client.enrolledCount;
    }
    const tax = amount * 0.18; // 18% GST
    return res.json({
      success: true,
      data: {
        company: client.companyName,
        period: `${new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`,
        enrolledCount: client.enrolledCount,
        subtotal: amount,
        gst: tax,
        total: amount + tax,
        billingCycle: client.billingCycle,
      }
    });
  } catch (err) { next(err); }
});

// DELETE /corporate/:id
router.delete('/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    await CorporateClient.findOneAndDelete({ _id: req.params.id, tenantId });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
