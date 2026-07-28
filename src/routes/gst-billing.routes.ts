import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTenantId(req: Request): string {
  return (req as any).tenantId as string;
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const DEFAULT_HSN_MAP = [
  { category: 'membership',        hsnCode: '',     sacCode: '999729', gstRate: 18 },
  { category: 'personal_training', hsnCode: '',     sacCode: '999729', gstRate: 18 },
  { category: 'supplements',       hsnCode: '2106', sacCode: '',       gstRate: 5  },
  { category: 'clothing',          hsnCode: '6211', sacCode: '',       gstRate: 5  },
  { category: 'food',              hsnCode: '2106', sacCode: '',       gstRate: 5  },
];

// ─── GET /settings ────────────────────────────────────────────────────────────
router.get(
  '/settings',
  requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'),
  async (req: Request, res: Response) => {
    try {
      const GSTSettings = require('../models/GSTSettings.model').default;
      const tenantId = getTenantId(req);

      let settings = await GSTSettings.findOne({ tenantId }).lean();
      if (!settings) {
        settings = await GSTSettings.create({
          tenantId,
          gstin: '',
          legalBusinessName: '',
          registeredAddress: '',
          stateCode: '',
          stateName: '',
          isCompositionDealer: false,
          defaultGSTRate: 18,
          hsnCodeMap: DEFAULT_HSN_MAP,
          reverseCharge: false,
          exportInvoice: false,
          enableGSTOnInvoices: false,
        });
      }

      res.json({ success: true, data: settings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── PUT /settings ────────────────────────────────────────────────────────────
router.put(
  '/settings',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const GSTSettings = require('../models/GSTSettings.model').default;
      const tenantId = getTenantId(req);

      const {
        gstin, legalBusinessName, registeredAddress, stateCode, stateName,
        isCompositionDealer, defaultGSTRate, hsnCodeMap, reverseCharge,
        exportInvoice, enableGSTOnInvoices, signatureImageUrl,
      } = req.body;

      // Validate GSTIN format if provided
      if (gstin && gstin.trim() !== '') {
        if (!GSTIN_REGEX.test(gstin.trim())) {
          res.status(400).json({ success: false, message: 'Invalid GSTIN format. Must be 15-character alphanumeric in format: 22AAAAA0000A1Z5' });
          return;
        }
      }

      const settings = await GSTSettings.findOneAndUpdate(
        { tenantId },
        {
          $set: {
            tenantId,
            ...(gstin !== undefined && { gstin: gstin.trim() }),
            ...(legalBusinessName !== undefined && { legalBusinessName }),
            ...(registeredAddress !== undefined && { registeredAddress }),
            ...(stateCode !== undefined && { stateCode }),
            ...(stateName !== undefined && { stateName }),
            ...(isCompositionDealer !== undefined && { isCompositionDealer }),
            ...(defaultGSTRate !== undefined && { defaultGSTRate: Number(defaultGSTRate) }),
            ...(hsnCodeMap !== undefined && { hsnCodeMap }),
            ...(reverseCharge !== undefined && { reverseCharge }),
            ...(exportInvoice !== undefined && { exportInvoice }),
            ...(enableGSTOnInvoices !== undefined && { enableGSTOnInvoices }),
            ...(signatureImageUrl !== undefined && { signatureImageUrl }),
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true },
      );

      res.json({ success: true, data: settings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── GET /invoice/:invoiceId/gst-details ─────────────────────────────────────
router.get(
  '/invoice/:invoiceId/gst-details',
  requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor', 'staff'),
  async (req: Request, res: Response) => {
    try {
      const GSTSettings = require('../models/GSTSettings.model').default;
      const Payment = require('../models/Payment.model').default;
      const tenantId = getTenantId(req);
      const { invoiceId } = req.params;

      const [settings, invoice] = await Promise.all([
        GSTSettings.findOne({ tenantId }).lean(),
        Payment.findOne({ _id: new mongoose.Types.ObjectId(invoiceId), tenantId }).lean(),
      ]);

      if (!invoice) {
        res.status(404).json({ success: false, message: 'Invoice not found' });
        return;
      }

      const gstSettings = settings ?? { gstin: '', stateCode: '', defaultGSTRate: 18, hsnCodeMap: DEFAULT_HSN_MAP };

      // Determine GST category and code
      const category = (invoice as any).category ?? 'membership';
      const hsnEntry = (gstSettings.hsnCodeMap ?? DEFAULT_HSN_MAP).find((h: any) => h.category === category)
        ?? DEFAULT_HSN_MAP[0];

      const taxableAmount: number = (invoice as any).amount ?? 0;
      const gstRate: number = hsnEntry.gstRate ?? gstSettings.defaultGSTRate ?? 18;

      // Determine intra-state vs inter-state
      const memberStateCode: string = (invoice as any).memberStateCode ?? gstSettings.stateCode ?? '';
      const gymStateCode: string = gstSettings.stateCode ?? '';
      const isIntraState = gymStateCode !== '' && gymStateCode === memberStateCode;
      const gstType = isIntraState ? 'intra_state' : 'inter_state';

      const totalGSTAmount = Math.round((taxableAmount * gstRate) / 100 * 100) / 100;
      const halfRate = gstRate / 2;
      const halfAmount = Math.round((totalGSTAmount / 2) * 100) / 100;

      const result: Record<string, any> = {
        invoiceId,
        memberGSTIN: (invoice as any).memberGSTIN ?? null,
        gymGSTIN: gstSettings.gstin ?? '',
        hsnCode: hsnEntry.hsnCode || '',
        sacCode: hsnEntry.sacCode || '',
        taxableAmount,
        gstType,
        cgst: null,
        sgst: null,
        igst: null,
        totalGST: totalGSTAmount,
        grandTotal: taxableAmount + totalGSTAmount,
        isReverseCharge: gstSettings.reverseCharge ?? false,
      };

      if (gstType === 'intra_state') {
        result.cgst = { rate: halfRate, amount: halfAmount };
        result.sgst = { rate: halfRate, amount: halfAmount };
      } else {
        result.igst = { rate: gstRate, amount: totalGSTAmount };
      }

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── GET /gst-report ─────────────────────────────────────────────────────────
router.get(
  '/gst-report',
  requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'),
  async (req: Request, res: Response) => {
    try {
      const GSTSettings = require('../models/GSTSettings.model').default;
      const Payment = require('../models/Payment.model').default;
      const tenantId = getTenantId(req);

      const { month, format = 'json' } = req.query as Record<string, string>;

      // Parse month (e.g., "2026-07")
      const [yearStr, monthStr] = (month ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-');
      const year = parseInt(yearStr, 10);
      const monthNum = parseInt(monthStr, 10) - 1;
      const startDate = new Date(year, monthNum, 1);
      const endDate = new Date(year, monthNum + 1, 1);

      const settings = await GSTSettings.findOne({ tenantId }).lean();
      const defaultGSTRate: number = (settings as any)?.defaultGSTRate ?? 18;

      const payments = await Payment.find({
        tenantId,
        status: 'completed',
        createdAt: { $gte: startDate, $lt: endDate },
      }).lean();

      let totalTaxableValue = 0;
      let totalCGST = 0;
      let totalSGST = 0;
      let totalIGST = 0;
      const b2bSales: any[] = [];
      const b2cSales: any[] = [];

      for (const p of payments as any[]) {
        const amount: number = p.amount ?? 0;
        const gstRate: number = defaultGSTRate;
        const taxableAmount = Math.round((amount / (1 + gstRate / 100)) * 100) / 100;
        const gstAmount = amount - taxableAmount;

        totalTaxableValue += taxableAmount;

        const memberStateCode: string = p.memberStateCode ?? (settings as any)?.stateCode ?? '';
        const gymStateCode: string = (settings as any)?.stateCode ?? '';
        const isIntraState = gymStateCode !== '' && gymStateCode === memberStateCode;

        if (isIntraState) {
          totalCGST += gstAmount / 2;
          totalSGST += gstAmount / 2;
        } else {
          totalIGST += gstAmount;
        }

        const entry = {
          invoiceId: p._id,
          amount,
          taxableAmount,
          gstAmount,
          memberGSTIN: p.memberGSTIN ?? null,
          memberName: p.memberName ?? '',
          date: p.createdAt,
        };

        if (p.memberGSTIN) {
          b2bSales.push(entry);
        } else {
          b2cSales.push(entry);
        }
      }

      const totalGST = Math.round((totalCGST + totalSGST + totalIGST) * 100) / 100;

      const report = {
        period: `${yearStr}-${monthStr}`,
        totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
        totalCGST: Math.round(totalCGST * 100) / 100,
        totalSGST: Math.round(totalSGST * 100) / 100,
        totalIGST: Math.round(totalIGST * 100) / 100,
        totalGST,
        grandTotal: Math.round((totalTaxableValue + totalGST) * 100) / 100,
        invoiceCount: payments.length,
        b2bSales,
        b2cSales,
        b2bCount: b2bSales.length,
        b2cCount: b2cSales.length,
      };

      if (format === 'csv') {
        const header = 'Invoice ID,Member,Member GSTIN,Date,Taxable Amount,GST Amount,Total';
        const rows = payments.map((p: any) => {
          const taxableAmount = Math.round((p.amount / (1 + defaultGSTRate / 100)) * 100) / 100;
          const gstAmount = p.amount - taxableAmount;
          return [
            p._id,
            p.memberName ?? '',
            p.memberGSTIN ?? '',
            p.createdAt ? new Date(p.createdAt).toISOString().split('T')[0] : '',
            taxableAmount.toFixed(2),
            gstAmount.toFixed(2),
            p.amount.toFixed(2),
          ].join(',');
        });
        const csv = [header, ...rows].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=GSTR1-${yearStr}-${monthStr}.csv`);
        res.send(csv);
        return;
      }

      res.json({ success: true, data: report });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── POST /calculate ──────────────────────────────────────────────────────────
router.post(
  '/calculate',
  requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'staff'),
  async (req: Request, res: Response) => {
    try {
      const GSTSettings = require('../models/GSTSettings.model').default;
      const tenantId = getTenantId(req);
      const { amount, category, memberStateCode } = req.body;

      if (!amount || isNaN(Number(amount))) {
        res.status(400).json({ success: false, message: 'Valid amount is required' });
        return;
      }

      const settings = await GSTSettings.findOne({ tenantId }).lean();
      const hsnMap: any[] = (settings as any)?.hsnCodeMap ?? DEFAULT_HSN_MAP;
      const hsnEntry = hsnMap.find((h: any) => h.category === category) ?? DEFAULT_HSN_MAP[0];
      const gstRate: number = hsnEntry?.gstRate ?? (settings as any)?.defaultGSTRate ?? 18;

      const taxableAmount = Number(amount);
      const totalGST = Math.round((taxableAmount * gstRate) / 100 * 100) / 100;

      const gymStateCode: string = (settings as any)?.stateCode ?? '';
      const isIntraState = gymStateCode !== '' && memberStateCode && gymStateCode === memberStateCode;

      const result: Record<string, any> = {
        taxableAmount,
        gstRate,
        hsnCode: hsnEntry?.hsnCode ?? '',
        sacCode: hsnEntry?.sacCode ?? '',
        category: category ?? 'membership',
        gstType: isIntraState ? 'intra_state' : 'inter_state',
        cgst: null,
        sgst: null,
        igst: null,
        totalGST,
        grandTotal: taxableAmount + totalGST,
      };

      if (isIntraState) {
        result.cgst = { rate: gstRate / 2, amount: Math.round((totalGST / 2) * 100) / 100 };
        result.sgst = { rate: gstRate / 2, amount: Math.round((totalGST / 2) * 100) / 100 };
      } else {
        result.igst = { rate: gstRate, amount: totalGST };
      }

      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

export default router;
