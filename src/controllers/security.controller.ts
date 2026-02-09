import { Request, Response } from 'express';
import { z } from 'zod';
import GoogleAuthService from '../services/google-auth.service';
import CustomDomainService from '../services/custom-domain.service';
import AuditService from '../services/audit.service';

// Validation schemas
const googleAuthSchema = z.object({
    token: z.string().min(1, 'Token is required'),
});

const googleCallbackSchema = z.object({
    code: z.string().min(1, 'Authorization code is required'),
});

const addDomainSchema = z.object({
    domain: z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/, 'Invalid domain format'),
});

const auditLogFilterSchema = z.object({
    userId: z.string().optional(),
    action: z.string().optional(),
    resource: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    status: z.enum(['success', 'failure']).optional(),
    page: z.number().int().positive().optional(),
    limit: z.number().int().positive().max(100).optional(),
});

class SecurityController {
    /**
     * Get Google OAuth URL
     */
    async getGoogleAuthUrl(req: Request, res: Response) {
        try {
            const url = GoogleAuthService.getAuthUrl();

            res.json({
                success: true,
                data: { url },
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to generate Google auth URL',
            });
        }
    }

    /**
     * Handle Google OAuth callback
     */
    async googleCallback(req: Request, res: Response) {
        try {
            const { code } = googleCallbackSchema.parse(req.body);

            const result = await GoogleAuthService.handleCallback(code);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message || 'Google authentication failed',
            });
        }
    }

    /**
     * Link Google account
     */
    async linkGoogleAccount(req: Request, res: Response) {
        try {
            const { token } = googleAuthSchema.parse(req.body);
            const userId = (req as any).user._id;

            const result = await GoogleAuthService.linkAccount(userId, token);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to link Google account',
            });
        }
    }

    /**
     * Unlink Google account
     */
    async unlinkGoogleAccount(req: Request, res: Response) {
        try {
            const userId = (req as any).user._id;

            const result = await GoogleAuthService.unlinkAccount(userId);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to unlink Google account',
            });
        }
    }

    /**
     * Add custom domain
     */
    async addCustomDomain(req: Request, res: Response) {
        try {
            const { domain } = addDomainSchema.parse(req.body);
            const tenantId = (req as any).user.tenantId;

            const result = await CustomDomainService.addDomain(tenantId, domain);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to add custom domain',
            });
        }
    }

    /**
     * Verify custom domain
     */
    async verifyCustomDomain(req: Request, res: Response) {
        try {
            const tenantId = (req as any).user.tenantId;

            const result = await CustomDomainService.verifyDomain(tenantId);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to verify domain',
            });
        }
    }

    /**
     * Remove custom domain
     */
    async removeCustomDomain(req: Request, res: Response) {
        try {
            const tenantId = (req as any).user.tenantId;

            const result = await CustomDomainService.removeDomain(tenantId);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to remove domain',
            });
        }
    }

    /**
     * Get domain status
     */
    async getDomainStatus(req: Request, res: Response) {
        try {
            const tenantId = (req as any).user.tenantId;

            const result = await CustomDomainService.getDomainStatus(tenantId);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to get domain status',
            });
        }
    }

    /**
     * Get audit logs
     */
    async getAuditLogs(req: Request, res: Response) {
        try {
            const filters = auditLogFilterSchema.parse(req.query);
            const user = (req as any).user;

            // Non-admin users can only see their own logs
            if (user.role !== 'super_admin' && user.role !== 'gym_owner') {
                filters.userId = user._id;
            }

            // Filter by tenant
            const tenantId = user.tenantId;

            const result = await AuditService.getLogs({
                ...filters,
                tenantId,
                startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                endDate: filters.endDate ? new Date(filters.endDate) : undefined,
            });

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to get audit logs',
            });
        }
    }

    /**
     * Get audit statistics
     */
    async getAuditStatistics(req: Request, res: Response) {
        try {
            const tenantId = (req as any).user.tenantId;
            const days = parseInt(req.query.days as string) || 30;

            const result = await AuditService.getStatistics(tenantId, days);

            res.json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to get audit statistics',
            });
        }
    }

    /**
     * Export audit logs
     */
    async exportAuditLogs(req: Request, res: Response) {
        try {
            const filters = auditLogFilterSchema.parse(req.query);
            const format = (req.query.format as 'json' | 'csv') || 'json';
            const tenantId = (req as any).user.tenantId;

            const result = await AuditService.exportLogs(
                {
                    ...filters,
                    tenantId,
                    startDate: filters.startDate ? new Date(filters.startDate) : undefined,
                    endDate: filters.endDate ? new Date(filters.endDate) : undefined,
                },
                format
            );

            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
                res.send(result);
            } else {
                res.json({
                    success: true,
                    data: result,
                });
            }
        } catch (error: any) {
            res.status(400).json({
                success: false,
                message: error.message || 'Failed to export audit logs',
            });
        }
    }
}

export default new SecurityController();
