import path from 'path';
import fs from 'fs';
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { config } from '../config/config';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ── Storage strategy ──────────────────────────────────────────────────────────
const isCloudinaryConfigured = () =>
    !!(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);

// Ensure local upload directory exists
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
    fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
}

async function storeImage(
    buffer: Buffer,
    folder: string,
    publicId?: string,
    mimeType?: string
): Promise<{ url: string; publicId: string; storage: 'cloudinary' | 'local' | 'base64' }> {
    // Strategy 1: Cloudinary (when configured)
    if (isCloudinaryConfigured()) {
        cloudinary.config({
            cloud_name: config.cloudinary.cloudName,
            api_key: config.cloudinary.apiKey,
            api_secret: config.cloudinary.apiSecret,
        });
        const result = await new Promise<any>((resolve, reject) => {
            const opts: any = { folder, resource_type: 'image' };
            if (publicId) opts.public_id = publicId;
            const stream = cloudinary.uploader.upload_stream(opts, (err, res) => {
                if (err) return reject(err);
                resolve(res);
            });
            stream.end(buffer);
        });
        return { url: result.secure_url, publicId: result.public_id, storage: 'cloudinary' };
    }

    // Strategy 2: Local disk (development fallback)
    const ext = mimeType?.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const filename = publicId
        ? `${publicId.replace(/\//g, '_')}.${ext}`
        : `upload_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const subDir = path.join(LOCAL_UPLOAD_DIR, folder);
    if (!fs.existsSync(subDir)) fs.mkdirSync(subDir, { recursive: true });
    const filePath = path.join(subDir, filename);
    fs.writeFileSync(filePath, buffer);
    const url = `/uploads/${folder}/${filename}`;
    return { url, publicId: filename, storage: 'local' };
}

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
            const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (!matches) {
                return res.status(400).json({ success: false, message: 'Malformed data URL' });
            }
            const [, ext, base64Data] = matches;
            const buffer = Buffer.from(base64Data, 'base64');
            const publicId = entityId ? `${tenantId}/${entityId}` : undefined;

            const result = await storeImage(buffer, folder, publicId, `image/${ext}`);
            return res.json({
                success: true,
                data: { url: result.url, publicId: result.publicId, storage: result.storage },
            });
        } catch (err: any) {
            return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
        }
    }
);

export default router;
