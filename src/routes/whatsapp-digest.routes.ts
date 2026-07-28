import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import DigestSettings from '../models/DigestSettings.model';
import { generateAndSendDigest, sendDigestNow } from '../services/daily-whatsapp-digest.service';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// GET /settings
router.get('/settings', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const settings = await DigestSettings.findOne({ tenantId }) || { enabled: false, phoneNumber: '', timezone: 'Asia/Kolkata', sendTime: '08:00' };
    res.json({ data: settings });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// POST /settings
router.post('/settings', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const { enabled, phoneNumber, timezone, sendTime } = req.body;
    const settings = await DigestSettings.findOneAndUpdate(
      { tenantId },
      { $set: { enabled, phoneNumber, timezone: timezone || 'Asia/Kolkata', sendTime: sendTime || '08:00' } },
      { upsert: true, new: true }
    );
    res.json({ data: settings, message: 'Digest settings saved' });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

// POST /test
router.post('/test', async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const result = await sendDigestNow(tenantId);
    const preview = await generateAndSendDigest(tenantId);
    res.json({ success: result.success, message: result.message, preview });
  } catch (e: any) {
    res.status(500).json({ message: e.message });
  }
});

export default router;
