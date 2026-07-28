import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import HealthCheckup from '../models/HealthCheckup.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

const PACKAGES = [
  {
    id: 'basic',
    name: 'Basic Health Checkup',
    tests: 15,
    amount: 999,
    discountedAmount: 599,
    labPartner: 'Thyrocare',
    includes: ['CBC', 'Blood Sugar (Fasting)', 'Urine Routine', 'Lipid Profile', 'Kidney Function', 'Liver Function', 'Thyroid (TSH)', 'Vitamin D', 'Vitamin B12', 'Iron Studies', 'HbA1c', 'Calcium', 'Uric Acid', 'ESR', 'CRP'],
    description: 'Essential health markers for annual wellness tracking',
  },
  {
    id: 'comprehensive',
    name: 'Comprehensive Health Package',
    tests: 29,
    amount: 2499,
    discountedAmount: 1299,
    labPartner: 'Dr. Lal PathLabs',
    includes: ['CBC with Differential', 'Blood Sugar (Fasting & PP)', 'HbA1c', 'Lipid Profile (8 tests)', 'Kidney Function (6 tests)', 'Liver Function (12 tests)', 'Thyroid Panel (T3, T4, TSH)', 'Vitamin D', 'Vitamin B12', 'Iron Studies', 'Calcium', 'Phosphorus', 'Uric Acid', 'CRP', 'ESR', 'Urine Routine', 'ECG', 'Blood Pressure', 'BMI'],
    description: 'Complete 29-test semi-annual health checkup (FitHeal recommended)',
  },
  {
    id: 'cardiac',
    name: 'Cardiac Risk Assessment',
    tests: 12,
    amount: 1799,
    discountedAmount: 999,
    labPartner: 'SRL Diagnostics',
    includes: ['Lipid Profile', 'hs-CRP', 'Homocysteine', 'ECG', 'Echo (basic)', 'Troponin I', 'BNP', 'Lipoprotein(a)', 'ApoB', 'ApoA1', 'Fibrinogen', 'D-Dimer'],
    description: 'Cardiac markers for members with family history or high-risk profiles',
  },
  {
    id: 'diabetes',
    name: 'Diabetes Screening Panel',
    tests: 10,
    amount: 899,
    discountedAmount: 499,
    labPartner: 'Thyrocare',
    includes: ['HbA1c', 'Fasting Blood Sugar', 'Post-Prandial Blood Sugar', 'Insulin Fasting', 'C-Peptide', 'Urine Microalbumin', 'Kidney Function (4 tests)', 'Lipid Profile'],
    description: 'Comprehensive diabetes screening and monitoring',
  },
  {
    id: 'thyroid',
    name: 'Thyroid Profile',
    tests: 5,
    amount: 499,
    discountedAmount: 299,
    labPartner: 'Thyrocare',
    includes: ['TSH Ultra Sensitive', 'T3 (Total)', 'T4 (Total)', 'Free T3', 'Free T4'],
    description: 'Complete thyroid function assessment',
  },
  {
    id: 'full_body',
    name: 'Full Body Checkup',
    tests: 60,
    amount: 3999,
    discountedAmount: 1999,
    labPartner: 'Apollo Diagnostics',
    includes: ['All Comprehensive tests', 'Hormones Panel', 'Cancer Markers (PSA/CA-125)', 'Bone Health', 'Stress Markers', 'Allergy Panel', 'Immunity Panel'],
    description: 'Our most complete health assessment with 60+ parameters',
  },
  {
    id: 'women',
    name: "Women's Wellness Panel",
    tests: 20,
    amount: 1499,
    discountedAmount: 799,
    labPartner: 'Dr. Lal PathLabs',
    includes: ['CBC', 'Hormones (FSH, LH, Estradiol, Progesterone)', 'PCOS Markers', 'Thyroid', 'Vitamin D & B12', 'Iron Studies', 'Bone Density markers', 'Pap Smear guidance', 'CA-125'],
    description: "Tailored for women's unique health monitoring needs",
  },
  {
    id: 'senior',
    name: 'Senior Citizen Package',
    tests: 25,
    amount: 1999,
    discountedAmount: 1099,
    labPartner: 'SRL Diagnostics',
    includes: ['Full CBC', 'Blood Sugar & HbA1c', 'Lipid Profile', 'Kidney & Liver', 'Thyroid', 'Vitamin D & B12', 'Bone Health (Calcium, Phosphorus)', 'Arthritis Markers (RA Factor, Anti-CCP)', 'PSA (men) / CA-125 (women)', 'Urine Routine'],
    description: 'Comprehensive age-appropriate panel for members 55+',
  },
];

const TIME_SLOTS = ['07:00-09:00', '09:00-11:00', '11:00-13:00', '13:00-15:00', '15:00-17:00', '17:00-19:00'];

router.get('/packages', (_req: Request, res: Response) => {
  res.json({ success: true, data: PACKAGES });
});

router.get('/slots', (_req: Request, res: Response) => {
  res.json({ success: true, data: TIME_SLOTS });
});

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const [total, booked, completed, pending] = await Promise.all([
      HealthCheckup.countDocuments({ tenantId }),
      HealthCheckup.countDocuments({ tenantId, status: 'booked' }),
      HealthCheckup.countDocuments({ tenantId, status: 'completed' }),
      HealthCheckup.countDocuments({ tenantId, paymentStatus: 'pending' }),
    ]);
    const revenueResult = await HealthCheckup.aggregate([
      { $match: { tenantId, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$discountedAmount' } } },
    ]);
    res.json({ success: true, data: { total, booked, completed, pendingPayment: pending, totalRevenue: revenueResult[0]?.total ?? 0 } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status, memberId, page = '1', limit = '20' } = req.query as any;
    const filter: any = { tenantId };
    if (status) filter.status = status;
    if (memberId) filter.memberId = memberId;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [data, total] = await Promise.all([
      HealthCheckup.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      HealthCheckup.countDocuments(filter),
    ]);
    res.json({ success: true, data, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const checkup = await HealthCheckup.findOne({ _id: req.params.id, tenantId });
    if (!checkup) return res.status(404).json({ success: false, message: 'Checkup not found' });
    res.json({ success: true, data: checkup });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const pkg = PACKAGES.find(p => p.id === req.body.package);
    if (!pkg) return res.status(400).json({ success: false, message: 'Invalid package' });
    const tests = pkg.includes.map(name => ({ name, category: 'Lab Test' }));
    const checkup = await HealthCheckup.create({
      ...req.body,
      tenantId,
      packageName: pkg.name,
      tests,
      totalTests: tests.length,
      amount: pkg.amount,
      discountedAmount: pkg.discountedAmount,
      labPartner: pkg.labPartner,
    });
    res.status(201).json({ success: true, data: checkup });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status } = req.body;
    const update: any = { status };
    if (status === 'completed') update.completedDate = new Date();
    const checkup = await HealthCheckup.findOneAndUpdate({ _id: req.params.id, tenantId }, update, { new: true });
    if (!checkup) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: checkup });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id/results', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { tests, reportUrl } = req.body;
    const checkup = await HealthCheckup.findOneAndUpdate(
      { _id: req.params.id, tenantId },
      { tests, reportUrl, reportUploadedAt: new Date(), status: 'completed', completedDate: new Date() },
      { new: true }
    );
    if (!checkup) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: checkup });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/:id/payment', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { paymentStatus, orderId } = req.body;
    const checkup = await HealthCheckup.findOneAndUpdate({ _id: req.params.id, tenantId }, { paymentStatus, orderId }, { new: true });
    if (!checkup) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: checkup });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const checkup = await HealthCheckup.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!checkup) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
