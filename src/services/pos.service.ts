import Product, { IProduct } from '../models/Product.model';
import Sale, { ISale } from '../models/Sale.model';
import mongoose from 'mongoose';

export interface CreateProductDTO {
    tenantId?: string;
    branchId: string;
    name: string;
    description?: string;
    category: 'supplement' | 'equipment' | 'apparel' | 'accessory' | 'other';
    sku: string;
    barcode?: string;
    pricing: {
        cost: number;
        sellingPrice: number;
        mrp: number;
    };
    inventory: {
        currentStock: number;
        minStock: number;
        unit: string;
    };
    vendor?: {
        name: string;
        contact: string;
        email?: string;
    };
}

export interface CreateSaleDTO {
    tenantId?: string;
    branchId: string;
    customerId?: string;
    customerType: 'member' | 'walk_in';
    items: {
        productId: string;
        quantity: number;
        price: number;
    }[];
    paymentMethod: 'cash' | 'card' | 'upi' | 'razorpay' | 'stripe';
    discount?: number;
    tax?: number;
}

export class POSService {
    // Create product
    async createProduct(data: CreateProductDTO): Promise<IProduct> {
        const product = await Product.create(data);
        return product;
    }

    // Get product by ID
    async getProductById(productId: string, tenantId: string | undefined): Promise<IProduct | null> {
        const filter: any = { _id: productId };
        if (tenantId) filter.tenantId = tenantId;
        return await Product.findOne(filter);
    }

    // Get product by SKU/Barcode
    async getProductByCode(code: string, tenantId: string | undefined): Promise<IProduct | null> {
        const filter: any = { $or: [{ sku: code }, { barcode: code }] };
        if (tenantId) filter.tenantId = tenantId;
        return await Product.findOne(filter);
    }

    // Update product
    async updateProduct(productId: string, tenantId: string | undefined, data: Partial<CreateProductDTO>): Promise<IProduct | null> {
        const filter: any = { _id: productId };
        if (tenantId) filter.tenantId = tenantId;
        return await Product.findOneAndUpdate(
            filter,
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Update stock
    async updateStock(productId: string, tenantId: string | undefined, quantity: number, type: 'add' | 'remove'): Promise<IProduct | null> {
        const filter: any = { _id: productId };
        if (tenantId) filter.tenantId = tenantId;
        const product = await Product.findOne(filter);

        if (!product) {
            throw new Error('Product not found');
        }

        const newQuantity = type === 'add'
            ? product.inventory.currentStock + quantity
            : product.inventory.currentStock - quantity;

        if (newQuantity < 0) {
            throw new Error('Insufficient stock');
        }

        return await Product.findOneAndUpdate(
            filter,
            {
                $set: { 'inventory.currentStock': newQuantity },
                $push: {
                    stockHistory: {
                        date: new Date(),
                        type: type === 'add' ? 'purchase' : 'sale',
                        quantity: type === 'add' ? quantity : -quantity,
                        balance: newQuantity,
                    },
                },
            },
            { new: true }
        );
    }

    // Get products
    async getProducts(
        tenantId?: string,
        branchId?: string,
        category?: string,
        lowStock?: boolean,
        page: number = 1,
        limit: number = 50
    ): Promise<{ products: IProduct[]; total: number }> {
        const skip = (page - 1) * limit;


        const filter: any = {};
        if (tenantId) filter.tenantId = tenantId;
        if (branchId) filter.branchId = branchId;
        if (category) filter.category = category;
        if (lowStock) {
            filter.$expr = { $lte: ['$inventory.currentStock', '$inventory.minStock'] };
        }

        const [products, total] = await Promise.all([
            Product.find(filter).skip(skip).limit(limit).sort({ name: 1 }),
            Product.countDocuments(filter),
        ]);

        return { products, total };
    }

    // Create sale
    async createSale(data: CreateSaleDTO, soldBy: string): Promise<ISale> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Calculate totals
            let subtotal = 0;
            const items = [];

            for (const item of data.items) {
                const product = await Product.findById(item.productId).session(session);

                if (!product) {
                    throw new Error(`Product ${item.productId} not found`);
                }

                if (product.inventory.currentStock < item.quantity) {
                    throw new Error(`Insufficient stock for ${product.name}`);
                }

                subtotal += item.price * item.quantity;
                items.push({
                    productId: item.productId,
                    productName: product.name,
                    quantity: item.quantity,
                    unitPrice: item.price,
                    discount: 0,
                    taxAmount: 0,
                    total: item.price * item.quantity,
                });

                // Update stock
                await Product.findByIdAndUpdate(
                    item.productId,
                    {
                        $inc: { 'inventory.currentStock': -item.quantity },
                        $push: {
                            stockHistory: {
                                date: new Date(),
                                type: 'sale',
                                quantity: -item.quantity,
                                balance: product.inventory.currentStock - item.quantity,
                            },
                        },
                    },
                    { session }
                );
            }

            const discountAmt = data.discount || 0;
            const taxAmount = data.tax || 0;
            const total = subtotal - discountAmt + taxAmount;
            const invoiceNumber = `POS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            const customerType = data.customerType === 'walk_in' ? 'guest' : data.customerType;

            const sale = await (Sale as any).create([{
                tenantId: data.tenantId,
                branchId: data.branchId,
                invoiceNumber,
                customerId: data.customerId,
                customerType,
                items,
                totals: { subtotal, discount: discountAmt, taxAmount, total },
                paymentMethod: data.paymentMethod === 'razorpay' ? 'card' : data.paymentMethod,
                paymentStatus: 'completed',
                soldBy,
            }], { session });

            await session.commitTransaction();
            return sale[0];
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    // Get sales
    async getSales(
        tenantId?: string,
        branchId?: string,
        startDate?: Date,
        endDate?: Date,
        page: number = 1,
        limit: number = 20
    ): Promise<{ sales: ISale[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = {};
        if (tenantId) filter.tenantId = tenantId;
        if (branchId) filter.branchId = branchId;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = startDate;
            if (endDate) filter.createdAt.$lte = endDate;
        }

        const [sales, total] = await Promise.all([
            Sale.find(filter)
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 })
                .populate('soldBy', 'firstName lastName')
                .populate('customerId', 'firstName lastName membershipNumber'),
            Sale.countDocuments(filter),
        ]);

        return { sales, total };
    }

    // Get sales statistics
    async getSalesStats(
        tenantId?: string,
        branchId?: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<any> {
        const filter: any = {};
        if (tenantId) filter.tenantId = tenantId;
        if (branchId) filter.branchId = branchId;
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = startDate;
            if (endDate) filter.createdAt.$lte = endDate;
        }

        const stats = await Sale.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: 1 },
                    totalRevenue: { $sum: '$total' },
                    totalDiscount: { $sum: '$discount' },
                    totalTax: { $sum: '$tax' },
                },
            },
        ]);

        const topProducts = await Sale.aggregate([
            { $match: filter },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.productId',
                    productName: { $first: '$items.productName' },
                    totalQuantity: { $sum: '$items.quantity' },
                    totalRevenue: { $sum: '$items.total' },
                },
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
        ]);

        return {
            totalSales: stats[0]?.totalSales || 0,
            totalRevenue: stats[0]?.totalRevenue || 0,
            totalDiscount: stats[0]?.totalDiscount || 0,
            totalTax: stats[0]?.totalTax || 0,
            topProducts,
        };
    }

    // Get low stock products
    async getLowStockProducts(tenantId?: string, branchId?: string): Promise<IProduct[]> {
        const filter: any = {
            $expr: { $lte: ['$inventory.currentStock', '$inventory.minStock'] },
        };
        if (tenantId) filter.tenantId = tenantId;
        if (branchId) filter.branchId = branchId;

        return await Product.find(filter).sort({ 'inventory.currentStock': 1 });
    }
}

export default new POSService();
