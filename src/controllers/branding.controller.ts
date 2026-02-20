import { Request, Response, NextFunction } from 'express';
import Tenant from '../models/Tenant.model';

class BrandingController {
    /**
     * Get Web App Manifest for a specific Tenant
     * GET /api/branding/manifest/:tenantSlug
     */
    async getManifest(req: Request, res: Response, next: NextFunction) {
        try {
            const { tenantSlug } = req.params;

            // Find tenant by slug (or id if you prefer, but slug is prettier for URLs)
            // Assuming 'slug' field exists or we use name/subdomain. 
            // If slug doesn't exist in model, we might need to query by 'slug' or 'domain'.
            // Let's check Tenant model later. For now, assuming we can find by some identifier.

            // If we don't have a 'slug' field, we might iterate or use regex on name (slow) OR assume the ID is passed.
            // Requirement says "tenantSlug".
            // Let's assume we look up by 'domain' or 'slug'.

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
                display: "standalone",
                background_color: branding.primaryColor || '#ffffff',
                theme_color: branding.primaryColor || '#ffffff',
                icons: [
                    {
                        src: branding.logo || '/pwa-192x192.png',
                        sizes: "192x192",
                        type: "image/png"
                    },
                    {
                        src: branding.logo || '/pwa-512x512.png',
                        sizes: "512x512",
                        type: "image/png"
                    }
                ]
            };

            res.setHeader('Content-Type', 'application/manifest+json');
            res.status(200).send(manifest);
        } catch (error) {
            next(error);
        }
    }
}

export default new BrandingController();
