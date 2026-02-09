import Tenant, { ITenant } from '../models/Tenant.model';
import Branch, { IBranch } from '../models/Branch.model';
import User from '../models/User.model';
import mongoose from 'mongoose';

export interface CreateTenantDTO {
    name: string;
    email: string;
    mobile: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    ownerMobile: string;
    ownerPassword: string;
    subscriptionTier: 'trial' | 'basic' | 'pro' | 'enterprise';
    branding?: {
        logo?: string;
        primaryColor?: string;
        secondaryColor?: string;
    };
}

export interface UpdateTenantDTO {
    name?: string;
    email?: string;
    mobile?: string;
    branding?: {
        logo?: string;
        primaryColor?: string;
        secondaryColor?: string;
        fontFamily?: string;
    };
    features?: {
        aiEnabled?: boolean;
        onlineClasses?: boolean;
        posEnabled?: boolean;
        multiLocation?: boolean;
    };
    billing?: {
        currency?: string;
        taxType?: 'GST' | 'VAT' | 'None';
        gstRate?: number;
    };
}

export class TenantService {
    // Create new tenant with owner and default branch
    async createTenant(data: CreateTenantDTO): Promise<{ tenant: ITenant; owner: any; branch: IBranch }> {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            // Check if tenant already exists
            const existingTenant = await Tenant.findOne({
                $or: [{ email: data.email }, { 'contact.email': data.ownerEmail }],
            });

            if (existingTenant) {
                throw new Error('Tenant already exists with this email');
            }

            // Create tenant
            const tenant = await Tenant.create([{
                name: data.name,
                email: data.email,
                mobile: data.mobile,
                subscription: {
                    tier: data.subscriptionTier,
                    startDate: new Date(),
                    endDate: data.subscriptionTier === 'trial'
                        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days trial
                        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
                    isActive: true,
                },
                branding: data.branding || {},
                features: {
                    aiEnabled: data.subscriptionTier === 'pro' || data.subscriptionTier === 'enterprise',
                    onlineClasses: data.subscriptionTier !== 'basic',
                    posEnabled: true,
                    multiLocation: data.subscriptionTier === 'enterprise',
                },
                contact: {
                    email: data.ownerEmail,
                    mobile: data.ownerMobile,
                },
            }], { session });

            // Create default branch
            const branch = await Branch.create([{
                tenantId: tenant[0]._id,
                name: 'Main Branch',
                email: data.email,
                mobile: data.mobile,
                address: {
                    street: '',
                    city: '',
                    state: '',
                    country: '',
                    zipCode: '',
                },
                operatingHours: [
                    { day: 'Monday', openTime: '06:00', closeTime: '22:00', isClosed: false },
                    { day: 'Tuesday', openTime: '06:00', closeTime: '22:00', isClosed: false },
                    { day: 'Wednesday', openTime: '06:00', closeTime: '22:00', isClosed: false },
                    { day: 'Thursday', openTime: '06:00', closeTime: '22:00', isClosed: false },
                    { day: 'Friday', openTime: '06:00', closeTime: '22:00', isClosed: false },
                    { day: 'Saturday', openTime: '06:00', closeTime: '22:00', isClosed: false },
                    { day: 'Sunday', openTime: '06:00', closeTime: '22:00', isClosed: false },
                ],
            }], { session });

            // Create gym owner user
            const owner = await User.create([{
                tenantId: tenant[0]._id,
                branchId: branch[0]._id,
                email: data.ownerEmail,
                mobile: data.ownerMobile,
                password: data.ownerPassword,
                firstName: data.ownerFirstName,
                lastName: data.ownerLastName,
                role: 'gym_owner',
                isActive: true,
                isEmailVerified: true,
                isMobileVerified: true,
            }], { session });

            await session.commitTransaction();

            return {
                tenant: tenant[0],
                owner: owner[0],
                branch: branch[0],
            };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    // Get tenant by ID
    async getTenantById(tenantId: string): Promise<ITenant | null> {
        return await Tenant.findById(tenantId);
    }

    // Update tenant
    async updateTenant(tenantId: string, data: UpdateTenantDTO): Promise<ITenant | null> {
        return await Tenant.findByIdAndUpdate(
            tenantId,
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Get all tenants (Super Admin only)
    async getAllTenants(page: number = 1, limit: number = 20): Promise<{ tenants: ITenant[]; total: number }> {
        const skip = (page - 1) * limit;

        const [tenants, total] = await Promise.all([
            Tenant.find().skip(skip).limit(limit).sort({ createdAt: -1 }),
            Tenant.countDocuments(),
        ]);

        return { tenants, total };
    }

    // Update subscription
    async updateSubscription(
        tenantId: string,
        tier: 'trial' | 'basic' | 'pro' | 'enterprise',
        endDate: Date
    ): Promise<ITenant | null> {
        return await Tenant.findByIdAndUpdate(
            tenantId,
            {
                $set: {
                    'subscription.tier': tier,
                    'subscription.endDate': endDate,
                    'subscription.isActive': true,
                },
            },
            { new: true }
        );
    }

    // Toggle feature
    async toggleFeature(tenantId: string, feature: string, enabled: boolean): Promise<ITenant | null> {
        return await Tenant.findByIdAndUpdate(
            tenantId,
            { $set: { [`features.${feature}`]: enabled } },
            { new: true }
        );
    }

    // Deactivate tenant
    async deactivateTenant(tenantId: string): Promise<ITenant | null> {
        return await Tenant.findByIdAndUpdate(
            tenantId,
            { $set: { 'subscription.isActive': false } },
            { new: true }
        );
    }
}

export default new TenantService();
