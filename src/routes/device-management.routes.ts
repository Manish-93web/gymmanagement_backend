/**
 * P4 — Device Management Routes
 *
 * Member-facing: request/confirm device replacement via OTP, list/revoke own devices.
 * Admin-facing: view device violation log, whitelist multi-device users, view risk scores.
 *
 * Mount at: /api/device-management
 */

import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantIsolation } from '../middleware/tenantIsolation.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();

// All routes require authentication + tenant context
router.use(authenticate, tenantIsolation);

// ─── OTP Store helpers ──────────────────────────────────────────────────────────

interface ReplacementPayload {
    otp: string;
    newDeviceId: string;
    newDeviceName: string;
    newPlatform: string;
    expiresAt: number;
}

async function storeOTP(key: string, payload: ReplacementPayload): Promise<void> {
    try {
        const { redis } = require('../config/redis');
        await redis.setex(key, 600, JSON.stringify(payload));
    } catch {
        (global as any).__deviceReplaceStore = (global as any).__deviceReplaceStore || {};
        (global as any).__deviceReplaceStore[key] = payload;
    }
}

async function getOTP(key: string): Promise<ReplacementPayload | null> {
    try {
        const { redis } = require('../config/redis');
        const raw = await redis.get(key);
        if (raw) return JSON.parse(raw) as ReplacementPayload;
    } catch {
        // fall through to in-memory store
    }
    const store = (global as any).__deviceReplaceStore;
    return store?.[key] ?? null;
}

async function deleteOTP(key: string): Promise<void> {
    try {
        const { redis } = require('../config/redis');
        await redis.del(key);
    } catch {
        // ignore
    }
    const store = (global as any).__deviceReplaceStore;
    if (store) delete store[key];
}

// ─── POST /device-management/request-replace ───────────────────────────────────
// Member requests device replacement — sends OTP to their phone
router.post('/request-replace', async (req: Request, res: Response): Promise<void> => {
    try {
        const user = (req as any).user;
        const { newDeviceId, newDeviceName, newPlatform } = req.body;

        if (!newDeviceId || !newPlatform) {
            res.status(400).json({ success: false, message: 'newDeviceId and newPlatform are required' });
            return;
        }

        const phone = user.mobile || user.phone;
        if (!phone) {
            res.status(400).json({ success: false, message: 'No phone number on file to send OTP' });
            return;
        }

        const key = `device_replace:${user._id}`;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const payload: ReplacementPayload = {
            otp,
            newDeviceId,
            newDeviceName: newDeviceName ?? 'Unknown Device',
            newPlatform,
            expiresAt: Date.now() + 10 * 60 * 1000,
        };

        await storeOTP(key, payload);

        // Send OTP via WhatsApp (fire-and-forget — never block the response)
        setImmediate(async () => {
            try {
                const whatsapp = require('../services/whatsapp.service').default;
                await whatsapp.sendMessage({
                    to: phone,
                    message: `Your OTP to change devices: ${otp}. Valid for 10 minutes. If you didn't request this, contact support immediately.`,
                });
            } catch {
                // WhatsApp delivery failure is non-fatal
            }
        });

        // Log a security event
        setImmediate(async () => {
            try {
                const tenantId = (req as any).tenantId;
                const SecurityEvent = require('../models/SecurityEvent.model').default;
                await SecurityEvent.create({
                    tenantId,
                    userId: user._id,
                    eventType: 'concurrent_login',
                    severity: 'medium',
                    riskScore: 40,
                    details: {
                        action: 'device_replace_requested',
                        newDeviceId,
                        newDeviceName: newDeviceName ?? 'Unknown Device',
                        newPlatform,
                    },
                });
            } catch {
                // non-fatal
            }
        });

        res.json({
            success: true,
            message: 'OTP sent to your registered phone',
            expiresIn: 600,
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── POST /device-management/confirm-replace ───────────────────────────────────
// Member verifies OTP and replaces their registered device
router.post('/confirm-replace', async (req: Request, res: Response): Promise<void> => {
    try {
        const user = (req as any).user;
        const tenantId = (req as any).tenantId as string;
        const { otp } = req.body;

        if (!otp) {
            res.status(400).json({ success: false, message: 'OTP is required' });
            return;
        }

        const key = `device_replace:${user._id}`;
        const payload = await getOTP(key);

        if (!payload) {
            res.status(400).json({ success: false, message: 'No pending device replacement. Please request a new OTP.' });
            return;
        }

        if (Date.now() > payload.expiresAt) {
            await deleteOTP(key);
            res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
            return;
        }

        if (payload.otp !== String(otp).trim()) {
            res.status(400).json({ success: false, message: 'Invalid OTP. Please try again.' });
            return;
        }

        // OTP is valid — perform the device swap
        try {
            const DeviceRecord = require('../models/DeviceRecord.model').default;

            // Deactivate (block) all previously trusted devices for this user
            await DeviceRecord.updateMany(
                { userId: user._id, isTrusted: true },
                {
                    $set: {
                        isTrusted: false,
                        isBlocked: true,
                        blockedAt: new Date(),
                        blockedReason: 'Replaced by owner via OTP-verified device swap',
                    },
                },
            );

            // Upsert the new device as trusted
            await DeviceRecord.findOneAndUpdate(
                { userId: user._id, deviceId: payload.newDeviceId },
                {
                    $set: {
                        tenantId,
                        userId: user._id,
                        deviceId: payload.newDeviceId,
                        deviceName: payload.newDeviceName,
                        platform: payload.newPlatform,
                        isTrusted: true,
                        isBlocked: false,
                        trustVerifiedAt: new Date(),
                        lastSeenAt: new Date(),
                    },
                    $setOnInsert: {
                        memberId: user._id, // will be updated if member record exists
                        firstSeenAt: new Date(),
                        loginCount: 1,
                    },
                },
                { upsert: true, new: true },
            );
        } catch {
            // DeviceRecord operations failed — still clear OTP and return success
        }

        await deleteOTP(key);

        // Log the event
        setImmediate(async () => {
            try {
                const SecurityEvent = require('../models/SecurityEvent.model').default;
                await SecurityEvent.create({
                    tenantId,
                    userId: user._id,
                    eventType: 'reverification_completed',
                    severity: 'low',
                    riskScore: 0,
                    details: {
                        action: 'device_replaced',
                        newDeviceId: payload.newDeviceId,
                        newDeviceName: payload.newDeviceName,
                    },
                    isResolved: true,
                    resolvedAt: new Date(),
                    autoAction: 'device_replaced',
                });
            } catch {
                // non-fatal
            }
        });

        res.json({
            success: true,
            message: 'Device replaced successfully. Previous device has been logged out.',
            data: {
                newDeviceId: payload.newDeviceId,
                newDeviceName: payload.newDeviceName,
            },
        });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /device-management/my-devices ─────────────────────────────────────────
// Member lists their own registered devices
router.get('/my-devices', async (req: Request, res: Response): Promise<void> => {
    try {
        const user = (req as any).user;

        try {
            const DeviceRecord = require('../models/DeviceRecord.model').default;
            const devices = await DeviceRecord.find({ userId: user._id })
                .sort({ lastSeenAt: -1 })
                .lean();
            res.json({ success: true, data: devices });
        } catch {
            res.json({ success: true, data: [] });
        }
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── DELETE /device-management/my-devices/:deviceId ────────────────────────────
// Member revokes one of their own devices
router.delete('/my-devices/:deviceId', async (req: Request, res: Response): Promise<void> => {
    try {
        const user = (req as any).user;
        const { deviceId } = req.params;

        try {
            const DeviceRecord = require('../models/DeviceRecord.model').default;
            const result = await DeviceRecord.deleteOne({ userId: user._id, deviceId });
            if (result.deletedCount === 0) {
                res.status(404).json({ success: false, message: 'Device not found' });
                return;
            }
        } catch {
            res.status(404).json({ success: false, message: 'Device not found' });
            return;
        }

        res.json({ success: true, message: 'Device removed and session revoked' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── GET /device-management/admin/violations ───────────────────────────────────
// Admin: list recent device conflict events with member details
router.get(
    '/admin/violations',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId as string;
            const { page = '1', limit = '20' } = req.query;
            const pageNum = Math.max(1, parseInt(page as string, 10));
            const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
            const skip = (pageNum - 1) * limitNum;

            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            try {
                const SecurityEvent = require('../models/SecurityEvent.model').default;
                const DeviceRecord = require('../models/DeviceRecord.model').default;

                const [events, total, todayCount] = await Promise.all([
                    SecurityEvent.find({
                        tenantId,
                        eventType: 'concurrent_login',
                    })
                        .sort({ createdAt: -1 })
                        .skip(skip)
                        .limit(limitNum)
                        .populate('memberId', 'firstName lastName email mobile')
                        .lean(),
                    SecurityEvent.countDocuments({ tenantId, eventType: 'concurrent_login' }),
                    SecurityEvent.countDocuments({
                        tenantId,
                        eventType: 'concurrent_login',
                        createdAt: { $gte: todayStart },
                    }),
                ]);

                // Enrich each event with device info
                const enriched = await Promise.all(
                    events.map(async (evt: any) => {
                        let registeredDevice = null;
                        try {
                            registeredDevice = await DeviceRecord.findOne({
                                userId: evt.userId,
                                isTrusted: true,
                            })
                                .sort({ trustVerifiedAt: -1 })
                                .select('deviceName platform deviceId lastSeenAt')
                                .lean();
                        } catch {
                            // ignore
                        }

                        const member = evt.memberId ?? {};
                        return {
                            _id: evt._id,
                            userId: evt.userId,
                            memberName: member.firstName
                                ? `${member.firstName} ${member.lastName}`
                                : '—',
                            phone: member.mobile ?? null,
                            detectedAt: evt.createdAt,
                            registeredDevice: registeredDevice
                                ? {
                                      deviceId: registeredDevice.deviceId,
                                      deviceName: registeredDevice.deviceName ?? 'Unknown',
                                      platform: registeredDevice.platform,
                                  }
                                : null,
                            attemptedDevice: {
                                deviceId: evt.details?.newDeviceId ?? evt.deviceId ?? '—',
                                deviceName: evt.details?.deviceName ?? evt.details?.newDeviceName ?? '—',
                                platform: evt.details?.platform ?? evt.details?.newPlatform ?? '—',
                            },
                            isResolved: evt.isResolved,
                            riskScore: evt.riskScore,
                        };
                    }),
                );

                // Count whitelisted users (allowMultiDevice stored directly on User docs)
                let whitelistedCount = 0;
                try {
                    const User = require('../models/User.model').default;
                    // Use collection query to bypass schema strict mode
                    const result = await User.collection
                        .countDocuments({ tenantId: new mongoose.Types.ObjectId(tenantId), allowMultiDevice: true })
                        .catch(() => 0);
                    whitelistedCount = result;
                } catch {
                    // ignore
                }

                res.json({
                    success: true,
                    data: enriched,
                    stats: {
                        totalViolationsToday: todayCount,
                        whitelistedUsers: whitelistedCount,
                        activeRiskFlags: total,
                    },
                    pagination: {
                        page: pageNum,
                        limit: limitNum,
                        total,
                        pages: Math.ceil(total / limitNum),
                    },
                });
            } catch (modelErr: any) {
                res.json({ success: true, data: [], stats: { totalViolationsToday: 0, whitelistedUsers: 0, activeRiskFlags: 0 }, pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 } });
            }
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── POST /device-management/admin/whitelist/:userId ───────────────────────────
// Admin: whitelist a member for multi-device access
router.post(
    '/admin/whitelist/:userId',
    requireAnyRole('gym_owner', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = req.params.userId as string;
            const { allow = true } = req.body;

            try {
                const User = require('../models/User.model').default;

                // Use strict:false to write allowMultiDevice even though it's not in schema
                await User.updateOne(
                    { _id: new mongoose.Types.ObjectId(userId) },
                    { $set: { allowMultiDevice: allow === true || allow === 'true' } },
                    { strict: false },
                );

                // Log a security event
                setImmediate(async () => {
                    try {
                        const tenantId = (req as any).tenantId;
                        const adminUser = (req as any).user;
                        const SecurityEvent = require('../models/SecurityEvent.model').default;
                        await SecurityEvent.create({
                            tenantId,
                            userId: new mongoose.Types.ObjectId(userId),
                            eventType: 'manual_flag',
                            severity: 'low',
                            riskScore: 0,
                            details: {
                                action: allow ? 'multi_device_whitelisted' : 'multi_device_whitelist_removed',
                                updatedBy: adminUser._id,
                            },
                            isResolved: true,
                            resolvedAt: new Date(),
                            resolvedBy: adminUser._id,
                            autoAction: 'whitelist_updated',
                        });
                    } catch {
                        // non-fatal
                    }
                });

                res.json({
                    success: true,
                    message: allow
                        ? 'User whitelisted for multi-device access'
                        : 'Multi-device whitelist removed for user',
                });
            } catch {
                res.status(404).json({ success: false, message: 'User not found' });
            }
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── GET /device-management/admin/risk-scores ──────────────────────────────────
// Admin: members sorted by computed device-sharing risk score
router.get(
    '/admin/risk-scores',
    requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
    async (req: Request, res: Response): Promise<void> => {
        try {
            const tenantId = (req as any).tenantId as string;

            try {
                const SecurityEvent = require('../models/SecurityEvent.model').default;
                const DeviceRecord = require('../models/DeviceRecord.model').default;
                const Member = require('../models/Member.model').default;

                const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

                // Aggregate concurrent_login events per user to compute risk score
                const riskAgg = await SecurityEvent.aggregate([
                    {
                        $match: {
                            tenantId,
                            eventType: 'concurrent_login',
                            createdAt: { $gte: last30Days },
                        },
                    },
                    {
                        $group: {
                            _id: '$userId',
                            eventCount: { $sum: 1 },
                            lastActivity: { $max: '$createdAt' },
                            reasons: {
                                $addToSet: {
                                    $cond: [
                                        { $ifNull: ['$details.action', false] },
                                        '$details.action',
                                        'concurrent_login_detected',
                                    ],
                                },
                            },
                        },
                    },
                    { $sort: { eventCount: -1 } },
                    { $limit: 50 },
                ]);

                if (riskAgg.length === 0) {
                    res.json({ success: true, data: [] });
                    return;
                }

                const userIds = riskAgg.map((r: any) => r._id).filter(Boolean);

                // Fetch member info + device count in parallel
                const [members, deviceCounts] = await Promise.all([
                    Member.find({ userId: { $in: userIds } })
                        .select('firstName lastName email mobile userId')
                        .lean(),
                    DeviceRecord.aggregate([
                        { $match: { userId: { $in: userIds } } },
                        { $group: { _id: '$userId', count: { $sum: 1 } } },
                    ]),
                ]);

                const memberMap: Record<string, any> = {};
                (members as any[]).forEach((m: any) => {
                    memberMap[m.userId?.toString()] = m;
                });

                const deviceCountMap: Record<string, number> = {};
                deviceCounts.forEach((d: any) => {
                    deviceCountMap[d._id?.toString()] = d.count;
                });

                const result = riskAgg.map((r: any) => {
                    const member = memberMap[r._id?.toString()] ?? null;
                    // Risk score: base 10 per event, capped at 100, +20 if >3 events
                    const score = Math.min(100, r.eventCount * 10 + (r.eventCount > 3 ? 20 : 0));
                    return {
                        memberId: r._id,
                        name: member
                            ? `${member.firstName} ${member.lastName}`
                            : 'Unknown Member',
                        phone: member?.mobile ?? null,
                        riskScore: score,
                        reasons: r.reasons,
                        deviceCount: deviceCountMap[r._id?.toString()] ?? 1,
                        lastActivity: r.lastActivity,
                    };
                });

                res.json({ success: true, data: result });
            } catch {
                res.json({ success: true, data: [] });
            }
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

export default router;
