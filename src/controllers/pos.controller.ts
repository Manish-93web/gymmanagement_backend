import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import POSService from '../services/pos.service';

const createProductSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.enum(['supplement', 'equipment', 'apparel', 'accessory', 'other']),
    sku: z.string(),
    barcode: z.string().optional(),
    pricing: z.object({
        cost: z.number().positive(),
        sellingPrice: z.number().positive(),
        mrp: z.number().positive(),
    }),
    stock: z.object({
        quantity: z.number().min(0),
        minQuantity: z.number().min(0),
        unit: z.string(),
    }),
    vendor: z.object({
        name: z.string(),
        contact: z.string(),
        email: z.string().email().optional(),
    }).optional(),
});

const createSaleSchema = z.object({
    customerId: z.string().optional(),
    customerType: z.enum(['member', 'walk_in']),
    items: z.array(z.object({
        productId: z.string(),
        quantity: z.number().positive(),
        price: z.number().positive(),
    })),
    paymentMethod: z.enum(['cash', 'card', 'upi', 'razorpay', 'stripe']),
    discount: z.number().min(0).optional(),
    tax: z.number().min(0).optional(),
});

export class POSController {
    async createProduct(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createProductSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString() || '';

            const product = await POSService.createProduct({
                ...validatedData,
                tenantId,
                branchId,
            });

            res.status(201).json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    }

    async getProducts(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId.toString();
            const { branchId, category, lowStock, page, limit } = req.query;

            const result = await POSService.getProducts(
                tenantId,
                branchId as string,
                category as string,
                lowStock === 'true',
                page ? parseInt(page as string) : 1,
                limit ? parseInt(limit as string) : 50
            );

            res.status(200).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getProductById(req: Request, res: Response, next: NextFunction) {
        try {
            const { productId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const product = await POSService.getProductById(productId, tenantId);

            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            res.status(200).json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    }

    async updateProduct(req: Request, res: Response, next: NextFunction) {
        try {
            const { productId } = req.params;
            const tenantId = req.user!.tenantId.toString();

            const product = await POSService.updateProduct(productId, tenantId, req.body);

            res.status(200).json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    }

    async updateStock(req: Request, res: Response, next: NextFunction) {
        try {
            const { productId } = req.params;
            const { quantity, type } = req.body;
            const tenantId = req.user!.tenantId.toString();

            const product = await POSService.updateStock(productId, tenantId, quantity, type);

            res.status(200).json({ success: true, data: product });
        } catch (error) {
            next(error);
        }
    }

    async createSale(req: Request, res: Response, next: NextFunction) {
        try {
            const validatedData = createSaleSchema.parse(req.body);
            const tenantId = req.user!.tenantId.toString();
            const branchId = req.user!.branchId?.toString() || '';
            const soldBy = req.user!._id.toString();

            const sale = await POSService.createSale({
                ...validatedData,
                tenantId,
                branchId,
            }, soldBy);

            res.status(201).json({ success: true, data: sale });
        } catch (error) {
            next(error);
        }
    }

    async getSales(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId.toString();
            const { branchId, startDate, endDate, page, limit } = req.query;

            const result = await POSService.getSales(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined,
                page ? parseInt(page as string) : 1,
                limit ? parseInt(limit as string) : 20
            );

            res.status(200).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    async getSalesStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId.toString();
            const { branchId, startDate, endDate } = req.query;

            const stats = await POSService.getSalesStats(
                tenantId,
                branchId as string,
                startDate ? new Date(startDate as string) : undefined,
                endDate ? new Date(endDate as string) : undefined
            );

            res.status(200).json({ success: true, data: stats });
        } catch (error) {
            next(error);
        }
    }

    async getLowStockProducts(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId.toString();
            const { branchId } = req.query;

            const products = await POSService.getLowStockProducts(tenantId, branchId as string);

            res.status(200).json({ success: true, data: products });
        } catch (error) {
            next(error);
        }
    }
}

export default new POSController();
