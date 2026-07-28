import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenantIsolation.middleware';
import TenantModel from '../models/Tenant.model';

const router = Router();
router.use(authenticate);
router.use(tenantIsolation);

// GET /api/gym-qr/profile — returns QR data for public profile URL
// The actual QR image is generated client-side (we return the URL to encode)
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId;

    let slug = tenantId ?? 'gym';
    let gymName = 'Gym';
    let whatsappNumber = '';
    let address = '';

    if (tenantId) {
      try {
        const tenant = await TenantModel.findById(tenantId).lean();
        if (tenant) {
          slug = tenant.slug || tenantId;
          gymName = tenant.name || 'Gym';
          // Prefer WhatsApp fromNumber, fall back to contactInfo.phone
          whatsappNumber =
            tenant.integrations?.whatsapp?.fromNumber ||
            tenant.contactInfo?.phone ||
            '';
          address = tenant.contactInfo?.address
            ? [
                tenant.contactInfo.address,
                tenant.contactInfo.city,
                tenant.contactInfo.state,
              ]
                .filter(Boolean)
                .join(', ')
            : '';
        }
      } catch {
        // Fall back to defaults if tenant lookup fails
      }
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://yourgym.fitfaat.com';
    const publicProfileUrl = `${baseUrl}/gym/${slug}`;

    const digitsOnly = whatsappNumber.replace(/\D/g, '');
    const whatsappUrl = digitsOnly
      ? `https://wa.me/${digitsOnly}?text=Hi%20${encodeURIComponent(gymName)}%2C%20I%27d%20like%20to%20know%20more%20about%20your%20gym`
      : null;

    const trialBookingUrl = `${publicProfileUrl}?action=book-trial`;

    res.json({
      success: true,
      data: {
        gymName,
        slug,
        publicProfileUrl,
        whatsappUrl,
        trialBookingUrl,
        address,
        qrCodes: [
          {
            label: 'Public Profile',
            url: publicProfileUrl,
            description: 'Scan to view gym profile & book a free trial',
          },
          ...(whatsappUrl
            ? [
                {
                  label: 'WhatsApp Chat',
                  url: whatsappUrl,
                  description: 'Scan to chat with us on WhatsApp',
                },
              ]
            : []),
          {
            label: 'Book Free Trial',
            url: trialBookingUrl,
            description: 'Scan to book a free trial session',
          },
        ],
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/gym-qr/custom — generate QR for custom URL (e.g., special offer page)
router.post('/custom', async (req: Request, res: Response) => {
  try {
    const { url, label, description } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, message: 'URL required' });
    }
    res.json({
      success: true,
      data: {
        url,
        label: label || 'Custom QR',
        description: description || '',
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
