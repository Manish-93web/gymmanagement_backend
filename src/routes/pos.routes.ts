import { Router, Request, Response } from 'express';
import posController from '../controllers/pos.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import Product from '../models/Product.model';
import mongoose from 'mongoose';

const router = Router();

router.use(authenticate);

// Product routes
router.post('/products', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), posController.createProduct.bind(posController));
router.get('/products', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), posController.getProducts.bind(posController));
router.get('/products/low-stock', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), posController.getLowStockProducts.bind(posController));

// Inventory statistics (must be before /:productId to avoid route conflict)
router.get('/products/stats', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'auditor', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId;
        const matchStage: any = tenantId ? { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } } : { $match: {} };
        const [byCategory, totals] = await Promise.all([
            Product.aggregate([matchStage, { $group: { _id: '$category', count: { $sum: 1 }, totalStock: { $sum: '$inventory.currentStock' }, totalValue: { $sum: { $multiply: ['$inventory.currentStock', '$pricing.cost'] } } } }, { $sort: { count: -1 } }]),
            Product.aggregate([matchStage, { $group: { _id: null, totalProducts: { $sum: 1 }, totalStock: { $sum: '$inventory.currentStock' }, totalValue: { $sum: { $multiply: ['$inventory.currentStock', '$pricing.cost'] } }, lowStockCount: { $sum: { $cond: [{ $lte: ['$inventory.currentStock', '$inventory.minStock'] }, 1, 0] } } } }]),
        ]);
        res.json({ success: true, data: { totalProducts: totals[0]?.totalProducts ?? 0, totalStock: totals[0]?.totalStock ?? 0, totalValue: totals[0]?.totalValue ?? 0, lowStockCount: totals[0]?.lowStockCount ?? 0, byCategory } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.get('/products/:productId', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), posController.getProductById.bind(posController));
router.put('/products/:productId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), posController.updateProduct.bind(posController));
router.post('/products/:productId/stock', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), posController.updateStock.bind(posController));

// Sales routes
router.post('/sales', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), posController.createSale.bind(posController));
router.get('/sales', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), posController.getSales.bind(posController));
router.get('/sales/stats', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), posController.getSalesStats.bind(posController));

export default router;
