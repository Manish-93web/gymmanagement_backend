import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant.model';

class BrandingController {
    /**
     * GET /api/branding/manifest/:tenantSlug
     */
    async getManifest(req: Request, res: Response, next: NextFunction) {
        try {
            const { tenantSlug } = req.params;

            const tenant = await Tenant.findOne({
                $or: [{ slug: tenantSlug }, { domain: tenantSlug }]
            });

            if (!tenant) {
                res.status(404).json({ success: false, message: 'Tenant not found' });
                return;
            }

            const branding = tenant.branding || {
                primaryColor: '#ffffff',
                secondaryColor: '#000000',
                logo: 'https://placehold.co/192x192.png?text=Gym'
            };

            const manifest = {
                name: tenant.name,
                short_name: tenant.name,
                start_url: `/?tenant=${tenantSlug}`,
                display: 'standalone',
                background_color: branding.primaryColor || '#ffffff',
                theme_color: branding.primaryColor || '#ffffff',
                icons: [
                    {
                        src: branding.logo || '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: branding.logo || '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            };

            res.setHeader('Content-Type', 'application/manifest+json');
            res.status(200).send(manifest);
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/branding/settings
     * Returns branding settings for the current tenant
     */
    async getBrandingSettings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant context required' });
                return;
            }

            const tenant = await Tenant.findById(tenantId).select('name branding');
            if (!tenant) {
                res.status(404).json({ success: false, message: 'Tenant not found' });
                return;
            }

            res.json({
                success: true,
                data: {
                    gymName: tenant.name,
                    branding: tenant.branding || {
                        primaryColor: '#FF5F1F',
                        secondaryColor: '#1a1a2e',
                        logo: '',
                        favicon: '',
                        customDomain: '',
                        emailHeader: '',
                        smsSignature: '',
                        brandVoice: 'professional',
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/branding/settings
     * Updates branding settings for the current tenant
     */
    async updateBrandingSettings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant context required' });
                return;
            }

            const { gymName, primaryColor, secondaryColor, logo, favicon, customDomain, emailHeader, smsSignature, brandVoice } = req.body;

            const updateFields: Record<string, any> = {};
            if (gymName) updateFields.name = gymName;
            if (primaryColor !== undefined) updateFields['branding.primaryColor'] = primaryColor;
            if (secondaryColor !== undefined) updateFields['branding.secondaryColor'] = secondaryColor;
            if (logo !== undefined) updateFields['branding.logo'] = logo;
            if (favicon !== undefined) updateFields['branding.favicon'] = favicon;
            if (customDomain !== undefined) updateFields['branding.customDomain'] = customDomain;
            if (emailHeader !== undefined) updateFields['branding.emailHeader'] = emailHeader;
            if (smsSignature !== undefined) updateFields['branding.smsSignature'] = smsSignature;
            if (brandVoice !== undefined) updateFields['branding.brandVoice'] = brandVoice;

            const tenant = await Tenant.findByIdAndUpdate(
                tenantId,
                { $set: updateFields },
                { new: true }
            ).select('name branding');

            if (!tenant) {
                res.status(404).json({ success: false, message: 'Tenant not found' });
                return;
            }

            res.json({ success: true, message: 'Branding settings updated', data: { gymName: tenant.name, branding: tenant.branding } });
        } catch (error) {
            next(error);
        }
    }
}

export default new BrandingController();
