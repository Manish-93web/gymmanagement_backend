import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTenantId(req: Request): string {
  return (req as any).tenantId as string;
}

function getStaffId(req: Request): string {
  const user = (req as any).user;
  return user?._id?.toString() ?? user?.id?.toString() ?? 'system';
}

const CAF_GST_RATE = 5; // 5% GST on cafeteria food

// ─── MENU ROUTES ──────────────────────────────────────────────────────────────

// GET /menu — full menu by category
router.get(
  '/menu',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin', 'accountant', 'auditor'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaItem } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const { category } = req.query as Record<string, string>;

      const filter: Record<string, any> = { tenantId };
      if (category && category !== 'all') filter.category = category;

      const items = await CafeteriaItem.find(filter)
        .sort({ isDailySpecial: -1, sortOrder: 1, name: 1 })
        .lean();

      // Group by category
      const grouped: Record<string, any[]> = {};
      for (const item of items) {
        const cat = (item as any).category;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      }

      res.json({ success: true, data: { items, grouped, total: items.length } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// POST /menu/item — create item
router.post(
  '/menu/item',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaItem } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const {
        name, description, category, price, mrp, costPrice, calories,
        isVeg, isAvailable, isDailySpecial, image, preparationTime,
        allergens, hsnCode, gstRate, sortOrder,
      } = req.body;

      if (!name || !category || price === undefined) {
        res.status(400).json({ success: false, message: 'name, category, and price are required' });
        return;
      }

      const item = await CafeteriaItem.create({
        tenantId, name, description, category,
        price: Number(price),
        mrp: mrp !== undefined ? Number(mrp) : undefined,
        costPrice: costPrice !== undefined ? Number(costPrice) : undefined,
        calories: calories !== undefined ? Number(calories) : undefined,
        isVeg: isVeg !== undefined ? Boolean(isVeg) : true,
        isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
        isDailySpecial: isDailySpecial !== undefined ? Boolean(isDailySpecial) : false,
        image, preparationTime, allergens,
        hsnCode: hsnCode ?? '2106',
        gstRate: gstRate !== undefined ? Number(gstRate) : CAF_GST_RATE,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      });

      res.status(201).json({ success: true, data: item });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// PUT /menu/item/:id — update item
router.put(
  '/menu/item/:id',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaItem } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);

      const updates: Record<string, any> = {};
      const fields = [
        'name', 'description', 'category', 'price', 'mrp', 'costPrice',
        'calories', 'isVeg', 'isAvailable', 'isDailySpecial', 'image',
        'preparationTime', 'allergens', 'hsnCode', 'gstRate', 'sortOrder',
      ];
      for (const f of fields) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }

      const item = await CafeteriaItem.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { $set: updates },
        { new: true, runValidators: true },
      );
      if (!item) { res.status(404).json({ success: false, message: 'Item not found' }); return; }
      res.json({ success: true, data: item });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// DELETE /menu/item/:id
router.delete(
  '/menu/item/:id',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaItem } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const result = await CafeteriaItem.findOneAndDelete({ _id: req.params.id, tenantId });
      if (!result) { res.status(404).json({ success: false, message: 'Item not found' }); return; }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// POST /menu/item/:id/toggle-special
router.post(
  '/menu/item/:id/toggle-special',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'staff'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaItem } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const item = await CafeteriaItem.findOne({ _id: req.params.id, tenantId });
      if (!item) { res.status(404).json({ success: false, message: 'Item not found' }); return; }
      item.isDailySpecial = !item.isDailySpecial;
      await item.save();
      res.json({ success: true, data: item });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// POST /menu/item/:id/toggle-availability
router.post(
  '/menu/item/:id/toggle-availability',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'staff'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaItem } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const item = await CafeteriaItem.findOne({ _id: req.params.id, tenantId });
      if (!item) { res.status(404).json({ success: false, message: 'Item not found' }); return; }
      item.isAvailable = !item.isAvailable;
      await item.save();
      res.json({ success: true, data: item });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── ORDER ROUTES ─────────────────────────────────────────────────────────────

// POST /orders — create new order
router.post(
  '/orders',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaItem, CafeteriaOrder } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const staffId = getStaffId(req);
      const { items, tableNumber, memberId, memberName, paymentMethod, discount, notes } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, message: 'At least one item is required' });
        return;
      }

      // Resolve item details
      const itemIds = items.map((i: any) => i.itemId);
      const menuItems = await CafeteriaItem.find({ _id: { $in: itemIds }, tenantId, isAvailable: true }).lean();

      const menuMap: Record<string, any> = {};
      for (const m of menuItems as any[]) {
        menuMap[m._id.toString()] = m;
      }

      const resolvedItems: any[] = [];
      let subtotal = 0;

      for (const cartItem of items) {
        const menuItem = menuMap[cartItem.itemId];
        if (!menuItem) {
          res.status(400).json({ success: false, message: `Item ${cartItem.itemId} not found or unavailable` });
          return;
        }
        const qty = Number(cartItem.quantity) || 1;
        const unitPrice = menuItem.price;
        const totalPrice = unitPrice * qty;
        subtotal += totalPrice;
        resolvedItems.push({
          itemId: cartItem.itemId,
          itemName: menuItem.name,
          quantity: qty,
          unitPrice,
          totalPrice,
          isVeg: menuItem.isVeg,
        });
      }

      const discountAmount = Number(discount) || 0;
      const gstAmount = Math.round(((subtotal - discountAmount) * CAF_GST_RATE) / 100 * 100) / 100;
      const totalAmount = subtotal - discountAmount + gstAmount;

      const order = await CafeteriaOrder.create({
        tenantId, staffId,
        tableNumber, memberId, memberName,
        items: resolvedItems,
        subtotal,
        gstAmount,
        discount: discountAmount,
        totalAmount,
        paymentMethod: paymentMethod ?? 'cash',
        status: 'pending',
        notes,
      });

      res.status(201).json({ success: true, data: order });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// GET /orders — list orders
router.get(
  '/orders',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin', 'auditor'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaOrder } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const { status, date, page = '1', limit = '50' } = req.query as Record<string, string>;

      const filter: Record<string, any> = { tenantId };
      if (status) filter.status = status;

      if (date === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        filter.createdAt = { $gte: today, $lt: tomorrow };
      } else if (date) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        filter.createdAt = { $gte: d, $lt: next };
      }

      const skip = (+page - 1) * +limit;
      const [orders, total] = await Promise.all([
        CafeteriaOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit).lean(),
        CafeteriaOrder.countDocuments(filter),
      ]);

      res.json({ success: true, data: { orders, total, page: +page } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// GET /orders/:id — single order
router.get(
  '/orders/:id',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin', 'auditor'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaOrder } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const order = await CafeteriaOrder.findOne({ _id: req.params.id, tenantId }).lean();
      if (!order) { res.status(404).json({ success: false, message: 'Order not found' }); return; }
      res.json({ success: true, data: order });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// PATCH /orders/:id/status — update status
router.patch(
  '/orders/:id/status',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaOrder } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const { status } = req.body;
      const validStatuses = ['pending', 'preparing', 'ready', 'served'];
      if (!status || !validStatuses.includes(status)) {
        res.status(400).json({ success: false, message: `status must be one of: ${validStatuses.join(', ')}` });
        return;
      }
      const order = await CafeteriaOrder.findOneAndUpdate(
        { _id: req.params.id, tenantId, status: { $ne: 'cancelled' } },
        { $set: { status } },
        { new: true },
      );
      if (!order) { res.status(404).json({ success: false, message: 'Order not found or already cancelled' }); return; }
      res.json({ success: true, data: order });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// POST /orders/:id/cancel
router.post(
  '/orders/:id/cancel',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'staff'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaOrder } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);
      const order = await CafeteriaOrder.findOneAndUpdate(
        { _id: req.params.id, tenantId, status: { $in: ['pending', 'preparing'] } },
        { $set: { status: 'cancelled' } },
        { new: true },
      );
      if (!order) { res.status(404).json({ success: false, message: 'Order not found or cannot be cancelled at this stage' }); return; }
      res.json({ success: true, data: order });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// GET /stats — daily stats
router.get(
  '/stats',
  requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin', 'auditor'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaOrder } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [statsResult, topItemsResult, peakHoursResult] = await Promise.all([
        CafeteriaOrder.aggregate([
          { $match: { tenantId, status: { $ne: 'cancelled' }, createdAt: { $gte: today, $lt: tomorrow } } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenue: { $sum: '$totalAmount' },
              totalGST: { $sum: '$gstAmount' },
              avgOrderValue: { $avg: '$totalAmount' },
            },
          },
        ]),
        CafeteriaOrder.aggregate([
          { $match: { tenantId, status: { $ne: 'cancelled' }, createdAt: { $gte: today, $lt: tomorrow } } },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.itemName',
              quantitySold: { $sum: '$items.quantity' },
              revenue: { $sum: '$items.totalPrice' },
            },
          },
          { $sort: { quantitySold: -1 } },
          { $limit: 5 },
        ]),
        CafeteriaOrder.aggregate([
          { $match: { tenantId, status: { $ne: 'cancelled' }, createdAt: { $gte: today, $lt: tomorrow } } },
          { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
      ]);

      const stats = statsResult[0] ?? { totalOrders: 0, totalRevenue: 0, totalGST: 0, avgOrderValue: 0 };

      res.json({
        success: true,
        data: {
          date: today.toISOString().split('T')[0],
          totalOrders: stats.totalOrders,
          totalRevenue: Math.round(stats.totalRevenue * 100) / 100,
          totalGST: Math.round(stats.totalGST * 100) / 100,
          avgOrderValue: Math.round(stats.avgOrderValue * 100) / 100,
          topItems: topItemsResult,
          peakHours: peakHoursResult.map((h: any) => ({ hour: h._id, count: h.count })),
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// GET /kitchen-view — pending and preparing orders
router.get(
  '/kitchen-view',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const { CafeteriaOrder } = require('../models/CafeteriaMenu.model');
      const tenantId = getTenantId(req);

      const orders = await CafeteriaOrder.find({
        tenantId,
        status: { $in: ['pending', 'preparing'] },
      })
        .sort({ createdAt: 1 })
        .lean();

      res.json({ success: true, data: { orders, count: orders.length } });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

export default router;
