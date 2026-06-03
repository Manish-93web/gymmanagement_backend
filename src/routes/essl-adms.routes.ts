import express, { Router, Request, Response } from 'express';
import esslAdmsController from '../controllers/essl-adms.controller';
import BiometricRawLog from '../models/BiometricRawLog.model';
import BiometricDevice from '../models/BiometricDevice.model';

const router = Router();

// Scoped text parser — only applied per-route so it does NOT corrupt JSON bodies
// for other API routes that share the '/' mount prefix.
const esslText = express.text({ type: '*/*', limit: '1mb' });

// Some eSSL firmware appends .aspx; register both forms
router.get('/iclock/cdata',      esslText, esslAdmsController.heartbeat.bind(esslAdmsController));
router.get('/iclock/cdata.aspx', esslText, esslAdmsController.heartbeat.bind(esslAdmsController));
router.post('/iclock/cdata',      esslText, esslAdmsController.receiveData.bind(esslAdmsController));
router.post('/iclock/cdata.aspx', esslText, esslAdmsController.receiveData.bind(esslAdmsController));
router.get('/iclock/getrequest',      esslText, esslAdmsController.getRequest.bind(esslAdmsController));
router.get('/iclock/getrequest.aspx', esslText, esslAdmsController.getRequest.bind(esslAdmsController));
router.post('/iclock/devicecmd',      esslText, esslAdmsController.deviceCmd.bind(esslAdmsController));
router.post('/iclock/devicecmd.aspx', esslText, esslAdmsController.deviceCmd.bind(esslAdmsController));

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

// Reset cursor for any device by ID
router.post('/debug/reset-device-cursor', express.json(), async (req: Request, res: Response) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
        const mongoose = (await import('mongoose')).default;
        const result = await BiometricDevice.findByIdAndUpdate(
            new mongoose.Types.ObjectId(deviceId),
            { $unset: { lastSyncCursor: '', lastSync: '', lastSyncAt: '' }, $set: { totalRecordsFetched: 0, consecutiveFailures: 0, status: 'inactive' } },
            { new: true }
        );
        return res.json({ ok: true, device: result?.deviceName, message: 'Cursor reset — device will resend all records on next heartbeat' });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

// Fix: find ALL devices with the real SN across ALL tenants and clear duplicates
// Keeps only the device belonging to the specified tenantId
router.post('/debug/fix-device-sn', express.json(), async (req: Request, res: Response) => {
    try {
        const { tenantId, serialNumber } = req.body;
        if (!tenantId || !serialNumber) {
            return res.status(400).json({ error: 'tenantId and serialNumber required' });
        }

        const mongoose = (await import('mongoose')).default;
        const tid = new mongoose.Types.ObjectId(tenantId);

        // Find ALL devices with this SN across all tenants
        const allDevices = await BiometricDevice.find({ serialNumber }).lean();

        const results: any[] = [];
        for (const device of allDevices) {
            const isSameTenant = device.tenantId.toString() === tenantId;
            if (!isSameTenant) {
                // Clear SN from devices belonging to other tenants
                await BiometricDevice.findByIdAndUpdate(device._id, { $unset: { serialNumber: '' } });
                results.push({ id: device._id, tenant: device.tenantId, action: 'cleared SN' });
            } else {
                results.push({ id: device._id, tenant: device.tenantId, action: 'kept (correct tenant)' });
            }
        }

        // Also ensure the current tenant has at least one device with this SN
        const tenantDevice = await BiometricDevice.findOne({ tenantId: tid, isDeleted: { $ne: true } }).lean();
        if (tenantDevice && !allDevices.find(d => d.tenantId.toString() === tenantId)) {
            await BiometricDevice.findByIdAndUpdate(tenantDevice._id, { serialNumber });
            results.push({ id: tenantDevice._id, tenant: tenantId, action: 'assigned SN to first tenant device' });
        }

        return res.json({ success: true, serialNumber, results });
    } catch (err: any) {
        return res.status(500).json({ error: err.message });
    }
});

export default router;
