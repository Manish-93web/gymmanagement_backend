import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function uploadToCloudinary(buffer: Buffer, folder: string, publicId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const opts: any = { folder, resource_type: 'image' };
        if (publicId) opts.public_id = publicId;
        const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
            if (err) return reject(err);
            resolve(result);
        });
        stream.end(buffer);
    });
}

router.use(authenticate, tenantContext);

// POST /api/upload/branding — upload logo/favicon for a gym
router.post(
    '/branding',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    upload.single('file'),
    async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }
            const tenantId = (req as any).tenantId;
            const { type = 'logo' } = req.body; // type: 'logo' | 'favicon'
            const publicId = `gymos/branding/${tenantId}/${type}`;

            const result = await uploadToCloudinary(req.file.buffer, 'gymos/branding', publicId);
            res.json({
                success: true,
                data: {
                    url: result.secure_url,
                    publicId: result.public_id,
                    type,
                },
            });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message || 'Upload failed' });
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
            const tenantId = (req as any).tenantId;
            const { entityId } = req.body;
            const publicId = entityId ? `gymos/avatars/${tenantId}/${entityId}` : undefined;

            const result = await uploadToCloudinary(req.file.buffer, 'gymos/avatars', publicId);
            res.json({
                success: true,
                data: { url: result.secure_url, publicId: result.public_id },
            });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message || 'Upload failed' });
        }
    }
);

export default router;
