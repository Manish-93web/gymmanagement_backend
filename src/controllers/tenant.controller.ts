import { Request, Response } from 'express';
import tenantService from '../services/tenant.service';
import { z } from 'zod';

// Validation schemas
const createTenantSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    mobile: z.string().min(10).max(15),
    ownerFirstName: z.string().min(1),
    ownerLastName: z.string().min(1),
    ownerEmail: z.string().email(),
    ownerMobile: z.string().min(10).max(15),
    ownerPassword: z.string().min(8),
    subscriptionTier: z.enum(['trial', 'basic', 'pro', 'enterprise']),
    branding: z.object({
        logo: z.string().optional(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
    }).optional(),
});

const updateTenantSchema = z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    mobile: z.string().min(10).max(15).optional(),
    branding: z.object({
        logo: z.string().optional(),
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        customCss: z.string().optional(),
        customDomain: z.string().optional(),
        domainStatus: z.enum(['pending', 'verified', 'failed']).optional(),
    }).optional(),
    features: z.object({
        aiEnabled: z.boolean().optional(),
        onlineClasses: z.boolean().optional(),
        posEnabled: z.boolean().optional(),
        multiLocation: z.boolean().optional(),
    }).optional(),
    billing: z.object({
        currency: z.string().optional(),
        taxType: z.enum(['GST', 'VAT', 'None']).optional(),
        gstRate: z.number().optional(),
    }).optional(),
});

export class TenantController {
    // Create new tenant (Super Admin only)
    async createTenant(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = createTenantSchema.parse(req.body);

            const result = await tenantService.createTenant(validatedData);

            res.status(201).json({
                status: 'success',
                message: 'Tenant created successfully',
                data: {
                    tenant: result.tenant,
                    owner: {
                        id: result.owner._id,
                        email: result.owner.email,
                        role: result.owner.role,
                    },
                    branch: result.branch,
                },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to create tenant',
            });
        }
    }

    // Get tenant by ID
    async getTenant(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId } = req.params;

            const tenant = await tenantService.getTenantById(tenantId);

            if (!tenant) {
                res.status(404).json({
                    status: 'error',
                    message: 'Tenant not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                data: { tenant },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to get tenant',
            });
        }
    }

    // Get current tenant (for logged-in users)
    async getCurrentTenant(req: Request, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context missing',
                });
                return;
            }

            const tenant = await tenantService.getTenantById(req.tenantId);

            if (!tenant) {
                res.status(404).json({
                    status: 'error',
                    message: 'Tenant not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                data: { tenant },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to get tenant',
            });
        }
    }

    // Update tenant
    async updateTenant(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId } = req.params;
            const validatedData = updateTenantSchema.parse(req.body);

            const tenant = await tenantService.updateTenant(tenantId, validatedData);

            if (!tenant) {
                res.status(404).json({
                    status: 'error',
                    message: 'Tenant not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Tenant updated successfully',
                data: { tenant },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to update tenant',
            });
        }
    }

    // Get all tenants (Super Admin only)
    async getAllTenants(req: Request, res: Response): Promise<void> {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;

            const result = await tenantService.getAllTenants(page, limit);

            res.status(200).json({
                status: 'success',
                data: {
                    tenants: result.tenants,
                    pagination: {
                        page,
                        limit,
                        total: result.total,
                        pages: Math.ceil(result.total / limit),
                    },
                },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to get tenants',
            });
        }
    }

    // Toggle feature
    async toggleFeature(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId } = req.params;
            const { feature, enabled } = req.body;

            if (!feature || typeof enabled !== 'boolean') {
                res.status(400).json({
                    status: 'error',
                    message: 'Feature and enabled status are required',
                });
                return;
            }

            const tenant = await tenantService.toggleFeature(tenantId, feature, enabled);

            if (!tenant) {
                res.status(404).json({
                    status: 'error',
                    message: 'Tenant not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Feature toggled successfully',
                data: { tenant },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to toggle feature',
            });
        }
    }

    // Deactivate tenant (Super Admin only)
    async deactivateTenant(req: Request, res: Response): Promise<void> {
        try {
            const { tenantId } = req.params;

            const tenant = await tenantService.deactivateTenant(tenantId);

            if (!tenant) {
                res.status(404).json({
                    status: 'error',
                    message: 'Tenant not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Tenant deactivated successfully',
                data: { tenant },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to deactivate tenant',
            });
        }
    }
}

export default new TenantController();
