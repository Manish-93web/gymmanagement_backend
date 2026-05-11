import path from 'path';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/config';

const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

function ensureDir(dir: string) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

ensureDir(LOCAL_UPLOAD_DIR);

export function isCloudinaryConfigured(): boolean {
    return !!(config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret);
}

export async function storeImage(
    buffer: Buffer,
    folder: string,
    publicId?: string,
    mimeType?: string
): Promise<{ url: string; publicId: string; storage: 'cloudinary' | 'local' }> {
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

    const ext = mimeType?.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
    const filename = publicId
        ? `${publicId.replace(/\//g, '_')}.${ext}`
        : `upload_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const subDir = path.join(LOCAL_UPLOAD_DIR, folder);
    ensureDir(subDir);
    fs.writeFileSync(path.join(subDir, filename), buffer);
    return { url: `/uploads/${folder}/${filename}`, publicId: filename, storage: 'local' };
}

/**
 * Upload a base64 data URL (e.g. from webcam capture).
 * Returns the stored URL (Cloudinary or local path).
 */
export async function storeBase64(
    dataUrl: string,
    folder: string,
    entityId?: string,
    tenantId?: string
): Promise<string> {
    const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) throw new Error('Malformed base64 image data URL');
    const [, ext, base64Data] = matches;
    const buffer = Buffer.from(base64Data, 'base64');
    const publicId = entityId && tenantId ? `${tenantId}/${entityId}` : undefined;
    const result = await storeImage(buffer, folder, publicId, `image/${ext}`);
    return result.url;
}
