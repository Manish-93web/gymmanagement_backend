import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import MarketplaceProduct from '../models/MarketplaceProduct.model';
import MarketplaceOrder from '../models/MarketplaceOrder.model';

const router = Router();
router.use(authenticate, tenantContext);

// ─── Products ─────────────────────────────────────────────────────────────────

// GET /marketplace/products
router.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { category, q, featured, page = '1', limit = '30' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const filter: any = { tenantId, isActive: true };
    if (category) filter.category = category;
    if (featured === 'true') filter.isFeatured = true;
    if (q) filter.$text = { $search: String(q) };
    const [products, total] = await Promise.all([
      MarketplaceProduct.find(filter).sort({ isFeatured: -1, sortOrder: 1, orderCount: -1 }).skip(skip).limit(parseInt(String(limit))).lean(),
      MarketplaceProduct.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { products, total } });
  } catch (err) { next(err); }
});

// GET /marketplace/products/:id
router.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const product = await MarketplaceProduct.findOne({ _id: req.params.id, tenantId, isActive: true }).lean();
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    MarketplaceProduct.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec();
    return res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

// POST /marketplace/products — admin create
router.post('/products', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const createdBy = (req as any).user?._id;
    const product = await MarketplaceProduct.create({ ...req.body, tenantId, createdBy });
    return res.status(201).json({ success: true, data: product });
  } catch (err) { next(err); }
});

// PUT /marketplace/products/:id
router.put('/products/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const product = await MarketplaceProduct.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: req.body }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: product });
  } catch (err) { next(err); }
});

// DELETE /marketplace/products/:id
router.delete('/products/:id', requireAnyRole('gym_owner', 'super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    await MarketplaceProduct.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: { isActive: false } });
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── Orders ───────────────────────────────────────────────────────────────────

// POST /marketplace/orders — place an order
router.post('/orders', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { memberId, memberName, items, paymentMethod = 'pending', notes, deliveryType = 'pickup', deliveryAddress } = req.body;
    if (!memberId || !memberName || !items?.length) {
      return res.status(400).json({ success: false, message: 'memberId, memberName and items are required' });
    }
    // Validate products and compute totals
    let subtotal = 0;
    const resolvedItems = [];
    for (const item of items) {
      const product = await MarketplaceProduct.findOne({ _id: item.productId, tenantId, isActive: true });
      if (!product) return res.status(400).json({ success: false, message: `Product ${item.productId} not found` });
      if (!product.isInfiniteStock && product.stock < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }
      const price = product.memberPrice ?? product.price;
      const itemSubtotal = price * item.quantity;
      subtotal += itemSubtotal;
      resolvedItems.push({ productId: product._id, name: product.name, imageUrl: product.imageUrl, price, quantity: item.quantity, variant: item.variant, subtotal: itemSubtotal });
      // Deduct stock
      if (!product.isInfiniteStock) {
        await MarketplaceProduct.findByIdAndUpdate(product._id, { $inc: { stock: -item.quantity, orderCount: item.quantity } });
      }
    }
    const taxAmount = Math.round(subtotal * 0.05); // 5% GST on supplements
    const total = subtotal + taxAmount;
    const orderNumber = `MKT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

    const order = await MarketplaceOrder.create({
      tenantId, memberId, memberName, orderNumber, items: resolvedItems,
      subtotal, taxAmount, discountAmount: 0, total,
      paymentMethod, notes, deliveryType, deliveryAddress,
    });
    return res.status(201).json({ success: true, data: order });
  } catch (err) { next(err); }
});

// GET /marketplace/orders — list orders (admin)
router.get('/orders', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'staff_reception'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status, memberId, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const filter: any = { tenantId };
    if (status) filter.status = status;
    if (memberId) filter.memberId = memberId;
    const [orders, total] = await Promise.all([
      MarketplaceOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(String(limit))).lean(),
      MarketplaceOrder.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { orders, total } });
  } catch (err) { next(err); }
});

// GET /marketplace/orders/member/:memberId — member's own orders
router.get('/orders/member/:memberId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const orders = await MarketplaceOrder.find({ tenantId, memberId: req.params.memberId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});

// PATCH /marketplace/orders/:id/status
router.patch('/orders/:id/status', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'staff_reception'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { status, paymentStatus, paymentMethod } = req.body;
    const update: any = {};
    if (status) update.status = status;
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (paymentMethod) update.paymentMethod = paymentMethod;
    const order = await MarketplaceOrder.findOneAndUpdate({ _id: req.params.id, tenantId }, { $set: update }, { new: true });
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

// GET /marketplace/summary — stats for admin
router.get('/summary', requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'accountant'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const [totalProducts, activeOrders, pendingOrders] = await Promise.all([
      MarketplaceProduct.countDocuments({ tenantId, isActive: true }),
      MarketplaceOrder.countDocuments({ tenantId, status: { $in: ['confirmed', 'processing', 'ready_for_pickup'] } }),
      MarketplaceOrder.countDocuments({ tenantId, status: 'pending' }),
    ]);
    const revenueAgg = await MarketplaceOrder.aggregate([
      { $match: { tenantId, paymentStatus: 'paid' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    return res.json({ success: true, data: { totalProducts, activeOrders, pendingOrders, totalRevenue: revenueAgg[0]?.total ?? 0 } });
  } catch (err) { next(err); }
});

export default router;
