import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { storeImage, storeBase64 } from '../utils/upload.util';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Static file serving for local uploads ───────────────────────────────────
// Mount this in server.ts: app.use('/uploads', express.static('public/uploads'))

router.use(authenticate, tenantContext);

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
            const tenantId = (req as any).tenantId?.toString() || 'global';
            const { type = 'logo' } = req.body;
            const publicId = `${tenantId}/${type}`;

            const result = await storeImage(req.file.buffer, 'branding', publicId, req.file.mimetype);
            return res.json({
                success: true,
                data: { url: result.url, publicId: result.publicId, type, storage: result.storage },
            });
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
