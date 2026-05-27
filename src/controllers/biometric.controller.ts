import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricMember from '../models/BiometricMember.model';
import BiometricRawLog from '../models/BiometricRawLog.model';
import BiometricSyncJob from '../models/BiometricSyncJob.model';
import BiometricSettings from '../models/BiometricSettings.model';
import Attendance from '../models/Attendance.model';
import Member from '../models/Member.model';
import { AttendanceService } from '../services/attendance.service';
import BiometricAttendanceService from '../services/biometric-attendance.service';

const attendanceService = new AttendanceService();

class BiometricController {
    // ─── DEVICES ────────────────────────────────────────────────

    async getDevices(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const branchId = req.branchId;
            const filter: any = { tenantId, isActive: true };
            if (branchId) filter.branchId = branchId;

            const devices = await BiometricDevice.find(filter).sort({ createdAt: -1 });

            // Attach actual raw-log stats per device
            const deviceIds = devices.map(d => d._id);
            const [rawLogTotals, rawLogUnmatched] = await Promise.all([
                BiometricRawLog.aggregate([
                    { $match: { deviceId: { $in: deviceIds } } },
                    { $group: { _id: '$deviceId', total: { $sum: 1 }, processed: { $sum: { $cond: ['$processed', 1, 0] } } } },
                ]),
                BiometricRawLog.aggregate([
                    { $match: { deviceId: { $in: deviceIds }, skippedReason: { $ne: null } } },
                    { $group: { _id: '$deviceId', unmatched: { $sum: 1 } } },
                ]),
            ]);

            const logMap = new Map<string, any>();
            for (const r of rawLogTotals) logMap.set(r._id.toString(), { total: r.total, processed: r.processed });
            for (const r of rawLogUnmatched) {
                const key = r._id.toString();
                if (logMap.has(key)) logMap.get(key).unmatched = r.unmatched;
                else logMap.set(key, { total: 0, processed: 0, unmatched: r.unmatched });
            }

            const enriched = devices.map(d => {
                const obj = d.toObject() as any;
                const ls = logMap.get(d._id.toString()) || { total: 0, processed: 0, unmatched: 0 };
                obj.totalRecordsFetched = ls.total;
                obj.processedRecords    = ls.processed;
                obj.unmatchedRecords    = ls.unmatched ?? 0;
                // Ensure reference-compatible field names are present in response
                obj.deviceName  = obj.deviceName  || obj.name   || obj.deviceId;
                obj.deviceBrand = obj.deviceBrand || obj.vendor || 'generic';
                obj.deviceType  = obj.deviceType  || obj.type   || 'fingerprint';
                obj.syncMode    = obj.syncMode     || (obj.settings?.autoSync ? 'scheduled' : 'manual');
                obj.syncIntervalMinutes = obj.syncIntervalMinutes || obj.settings?.syncInterval || 5;
                obj.timezone    = obj.timezone     || obj.settings?.timezone || 'Asia/Kolkata';
                // Normalize status: 'online' → 'active' for reference compatibility
                if (obj.status === 'online') obj.status = 'active';
                return obj;
            });

            const stats = {
                total:   devices.length,
                online:  devices.filter(d => d.status === 'active' || d.status === 'online').length,
                offline: devices.filter(d => d.status === 'offline').length,
                error:   devices.filter(d => d.status === 'error').length,
            };
            res.json({ success: true, data: { devices: enriched, stats } });
        } catch (error) { next(error); }
    }

    async addDevice(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const branchId = req.branchId || req.body.branchId;
            if (!branchId) { res.status(400).json({ success: false, message: 'branchId required' }); return; }

            const body = req.body;
            // Normalize: accept both reference names (deviceName/deviceBrand/deviceType) and legacy (name/vendor/type)
            const deviceName  = body.deviceName  || body.name;
            const deviceBrand = body.deviceBrand || body.vendor  || 'generic';
            const deviceType  = body.deviceType  || body.type    || 'fingerprint';
            const timezone    = body.timezone    || body.settings?.timezone || 'Asia/Kolkata';
            const syncMode    = body.syncMode    || (body.settings?.autoSync === false ? 'manual' : 'scheduled');
            const syncIntervalMinutes = body.syncIntervalMinutes || body.settings?.syncInterval || 5;

            if (!deviceName) { res.status(400).json({ success: false, message: 'deviceName is required' }); return; }

            const device = await BiometricDevice.create({
                ...body,
                deviceId: body.deviceId || new mongoose.Types.ObjectId().toString(),
                tenantId,
                branchId,
                deviceName,
                deviceBrand,
                deviceType,
                timezone,
                syncMode,
                syncIntervalMinutes,
                // keep legacy fields in sync
                name:   deviceName,
                vendor: deviceBrand,
                type:   deviceType,
                settings: {
                    timezone,
                    autoSync:         syncMode !== 'manual',
                    syncInterval:     syncIntervalMinutes,
                    verificationMode: body.settings?.verificationMode || 'finger',
                    accessControl:    body.settings?.accessControl    || false,
                },
            });
            res.status(201).json({ success: true, data: device });
        } catch (error) { next(error); }
    }

    async getDevice(req: Request, res: Response, next: NextFunction) {
        try {
            const device = await BiometricDevice.findOne({ _id: req.params.id as string, tenantId: req.tenantId });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }
            res.json({ success: true, data: device });
        } catch (error) { next(error); }
    }

    async updateDevice(req: Request, res: Response, next: NextFunction) {
        try {
            const body = req.body;
            const updates: any = { ...body };
            // Normalize field names for backward compat
            if (body.deviceName)  { updates.name   = body.deviceName;  }
            if (body.deviceBrand) { updates.vendor  = body.deviceBrand; }
            if (body.deviceType)  { updates.type    = body.deviceType;  }
            if (body.timezone)    { if (!updates.settings) updates.settings = {}; updates['settings.timezone'] = body.timezone; }
            if (body.syncMode !== undefined) {
                updates.settings = updates.settings || {};
                updates['settings.autoSync'] = body.syncMode !== 'manual';
            }
            if (body.syncIntervalMinutes) { updates['settings.syncInterval'] = body.syncIntervalMinutes; }

            const device = await BiometricDevice.findOneAndUpdate(
                { _id: req.params.id as string, tenantId: req.tenantId },
                { $set: updates },
                { new: true }
            );
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }
            res.json({ success: true, data: device });
        } catch (error) { next(error); }
    }

    async deleteDevice(req: Request, res: Response, next: NextFunction) {
        try {
            await BiometricDevice.findOneAndUpdate(
                { _id: req.params.id as string, tenantId: req.tenantId },
                { isActive: false }
            );
            res.json({ success: true, message: 'Device removed' });
        } catch (error) { next(error); }
    }

    async testDevice(req: Request, res: Response, next: NextFunction) {
        try {
            const device = await BiometricDevice.findOne({ _id: req.params.id as string, tenantId: req.tenantId });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }

            const start = Date.now();
            let connected = false;
            let errorMsg: string | undefined;
            let lastHeartbeatMsg: string | undefined;

            // Primary check: ADMS push-mode devices dial OUT to this server — they never
            // listen on port 4370 for incoming connections. The most reliable online
            // indicator is a recent heartbeat (GET /iclock/cdata?SN=...).
            const lastPing = (device as any).lastPing ?? (device as any).lastSeenAt;
            if (lastPing) {
                const ageMs = Date.now() - new Date(lastPing).getTime();
                const ageMins = Math.floor(ageMs / 60_000);
                if (ageMs < 10 * 60_000) {
                    // Heartbeat within last 10 minutes — device is definitely online
                    connected = true;
                    lastHeartbeatMsg = ageMins < 1 ? 'Last heartbeat: just now' : `Last heartbeat: ${ageMins}m ago`;
                } else {
                    // Stale heartbeat — try HTTP on port 80 (ZKTeco web UI) as secondary check
                    errorMsg = `No heartbeat for ${ageMins} minutes`;
                }
            } else {
                errorMsg = 'Device has never sent a heartbeat — check cloud server settings on the device';
            }

            // Secondary check: if no recent heartbeat, try HTTP port 80 (device web UI)
            if (!connected && device.ipAddress) {
                try {
                    await new Promise<void>((resolve, reject) => {
                        const http = require('http');
                        const req2 = http.get(
                            { host: device.ipAddress, port: 80, path: '/', timeout: 4000 },
                            (r: any) => { connected = true; errorMsg = undefined; r.resume(); resolve(); }
                        );
                        req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
                        req2.on('error', (err: any) => {
                            if (['ECONNREFUSED', 'ECONNRESET', 'EPIPE'].includes(err.code || '')) {
                                connected = true; errorMsg = undefined; resolve();
                            } else {
                                reject(err);
                            }
                        });
                    });
                } catch { /* stays offline */ }
            }

            const latencyMs = Date.now() - start;
            await BiometricDevice.findByIdAndUpdate(device._id, {
                status: connected ? 'active' : 'offline',
                lastPing: connected ? new Date() : undefined,
            });

            res.json({
                success: true,
                data: {
                    success: connected,
                    latencyMs: connected ? latencyMs : undefined,
                    error: connected ? undefined : errorMsg,
                    message: connected ? (lastHeartbeatMsg || 'Device is online') : errorMsg,
                    status: connected ? 'active' : 'offline',
                },
            });
        } catch (error) { next(error); }
    }

    async syncDevice(req: Request, res: Response, next: NextFunction) {
        try {
            const device = await BiometricDevice.findOne({ _id: req.params.id as string, tenantId: req.tenantId });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }

            const result = await BiometricAttendanceService.processUnprocessedLogs(
                device.tenantId.toString(),
                device._id.toString()
            );

            await BiometricDevice.findByIdAndUpdate(device._id, {
                lastSyncAt: new Date(), status: 'active', consecutiveFailures: 0,
            });

            res.json({
                success: true,
                message: `Sync complete: ${result.created} records created`,
                data: { ...result, syncedAt: new Date() },
            });
        } catch (error) { next(error); }
    }

    async resetSyncCursor(req: Request, res: Response, next: NextFunction) {
        try {
            const device = await BiometricDevice.findOne({ _id: req.params.id as string, tenantId: req.tenantId });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }
            await BiometricDevice.findByIdAndUpdate(device._id, {
                $unset: { lastSyncCursor: '', lastSync: '' },
                totalRecordsFetched: 0,
            });
            res.json({ success: true, message: 'Sync cursor reset. Device will re-send all records on next heartbeat.' });
        } catch (error) { next(error); }
    }

    async getDeviceLogs(req: Request, res: Response, next: NextFunction) {
        try {
            const { page = '1', limit = '50' } = req.query as Record<string, string>;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const device = await BiometricDevice.findOne({ _id: req.params.id as string, tenantId: req.tenantId });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }

            const [rawLogs, total] = await Promise.all([
                BiometricRawLog.find({ tenantId: req.tenantId, deviceId: device._id })
                    .sort({ punchTime: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),
                BiometricRawLog.countDocuments({ tenantId: req.tenantId, deviceId: device._id }),
            ]);

            res.json({ success: true, data: { logs: rawLogs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
        } catch (error) { next(error); }
    }

    // ─── MEMBER ENROLLMENT ───────────────────────────────────────

    async getEnrolledMembers(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const { deviceId, page = '1', limit = '20' } = req.query as Record<string, string>;
            const filter: any = { tenantId };
            if (deviceId) filter.assignedDeviceIds = deviceId;

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [enrollments, total] = await Promise.all([
                BiometricMember.find(filter)
                    .populate('memberId', 'firstName lastName membershipNumber personalInfo.profilePicture')
                    .populate('assignedDeviceIds', 'name location')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),
                BiometricMember.countDocuments(filter),
            ]);
            const mappings = enrollments.map(e => e.toObject());
            res.json({ success: true, data: { mappings, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
        } catch (error) { next(error); }
    }

    async enrollMember(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const { memberId, deviceId, biometricUserId, rfidCardId, pinCode, enrollmentType } = req.body;

            const member = await Member.findOne({ _id: memberId, tenantId });
            if (!member) { res.status(404).json({ success: false, message: 'Member not found' }); return; }

            if (deviceId) {
                const device = await BiometricDevice.findOne({ _id: deviceId, tenantId });
                if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }
            }

            const enrollId = biometricUserId || rfidCardId || String(memberId);

            let enrollment = await BiometricMember.findOne({ tenantId, memberId });

            if (enrollment) {
                enrollment.biometricUserId = enrollId;
                if (rfidCardId) enrollment.rfidCardId = rfidCardId;
                if (pinCode) enrollment.pinCode = pinCode;
                if (deviceId && !enrollment.assignedDeviceIds.some(id => id.toString() === deviceId)) {
                    enrollment.assignedDeviceIds.push(new mongoose.Types.ObjectId(deviceId));
                }
                enrollment.active = true;
                enrollment.enrolledBy = req.user!._id as any;
                await enrollment.save();
            } else {
                enrollment = await BiometricMember.create({
                    tenantId,
                    memberId,
                    biometricUserId: enrollId,
                    rfidCardId,
                    pinCode,
                    assignedDeviceIds: deviceId ? [new mongoose.Types.ObjectId(deviceId)] : [],
                    active: true,
                    enrolledBy: req.user!._id,
                    enrolledAt: new Date(),
                });
                if (deviceId) {
                    await BiometricDevice.findByIdAndUpdate(deviceId, { $inc: { enrolledMembers: 1 } });
                }
            }

            res.status(201).json({ success: true, message: 'Member enrolled successfully', data: enrollment });
        } catch (error) { next(error); }
    }

    async getMemberEnrollment(req: Request, res: Response, next: NextFunction) {
        try {
            // Support both: lookup by BiometricMember._id OR by Member._id (memberId field)
            const enrollments = await BiometricMember.find({
                $or: [
                    { _id: req.params.id, tenantId: req.tenantId },
                    { memberId: req.params.id, tenantId: req.tenantId },
                ],
            })
                .populate('memberId', 'firstName lastName membershipNumber')
                .populate('assignedDeviceIds', 'name location type');
            if (!enrollments.length) { res.status(404).json({ success: false, message: 'Enrollment not found' }); return; }
            const result = enrollments.length === 1 ? enrollments[0].toObject() : enrollments.map(e => e.toObject());
            res.json({ success: true, data: result });
        } catch (error) { next(error); }
    }

    async removeEnrollment(req: Request, res: Response, next: NextFunction) {
        try {
            const enrollment = await BiometricMember.findOneAndUpdate(
                { _id: req.params.id as string, tenantId: req.tenantId },
                { active: false },
                { new: true }
            );
            if (!enrollment) { res.status(404).json({ success: false, message: 'Enrollment not found' }); return; }
            for (const dId of enrollment.assignedDeviceIds) {
                await BiometricDevice.findByIdAndUpdate(dId, { $inc: { enrolledMembers: -1 } });
            }
            res.json({ success: true, message: 'Enrollment removed' });
        } catch (error) { next(error); }
    }

    // PUT /biometric/members/:memberId — upsert biometricUserId mapping for a member
    async updateMemberBiometric(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { res.status(400).json({ success: false, message: 'Tenant context required' }); return; }

            const { memberId } = req.params as any;
            const { biometricUserId, rfidCardId, pinCode, deviceId, assignedDeviceIds, active } = req.body;

            const member = await Member.findOne({ _id: memberId, tenantId });
            if (!member) { res.status(404).json({ success: false, message: 'Member not found' }); return; }

            // Resolve device: use provided, first from array, or auto-pick first active device (optional)
            let resolvedDeviceId = deviceId || (Array.isArray(assignedDeviceIds) && assignedDeviceIds[0]) || undefined;
            if (!resolvedDeviceId) {
                const firstDevice = await BiometricDevice.findOne({ tenantId, isActive: true }).select('_id');
                resolvedDeviceId = firstDevice?._id;
            }

            // Find existing enrollment for this member (by memberId, ignore deviceId to avoid creating duplicates)
            let enrollment = await BiometricMember.findOne({ tenantId, memberId });

            if (enrollment) {
                // Update in-place — no new doc, no duplicate key risk
                if (biometricUserId !== undefined) enrollment.biometricUserId = biometricUserId;
                if (rfidCardId !== undefined) (enrollment as any).rfidCardId = rfidCardId;
                if (pinCode !== undefined) (enrollment as any).pinCode = pinCode;
                if (active !== undefined) enrollment.active = active;
                await enrollment.save({ validateBeforeSave: false });
            } else {
                // Create fresh enrollment
                enrollment = await BiometricMember.create({
                    tenantId,
                    memberId,
                    biometricUserId: biometricUserId ?? undefined,
                    rfidCardId: rfidCardId ?? undefined,
                    pinCode: pinCode ?? undefined,
                    active: active !== undefined ? active : true,
                    assignedDeviceIds: resolvedDeviceId ? [resolvedDeviceId] : [],
                });
            }

            if (biometricUserId) {
                await BiometricAttendanceService.reprocessSkippedLogs(tenantId, biometricUserId);
            }

            res.json({ success: true, message: 'Biometric mapping updated', data: enrollment });
        } catch (error: any) {
            if (error.code === 11000 && error.keyPattern?.biometricUserId) {
                res.status(409).json({ success: false, message: `Biometric ID "${req.body.biometricUserId}" is already assigned to another member` });
                return;
            }
            next(error);
        }
    }

    // ─── SETTINGS ────────────────────────────────────────────────

    async getSettings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const branchId = req.branchId;
            const filter: any = { tenantId };
            if (branchId) filter.branchId = branchId;

            const [settings, devices] = await Promise.all([
                BiometricSettings.findOne(filter),
                BiometricDevice.find({ tenantId, isActive: true }).select('settings name deviceName branchId'),
            ]);

            res.json({
                success: true,
                data: {
                    globalSettings: settings || {
                        dedupeWindowMinutes: 5,
                        autoCheckoutAfterMinutes: 480,
                        timezone: 'Asia/Kolkata',
                        attendanceSourcePriority: ['biometric', 'qr', 'manual'],
                    },
                    deviceSettings: devices,
                },
            });
        } catch (error) { next(error); }
    }

    async updateSettings(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const branchId = req.branchId;
            const { deviceId, settings, ...globalSettings } = req.body;

            if (deviceId) {
                await BiometricDevice.findOneAndUpdate(
                    { _id: deviceId, tenantId },
                    { $set: { settings } }
                );
            }

            if (Object.keys(globalSettings).length > 0) {
                const filter: any = { tenantId };
                if (branchId) filter.branchId = branchId;
                await BiometricSettings.findOneAndUpdate(filter, { $set: globalSettings }, { upsert: true, new: true });
            }

            res.json({ success: true, message: 'Settings updated' });
        } catch (error) { next(error); }
    }

    // ─── REPORTS ─────────────────────────────────────────────────

    async getReports(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            const { startDate, endDate } = req.query as Record<string, string>;
            const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 86400000);
            const end = endDate ? new Date(endDate) : new Date();

            const [totalAttendance, devices, enrollments] = await Promise.all([
                Attendance.countDocuments({ tenantId, checkInTime: { $gte: start, $lte: end } }),
                BiometricDevice.countDocuments({ tenantId, isActive: true }),
                BiometricMember.countDocuments({ tenantId }),
            ]);

            const dailyStats = await Attendance.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId as string), checkInTime: { $gte: start, $lte: end } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkInTime' } }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } },
            ]);

            res.json({ success: true, data: { totalAttendance, devices, enrollments, dailyStats } });
        } catch (error) { next(error); }
    }

    // ─── WEBHOOK ─────────────────────────────────────────────────

    async handleWebhook(req: Request, res: Response, next: NextFunction) {
        try {
            const { deviceId, biometricUserId, memberId, direction, timestamp, rawPayload } = req.body;
            const device = await BiometricDevice.findOne({ deviceId });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }

            await BiometricDevice.findByIdAndUpdate(device._id, { lastPing: new Date(), status: 'online' });

            const punchTime = timestamp ? new Date(timestamp) : new Date();

            const rawLog = await new BiometricRawLog({
                tenantId: device.tenantId,
                branchId: device.branchId,
                deviceId: device._id,
                biometricUserId: biometricUserId || memberId,
                eventType: direction === 'out' ? 'check_out' : 'check_in',
                punchTime,
                deviceLocalTime: punchTime,
                rawPayload: rawPayload || req.body,
                processed: false,
            }).save();

            const member = await Member.findOne({ _id: memberId, tenantId: device.tenantId });
            if (member) {
                let attendanceId: string | undefined;
                if (direction === 'in') {
                    const record = await attendanceService.checkIn({
                        memberId: member._id.toString(),
                        tenantId: device.tenantId.toString(),
                        branchId: device.branchId.toString(),
                        checkInMethod: 'biometric',
                    });
                    attendanceId = (record as any)?._id?.toString();
                } else if (direction === 'out') {
                    const open = await Attendance.findOne({
                        memberId: member._id,
                        tenantId: device.tenantId,
                        checkOutTime: null,
                    }).sort({ checkInTime: -1 });
                    if (open) {
                        await attendanceService.checkOut(open._id.toString(), device.tenantId.toString());
                        attendanceId = open._id.toString();
                    }
                }
                await BiometricRawLog.findByIdAndUpdate((rawLog as any)._id, { processed: true, processedAt: new Date(), attendanceId });
            } else {
                await BiometricRawLog.findByIdAndUpdate((rawLog as any)._id, { skippedReason: 'member_not_found' });
            }

            res.json({ success: true, message: 'Webhook processed' });
        } catch (error) { next(error); }
    }

    // ─── UNMATCHED LOGS ──────────────────────────────────────────

    async getUnmatchedLogs(req: Request, res: Response, next: NextFunction) {
        try {
            // Unmatched biometric punches = BiometricRawLog rows where the enrollId had
            // no BiometricMember mapping. These NEVER reach the Attendance table.
            const rawLogs = await BiometricRawLog.find({
                tenantId: req.tenantId,
                skippedReason: { $in: ['member_not_enrolled', 'no_member_mapping', 'member_not_found'] },
            })
                .populate('deviceId', 'name location')
                .sort({ punchTime: -1 })
                .limit(500)
                .lean();

            // Group by biometricUserId so UI can show "enrollId X → N punches unmatched"
            const grouped = new Map<string, any>();
            for (const log of rawLogs) {
                const key = String((log as any).biometricUserId ?? 'unknown');
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        biometricUserId: key,
                        device: (log as any).deviceId,
                        punchCount: 0,
                        lastPunch: (log as any).punchTime,
                        skippedReason: (log as any).skippedReason,
                    });
                }
                const entry = grouped.get(key)!;
                entry.punchCount++;
                if ((log as any).punchTime > entry.lastPunch) entry.lastPunch = (log as any).punchTime;
            }

            const records = Array.from(grouped.values())
                .sort((a, b) => new Date(b.lastPunch).getTime() - new Date(a.lastPunch).getTime());

            res.json({ success: true, data: { records, total: records.length } });
        } catch (error) { next(error); }
    }

    // ─── DIAGNOSTIC ──────────────────────────────────────────────

    /**
     * GET /api/biometric/diagnostic
     * Shows the current state: devices, mappings, recent raw logs, recent attendance.
     * Use this to debug why punches aren't being processed.
     */
    async getDiagnostic(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { res.status(400).json({ success: false, message: 'Tenant required' }); return; }

            const now = new Date();
            const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

            const [devices, mappings, recentRawLogs, recentAttendance, members] = await Promise.all([
                BiometricDevice.find({ tenantId }).lean(),
                BiometricMember.find({ tenantId }).populate('memberId', 'firstName lastName sNo').lean(),
                BiometricRawLog.find({ tenantId }).sort({ createdAt: -1 }).limit(20).lean(),
                Attendance.find({ tenantId, checkInTime: { $gte: todayStart } })
                    .sort({ checkInTime: -1 }).limit(20)
                    .populate('memberId', 'firstName lastName').lean(),
                Member.find({ tenantId, status: { $in: ['active', 'trial'] } })
                    .select('firstName lastName sNo status _id').sort({ sNo: 1 }).limit(20).lean(),
            ]);

            res.json({
                success: true,
                data: {
                    devices: devices.map((d: any) => ({
                        _id: d._id, name: d.name, serialNumber: d.serialNumber,
                        deviceId: d.deviceId, status: d.status, isActive: d.isActive,
                        lastSeenAt: d.lastSeenAt, lastSyncCursor: d.lastSyncCursor,
                        totalRecordsFetched: d.totalRecordsFetched,
                    })),
                    mappings: mappings.map((m: any) => ({
                        _id: m._id,
                        memberId: m.memberId?._id,
                        memberName: m.memberId ? `${m.memberId.firstName} ${m.memberId.lastName}` : '(deleted)',
                        memberSNo: m.memberId?.sNo,
                        biometricUserId: m.biometricUserId,
                        active: m.active,
                    })),
                    recentRawLogs: recentRawLogs.map((l: any) => ({
                        biometricUserId: l.biometricUserId, punchTime: l.punchTime,
                        processed: l.processed, skippedReason: l.skippedReason,
                        attendanceId: l.attendanceId, createdAt: l.createdAt,
                    })),
                    todayAttendance: recentAttendance.map((a: any) => ({
                        memberId: a.memberId?._id, memberName: a.memberId ? `${a.memberId.firstName} ${a.memberId.lastName}` : '?',
                        checkInTime: a.checkInTime, checkOutTime: a.checkOutTime, method: a.method,
                    })),
                    activeMembers: members.map((m: any) => ({
                        _id: m._id, name: `${m.firstName} ${m.lastName}`,
                        sNo: m.sNo, status: m.status,
                    })),
                },
            });
        } catch (error) { next(error); }
    }

    /**
     * POST /api/biometric/simulate-punch
     * Directly simulates a biometric punch for a member (no device needed).
     * Body: { memberId: string }
     * Creates attendance + fires socket event. Use to verify the Members page "Present" flow.
     */
    async simulatePunch(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { res.status(400).json({ success: false, message: 'Tenant required' }); return; }

            const { memberId } = req.body;
            if (!memberId) { res.status(400).json({ success: false, message: 'memberId required' }); return; }

            const member = await Member.findOne({ _id: memberId, tenantId }).lean();
            if (!member) { res.status(404).json({ success: false, message: 'Member not found' }); return; }

            const device = await BiometricDevice.findOne({ tenantId, isActive: true }).lean();
            if (!device) { res.status(400).json({ success: false, message: 'No active device found' }); return; }

            const branchId = (device as any).branchId?.toString() ?? (member as any).branchId?.toString();

            const punchTime = new Date();

            const result = await BiometricAttendanceService.processPushPunch({
                tenantId,
                branchId,
                deviceId: (device as any)._id.toString(),
                biometricUserId: String((member as any).sNo ?? memberId),
                punchTime,
                eventType: 'check_in',
                rawPayload: { simulated: true, triggeredBy: req.user?._id },
            });

            // Ensure attendance was created even if auto-match didn't fire
            if (!result.created && result.reason !== 'duplicate') {
                // Direct attendance creation (bypass biometric mapping requirement for simulation)
                const todayStart = new Date(punchTime); todayStart.setHours(0, 0, 0, 0);
                const todayEnd   = new Date(punchTime); todayEnd.setHours(23, 59, 59, 999);
                const open = await Attendance.findOne({ memberId, tenantId, checkInTime: { $gte: todayStart, $lte: todayEnd }, checkOutTime: null });
                if (open) {
                    await Attendance.findByIdAndUpdate(open._id, { checkOutTime: punchTime, duration: Math.round((punchTime.getTime() - new Date(open.checkInTime).getTime()) / 60000) });
                } else {
                    await Attendance.create({ tenantId, branchId, memberId, checkInTime: punchTime, method: 'biometric', source: 'biometric', deviceId: (device as any)._id.toString(), isFraudulent: false, isOverstay: false });
                }
                // Emit socket
                const ws = (global as any).websocketService;
                if (ws) {
                    ws.broadcastToTenant(tenantId, 'attendance:update', { memberId, punchTime, type: open ? 'checkout' : 'checkin' });
                }
            }

            res.json({
                success: true,
                message: result.created ? 'Simulated punch processed → attendance created' : `Simulated punch: ${result.reason}`,
                data: { result, memberName: `${(member as any).firstName} ${(member as any).lastName}`, punchTime },
            });
        } catch (error) { next(error); }
    }
}

export default new BiometricController();

