import express, { Router, Request, Response } from 'express';
import esslAdmsController from '../controllers/essl-adms.controller';
import BiometricRawLog from '../models/BiometricRawLog.model';
import BiometricDevice from '../models/BiometricDevice.model';

const router = Router();

// Scoped text parser — only applied per-route so it does NOT corrupt JSON bodies
// for other API routes that share the '/' mount prefix.
const esslText = express.text({ type: '*/*', limit: '1mb' });

router.get('/iclock/cdata', esslText, esslAdmsController.heartbeat.bind(esslAdmsController));
router.post('/iclock/cdata', esslText, esslAdmsController.receiveData.bind(esslAdmsController));
router.get('/iclock/getrequest', esslText, esslAdmsController.getRequest.bind(esslAdmsController));
router.post('/iclock/devicecmd', esslText, esslAdmsController.deviceCmd.bind(esslAdmsController));

// Dev-only debug endpoint — no auth, returns recent raw logs + device state
router.get('/debug/biometric', async (req: Request, res: Response) => {
    try {
        const logs = await BiometricRawLog.find({}).sort({ createdAt: -1 }).limit(10).lean();
        const devices = await BiometricDevice.find({ isDeleted: false })
            .select('deviceName deviceBrand serialNumber ipAddress status lastSeenAt tenantId branchId').lean();
        res.json({ logs, devices });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Dev-only: reset sync cursor on the new-tenant device so device re-sends all today's punches
router.post('/debug/reset-cursor', async (req: Request, res: Response) => {
    try {
        const mongoose = (await import('mongoose')).default;
        const BiometricRawLog = (await import('../models/BiometricRawLog.model')).default;
        const newDeviceId = new mongoose.Types.ObjectId('6a1700a0ffba902c7c28fd39');
        await BiometricDevice.findByIdAndUpdate(newDeviceId, {
            $unset: { lastSyncCursor: '', lastSync: '', lastSyncAt: '' },
            $set: { totalRecordsFetched: 0, consecutiveFailures: 0 },
        });
        await BiometricRawLog.deleteMany({ deviceId: newDeviceId });
        res.json({ ok: true, message: 'Cursor reset. Device will resend all records on next heartbeat.' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Dev-only: fix SN on the active (new-tenant) device to match the physical device
router.post('/debug/fix-sn', async (req: Request, res: Response) => {
    try {
        const mongoose = (await import('mongoose')).default;
        const newDeviceId = new mongoose.Types.ObjectId('6a1700a0ffba902c7c28fd39');
        const oldDeviceId = new mongoose.Types.ObjectId('6a0f59f619986fb54388b4dc');
        const REAL_SN = 'CNU6222662534';

        // Clear SN on the old device so it no longer intercepts heartbeats
        const oldUpdate = await BiometricDevice.findByIdAndUpdate(
            oldDeviceId, { $unset: { serialNumber: '' } }, { new: true }
        );
        // Set the real SN on the current (new-tenant) device
        const newUpdate = await BiometricDevice.findByIdAndUpdate(
            newDeviceId, { serialNumber: REAL_SN }, { new: true }
        );
        res.json({
            oldDevice: { id: oldDeviceId, serialNumber: (oldUpdate as any)?.serialNumber ?? 'cleared' },
            newDevice: { id: newDeviceId, serialNumber: (newUpdate as any)?.serialNumber },
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
