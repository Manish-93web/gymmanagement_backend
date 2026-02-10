import Tenant, { ITenant } from '../models/Tenant.model';
import Branch, { IBranch } from '../models/Branch.model';
import User from '../models/User.model';
import mongoose from 'mongoose';
import { slugify } from '../utils/helpers.utils';

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
            const slug = `${slugify(data.name)}`;
            const existingTenant = await Tenant.findOne({
                $or: [
                    { 'contactInfo.email': data.email },
                    { 'contactInfo.phone': data.mobile },
                    { slug: new RegExp(`^${slug}`, 'i') }
                ],
            });

            if (existingTenant) {
                throw new Error('Gym with this email, mobile or name already exists');
            }


            // Create tenant
            const tenant = new Tenant({
                name: data.name,
                slug: `${slugify(data.name)}-${Date.now().toString(36)}`,
                subscription: {
                    plan: data.subscriptionTier,
                    startDate: new Date(),
                    endDate: data.subscriptionTier === 'trial'
                        ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days trial
                        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
                    maxBranches: data.subscriptionTier === 'trial' ? 1 : 5,
                    maxMembers: data.subscriptionTier === 'trial' ? 100 : 1000,
                    maxTrainers: data.subscriptionTier === 'trial' ? 10 : 50,
                },
                branding: {
                    logo: data.branding?.logo,
                    primaryColor: data.branding?.primaryColor || '#6366f1',
                    secondaryColor: data.branding?.secondaryColor || '#8b5cf6',
                },
                features: {
                    aiEnabled: ['pro', 'enterprise'].includes(data.subscriptionTier),
                    onlineClasses: data.subscriptionTier !== 'basic',
                    pos: true,
                },
                contactInfo: {
                    email: data.email,
                    phone: data.mobile,
                    address: '',
                    city: '',
                    state: '',
                    country: '',
                    zipCode: '',
                },
                billing: {
                    billingEmail: data.email,
                }
            });
            await tenant.save({ session });

            // Create default branch
            const normalizedGymMobile = data.mobile.replace(/\D/g, '');
            const branch = new Branch({
                tenantId: tenant._id,
                name: 'Main Branch',
                code: 'MAIN',
                contactInfo: {
                    email: data.email,
                    phone: normalizedGymMobile,

                    address: 'Main St',
                    city: 'City',
                    state: 'State',
                    country: 'Country',
                    zipCode: '000000',
                },
                operatingHours: [
                    { day: 'monday', openTime: '06:00', closeTime: '22:00', isOpen: true },
                    { day: 'tuesday', openTime: '06:00', closeTime: '22:00', isOpen: true },
                    { day: 'wednesday', openTime: '06:00', closeTime: '22:00', isOpen: true },
                    { day: 'thursday', openTime: '06:00', closeTime: '22:00', isOpen: true },
                    { day: 'friday', openTime: '06:00', closeTime: '22:00', isOpen: true },
                    { day: 'saturday', openTime: '06:00', closeTime: '22:00', isOpen: true },
                    { day: 'sunday', openTime: '06:00', closeTime: '20:00', isOpen: true },
                ],
            });
            await branch.save({ session });

            // Create gym owner user
            const normalizedOwnerMobile = data.ownerMobile.replace(/\D/g, '');
            const owner = new User({
                tenantId: tenant._id,
                branchId: branch._id,
                email: data.ownerEmail,
                mobile: normalizedOwnerMobile,
                password: data.ownerPassword,
                firstName: data.ownerFirstName,
                lastName: data.ownerLastName,
                role: 'gym_owner',
                isActive: true,
                isEmailVerified: true,
                isMobileVerified: true,
            });
            await owner.save({ session });


            await session.commitTransaction();

            return {
                tenant,
                owner,
                branch,
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
        return await Tenant.findById(tenantId).populate('saasPlanId');
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
