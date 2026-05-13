import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { storeImage, storeBase64, isCloudinaryConfigured } from '../utils/upload.util';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Static file serving for local uploads ───────────────────────────────────
// Mount this in server.ts: app.use('/uploads', express.static('public/uploads'))

router.use(authenticate, tenantContext);

const BRANDING_VALID_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg', 'image/webp'];
const BRANDING_MAX_SIZE = 500 * 1024; // 500 KB — keeps base64 payload manageable in MongoDB

// POST /api/upload/branding — upload logo/favicon
router.post(
    '/branding',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    upload.single('file'),
    async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }

            if (!BRANDING_VALID_TYPES.includes(req.file.mimetype)) {
                return res.status(400).json({ success: false, message: 'Invalid file type. Use PNG, SVG, JPG, or WebP.' });
            }

            if (req.file.size > BRANDING_MAX_SIZE) {
                return res.status(400).json({ success: false, message: 'File too large. Max size is 500 KB.' });
            }

            let url: string;
            let storage: string;

            if (isCloudinaryConfigured()) {
                const tenantId = (req as any).tenantId?.toString() || 'global';
                const { type = 'logo' } = req.body;
                const result = await storeImage(req.file.buffer, 'branding', `${tenantId}/${type}`, req.file.mimetype);
                url = result.url;
                storage = result.storage;
            } else {
                // Vercel serverless has no persistent filesystem — store as base64 data URL in MongoDB
                url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
                storage = 'dataurl';
            }

            // Return url at top level so clients can read res.data.url directly
            return res.json({ success: true, url, data: { url, storage } });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
        }
    }
);

// POST /api/upload/avatar — upload member/user profile photo
router.post(
    '/avatar',
    upload.single('file'),
    async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }
            const tenantId = (req as any).tenantId?.toString() || 'global';
            const { entityId } = req.body;
            const publicId = entityId ? `${tenantId}/${entityId}` : undefined;

            const result = await storeImage(req.file.buffer, 'avatars', publicId, req.file.mimetype);
            return res.json({
                success: true,
                data: { url: result.url, publicId: result.publicId, storage: result.storage },
            });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
        }
    }
);

// POST /api/upload/base64 — accept base64 data URL (from webcam capture)
router.post(
    '/base64',
    async (req: Request, res: Response) => {
        try {
            const { dataUrl, folder = 'avatars', entityId } = req.body;
            if (!dataUrl || !dataUrl.startsWith('data:image/')) {
                return res.status(400).json({ success: false, message: 'Invalid base64 image' });
            }
            const tenantId = (req as any).tenantId?.toString() || 'global';
            const url = await storeBase64(dataUrl, folder, entityId, tenantId);
            return res.json({ success: true, data: { url } });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
        }
    }
);

export default router;
