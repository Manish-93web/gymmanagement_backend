import { Router, Request, Response } from 'express';
import SecurityController from '../controllers/security.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole, requireAnyRole } from '../middleware/rbac.middleware';
import { adminIPRestriction } from '../middleware/ip-restriction.middleware';
import DeviceRecord from '../models/DeviceRecord.model';
import SecurityEvent from '../models/SecurityEvent.model';
import behavioralAnalytics from '../services/behavioral-analytics.service';
import Member from '../models/Member.model';

const router = Router();

// Google OAuth routes
router.get('/google/url', SecurityController.getGoogleAuthUrl);
router.post('/google/callback', SecurityController.googleCallback);
router.post('/google/link', authenticate, SecurityController.linkGoogleAccount);
router.delete('/google/unlink', authenticate, SecurityController.unlinkGoogleAccount);

// Custom domain routes (Gym Owner only)
router.post(
    '/domain',
    authenticate,
    requireRole('gym_owner', 'super_admin'),
    SecurityController.addCustomDomain
);

router.post(
    '/domain/verify',
    authenticate,
    requireRole('gym_owner', 'super_admin'),
    SecurityController.verifyCustomDomain
);

router.delete(
    '/domain',
    authenticate,
    requireRole('gym_owner', 'super_admin'),
    SecurityController.removeCustomDomain
);

router.get(
    '/domain/status',
    authenticate,
    requireRole('gym_owner', 'super_admin'),
    SecurityController.getDomainStatus
);

// Audit log routes (Admin only with IP restriction)
router.get(
    '/audit/logs',
    authenticate,
    adminIPRestriction,
    requireRole('super_admin', 'gym_owner', 'auditor'),
    SecurityController.getAuditLogs
);

router.get(
    '/audit/statistics',
    authenticate,
    adminIPRestriction,
    requireRole('super_admin', 'gym_owner'),
    SecurityController.getAuditStatistics
);

router.get(
    '/audit/export',
    authenticate,
    adminIPRestriction,
    requireRole('super_admin', 'gym_owner', 'auditor'),
    SecurityController.exportAuditLogs
);

// ─────────────────────────────────────────────────────────────────────────────
// SESSION INTEGRITY & ANTI-SHARING ROUTES (GAP 31)
// ─────────────────────────────────────────────────────────────────────────────

// POST /security/register-device — called at every app login
router.post('/register-device', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const tenantId = (req as any).tenantId as string;
        const userId = (req as any).user._id.toString();
        const { deviceId, deviceName, platform, appVersion } = req.body;

        if (!deviceId || !platform) {
            res.status(400).json({ success: false, message: 'deviceId and platform are required' });
            return;
        }

        // Find memberId for this user
        const member = await Member.findOne({ tenantId, userId });
        const memberId = member?._id?.toString() ?? userId;

        const result = await behavioralAnalytics.registerDevice({
            tenantId,
            memberId,
            userId,
            deviceId,
            deviceName,
            platform,
            appVersion,
            ipAddress: req.ip,
        });

        let concurrentLoginDetected = false;
        if (memberId) {
            const concurrent = await behavioralAnalytics.checkConcurrentLogin(tenantId, memberId, deviceId);
            concurrentLoginDetected = concurrent.detected;
        }

        res.json({
            success: true,
            data: {
                isNewDevice: result.isNewDevice,
                requiresVerification: result.requiresVerification,
                concurrentLoginDetected,
                deviceRecord: result.deviceRecord,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /security/verify-device — mark device as trusted after OTP verification
router.post('/verify-device', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const tenantId = (req as any).tenantId as string;
        const userId = (req as any).user._id.toString();
        const { deviceId } = req.body;

        if (!deviceId) {
            res.status(400).json({ success: false, message: 'deviceId is required' });
            return;
        }

        const device = await DeviceRecord.findOne({ tenantId, userId, deviceId });
        if (!device) {
            res.status(404).json({ success: false, message: 'Device not found' });
            return;
        }

        device.isTrusted = true;
        device.trustVerifiedAt = new Date();
        await device.save();

        res.json({ success: true, data: device });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /security/my-devices — list own devices
router.get('/my-devices', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const tenantId = (req as any).tenantId as string;
        const userId = (req as any).user._id.toString();

        const devices = await DeviceRecord.find({ tenantId, userId }).sort({ lastSeenAt: -1 });
        res.json({ success: true, data: devices });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// DELETE /security/my-devices/:deviceId — remove own device (force logout)
router.delete('/my-devices/:deviceId', authenticate, async (req: Request, res: Response): Promise<void> => {
    try {
        const tenantId = (req as any).tenantId as string;
        const userId = (req as any).user._id.toString();
        const { deviceId } = req.params;

        const result = await DeviceRecord.deleteOne({ tenantId, userId, deviceId });
        if (result.deletedCount === 0) {
            res.status(404).json({ success: false, message: 'Device not found' });
            return;
        }

        res.json({ success: true, message: 'Device removed' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /security/events — list security events (admin)
router.get(
    '/events',
    authenticate,
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId as string;
            const { severity, eventType, isResolved, memberId, from, to, page = '1', limit = '20' } = req.query;

            const filter: any = { tenantId };
            if (severity) filter.severity = severity;
            if (eventType) filter.eventType = eventType;
            if (isResolved !== undefined) filter.isResolved = isResolved === 'true';
            if (memberId) filter.memberId = memberId;
            if (from || to) {
                filter.createdAt = {};
                if (from) filter.createdAt.$gte = new Date(from as string);
                if (to) filter.createdAt.$lte = new Date(to as string);
            }

            const pageNum = parseInt(page as string, 10);
            const limitNum = parseInt(limit as string, 10);
            const skip = (pageNum - 1) * limitNum;

            const [events, total] = await Promise.all([
                SecurityEvent.find(filter)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limitNum)
                    .populate('memberId', 'firstName lastName email')
                    .populate('resolvedBy', 'firstName lastName'),
                SecurityEvent.countDocuments(filter),
            ]);

            res.json({
                success: true,
                data: events,
                pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
            });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// PUT /security/events/:id/resolve — mark event resolved
router.put(
    '/events/:id/resolve',
    authenticate,
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId as string;
            const userId = (req as any).user._id.toString();
            const { resolutionNote } = req.body;

            const event = await SecurityEvent.findOne({ _id: req.params.id, tenantId });
            if (!event) {
                res.status(404).json({ success: false, message: 'Event not found' });
                return;
            }

            event.isResolved = true;
            event.resolvedAt = new Date();
            event.resolvedBy = userId;
            event.resolutionNote = resolutionNote;
            await event.save();

            res.json({ success: true, data: event });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// POST /security/block-device — block a device
router.post(
    '/block-device',
    authenticate,
    requireAnyRole('gym_owner', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId as string;
            const { deviceId, memberId, reason } = req.body;

            if (!deviceId || !memberId) {
                res.status(400).json({ success: false, message: 'deviceId and memberId are required' });
                return;
            }

            const device = await DeviceRecord.findOne({ tenantId, memberId, deviceId });
            if (!device) {
                res.status(404).json({ success: false, message: 'Device not found' });
                return;
            }

            device.isBlocked = true;
            device.blockedAt = new Date();
            device.blockedReason = reason;
            await device.save();

            // Log security event
            await SecurityEvent.create({
                tenantId,
                memberId,
                eventType: 'device_blocked',
                severity: 'high',
                riskScore: 80,
                details: { deviceId, reason },
                deviceId,
                isResolved: true,
                resolvedAt: new Date(),
                autoAction: 'device_blocked',
            });

            res.json({ success: true, data: device });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// GET /security/risk-scores — list members with riskScore > 0, sorted desc
router.get(
    '/risk-scores',
    authenticate,
    requireAnyRole('gym_owner', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId as string;
            const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

            // Aggregate unresolved events by member in the last 7 days
            const riskAgg = await SecurityEvent.aggregate([
                { $match: { tenantId, createdAt: { $gte: last7Days }, isResolved: false } },
                {
                    $group: {
                        _id: '$memberId',
                        totalRiskScore: { $sum: { $multiply: ['$riskScore', 0.5] } },
                        eventCount: { $sum: 1 },
                        maxSeverity: { $max: '$severity' },
                    },
                },
                { $match: { totalRiskScore: { $gt: 0 } } },
                { $sort: { totalRiskScore: -1 } },
                { $limit: 20 },
            ]);

            // Enrich with member info
            const memberIds = riskAgg.map((r) => r._id).filter(Boolean);
            const members = await Member.find({ _id: { $in: memberIds } }).select('firstName lastName email');
            const memberMap: Record<string, any> = {};
            members.forEach((m: any) => { memberMap[m._id.toString()] = m; });

            const result = riskAgg.map((r) => ({
                memberId: r._id,
                member: memberMap[r._id?.toString()] ?? null,
                riskScore: Math.min(100, Math.round(r.totalRiskScore)),
                eventCount: r.eventCount,
                maxSeverity: r.maxSeverity,
            }));

            res.json({ success: true, data: result });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// GET /security/stats — dashboard stats
router.get(
    '/stats',
    authenticate,
    requireAnyRole('gym_owner', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId as string;
            const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const thisMonthStart = new Date();
            thisMonthStart.setDate(1);
            thisMonthStart.setHours(0, 0, 0, 0);

            const [
                totalEvents,
                highSeverityEvents,
                resolvedEvents,
                newDevicesThisMonth,
                blockedDevices,
                avgRiskAgg,
            ] = await Promise.all([
                SecurityEvent.countDocuments({ tenantId, createdAt: { $gte: last7Days } }),
                SecurityEvent.countDocuments({ tenantId, severity: { $in: ['high', 'critical'] }, createdAt: { $gte: last7Days } }),
                SecurityEvent.countDocuments({ tenantId, isResolved: true, createdAt: { $gte: last7Days } }),
                DeviceRecord.countDocuments({ tenantId, firstSeenAt: { $gte: thisMonthStart } }),
                DeviceRecord.countDocuments({ tenantId, isBlocked: true }),
                SecurityEvent.aggregate([
                    { $match: { tenantId, createdAt: { $gte: last7Days }, isResolved: false } },
                    { $group: { _id: null, avg: { $avg: '$riskScore' } } },
                ]),
            ]);

            res.json({
                success: true,
                data: {
                    totalEvents,
                    highSeverityEvents,
                    resolvedEvents,
                    newDevicesThisMonth,
                    blockedDevices,
                    avgRiskScore: Math.round(avgRiskAgg[0]?.avg ?? 0),
                },
            });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

export default router;
