import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import BodyComposition from '../models/BodyComposition.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate, tenantContext);

// ─── InBody / ActiveX webhook receiver ────────────────────────────────────────
// Devices POST to this endpoint; field names differ by manufacturer so we
// normalise inline.
router.post('/ingest', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer', 'staff_reception'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const body = req.body as Record<string, any>;

    // Support both InBody (camelCase) and ActiveX (snake_case) field names
    const memberId   = body.memberId   ?? body.member_id;
    const memberName = body.memberName ?? body.member_name ?? body.name ?? 'Unknown';
    const source     = (body.source ?? body.device_type ?? 'inbody') as 'inbody' | 'activex' | 'manual' | 'tanita' | 'other';
    const deviceId   = body.deviceId ?? body.device_id;

    // --- Core metrics (InBody field names) ---
    const weight            = parseFloat(body.weight            ?? body.Weight ?? 0);
    const bmi               = parseFloat(body.bmi               ?? body.BMI   ?? 0);
    const bodyFatPercent    = parseFloat(body.bodyFatPercent    ?? body.PBF   ?? body.body_fat_percent ?? 0);
    const bodyFatMass       = parseFloat(body.bodyFatMass       ?? body.BFM   ?? body.body_fat_mass   ?? 0);
    const leanBodyMass      = parseFloat(body.leanBodyMass      ?? body.LBM   ?? body.lean_body_mass  ?? 0);
    const skeletalMuscleMass= parseFloat(body.skeletalMuscleMass?? body.SMM   ?? body.skeletal_muscle_mass ?? 0);

    if (!memberId || !weight) {
      return res.status(400).json({ success: false, message: 'memberId and weight are required' });
    }

    const payload: any = {
      tenantId, memberId, memberName, source, deviceId,
      rawData: body,
      measurementDate: body.measurementDate ?? body.measurement_date ?? new Date(),
      weight, bmi, bodyFatPercent, bodyFatMass, leanBodyMass, skeletalMuscleMass,
      visceralFatLevel:   parseFloat(body.visceralFatLevel   ?? body.VFL   ?? '') || undefined,
      visceralFatArea:    parseFloat(body.visceralFatArea    ?? body.VFA   ?? '') || undefined,
      basalMetabolicRate: parseFloat(body.basalMetabolicRate ?? body.BMR   ?? '') || undefined,
      totalBodyWater:     parseFloat(body.totalBodyWater     ?? body.TBW   ?? '') || undefined,
      intracellularWater: parseFloat(body.intracellularWater ?? body.ICW   ?? '') || undefined,
      extracellularWater: parseFloat(body.extracellularWater ?? body.ECW   ?? '') || undefined,
      boneMineralContent: parseFloat(body.boneMineralContent ?? body.BMC   ?? '') || undefined,
      proteinMass:        parseFloat(body.proteinMass        ?? body.protein ?? '') || undefined,
      mineralMass:        parseFloat(body.mineralMass        ?? '') || undefined,
      phaseAngle:         parseFloat(body.phaseAngle         ?? body.PA    ?? '') || undefined,
      ecwRatio:           parseFloat(body.ecwRatio           ?? body.ECW_ratio ?? '') || undefined,
      height:             parseFloat(body.height             ?? '') || undefined,
      waistCircumference: parseFloat(body.waistCircumference ?? '') || undefined,
      hipCircumference:   parseFloat(body.hipCircumference   ?? '') || undefined,
      bodyFatRating:  body.bodyFatRating  ?? body.body_fat_rating,
      muscleFatRating:body.muscleFatRating?? body.muscle_fat_rating,
      notes: body.notes,
    };

    // Segmental (InBody returns these as separate fields)
    if (body.segmental || body.rightArmMuscle !== undefined) {
      payload.segmental = body.segmental ?? {
        rightArm: { muscleMass: body.rightArmMuscle, fatMass: body.rightArmFat, fatPercent: body.rightArmFatPercent },
        leftArm:  { muscleMass: body.leftArmMuscle,  fatMass: body.leftArmFat,  fatPercent: body.leftArmFatPercent  },
        trunk:    { muscleMass: body.trunkMuscle,     fatMass: body.trunkFat,    fatPercent: body.trunkFatPercent    },
        rightLeg: { muscleMass: body.rightLegMuscle,  fatMass: body.rightLegFat, fatPercent: body.rightLegFatPercent },
        leftLeg:  { muscleMass: body.leftLegMuscle,   fatMass: body.leftLegFat,  fatPercent: body.leftLegFatPercent  },
      };
    }

    const record = await BodyComposition.create(payload);
    return res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
});

// ─── Manual entry ─────────────────────────────────────────────────────────────
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer', 'staff_reception'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const createdBy = (req as any).user?._id;
    const record = await BodyComposition.create({ ...req.body, tenantId, createdBy, source: req.body.source ?? 'manual' });
    return res.status(201).json({ success: true, data: record });
  } catch (err) { next(err); }
});

// ─── List all measurements (admin view) ───────────────────────────────────────
router.get('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { memberId, source, from, to, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const filter: any = { tenantId };
    if (memberId) filter.memberId = memberId;
    if (source)   filter.source = source;
    if (from || to) {
      filter.measurementDate = {};
      if (from) filter.measurementDate.$gte = new Date(String(from));
      if (to)   filter.measurementDate.$lte = new Date(String(to));
    }
    const [records, total] = await Promise.all([
      BodyComposition.find(filter).sort({ measurementDate: -1 }).skip(skip).limit(parseInt(String(limit))).lean(),
      BodyComposition.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { records, total } });
  } catch (err) { next(err); }
});

// ─── Member timeline (for member profile) ─────────────────────────────────────
router.get('/member/:memberId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const records = await BodyComposition.find({ tenantId, memberId: req.params.memberId })
      .sort({ measurementDate: -1 }).limit(50).lean();
    return res.json({ success: true, data: records });
  } catch (err) { next(err); }
});

// ─── Latest reading for a member ──────────────────────────────────────────────
router.get('/member/:memberId/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const record = await BodyComposition.findOne({ tenantId, memberId: req.params.memberId }).sort({ measurementDate: -1 }).lean();
    return res.json({ success: true, data: record });
  } catch (err) { next(err); }
});

// ─── Single record ────────────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const record = await BodyComposition.findOne({ _id: req.params.id, tenantId }).lean();
    if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
    return res.json({ success: true, data: record });
  } catch (err) { next(err); }
});

// ─── Update ───────────────────────────────────────────────────────────────────
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'trainer', 'staff_reception'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const record = await BodyComposition.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: req.body }, { new: true });
    if (!record) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: record });
  } catch (err) { next(err); }
});

// ─── Delete ───────────────────────────────────────────────────────────────────
router.delete('/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    await BodyComposition.findOneAndDelete({ _id: req.params.id, tenantId });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Summary stats across all members ─────────────────────────────────────────
router.get('/stats/summary', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const agg = await BodyComposition.aggregate([
      { $match: { tenantId } },
      { $sort: { memberId: 1, measurementDate: -1 } },
      { $group: { _id: '$memberId', latest: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latest' } },
      { $group: {
        _id: null,
        totalScans: { $sum: 1 },
        avgBmi: { $avg: '$bmi' },
        avgBodyFat: { $avg: '$bodyFatPercent' },
        avgMuscleMass: { $avg: '$skeletalMuscleMass' },
        avgWeight: { $avg: '$weight' },
      }},
    ]);
    const result = agg[0] ?? { totalScans: 0, avgBmi: 0, avgBodyFat: 0, avgMuscleMass: 0, avgWeight: 0 };
    // Count by source
    const bySource = await BodyComposition.aggregate([
      { $match: { tenantId } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]);
    return res.json({ success: true, data: { ...result, bySource } });
  } catch (err) { next(err); }
});

export default router;
