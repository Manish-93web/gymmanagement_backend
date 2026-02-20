import { Router } from 'express';
import posController from '../controllers/pos.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

router.use(authenticate);

// Product routes
router.post('/products', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), posController.createProduct.bind(posController));
router.get('/products', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), posController.getProducts.bind(posController));
router.get('/products/low-stock', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), posController.getLowStockProducts.bind(posController));
router.get('/products/:productId', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), posController.getProductById.bind(posController));
router.put('/products/:productId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), posController.updateProduct.bind(posController));
router.post('/products/:productId/stock', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), posController.updateStock.bind(posController));

// Sales routes
router.post('/sales', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'), posController.createSale.bind(posController));
router.get('/sales', requireAnyRole('gym_owner', 'branch_manager', 'staff', 'accountant', 'super_admin'), posController.getSales.bind(posController));
router.get('/sales/stats', requireAnyRole('gym_owner', 'branch_manager', 'accountant', 'super_admin'), posController.getSalesStats.bind(posController));

export default router;
