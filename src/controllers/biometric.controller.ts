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
            const stats = {
                total: devices.length,
                online: devices.filter(d => d.status === 'online').length,
                offline: devices.filter(d => d.status === 'offline').length,
                error: devices.filter(d => d.status === 'error').length,
            };
            res.json({ success: true, data: { devices, stats } });
        } catch (error) { next(error); }
    }

    async addDevice(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const branchId = req.branchId || req.body.branchId;
            if (!branchId) { res.status(400).json({ success: false, message: 'branchId required' }); return; }

            const device = await BiometricDevice.create({
                ...req.body,
                deviceId: req.body.deviceId || new mongoose.Types.ObjectId().toString(),
                tenantId,
                branchId,
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
            const device = await BiometricDevice.findOneAndUpdate(
                { _id: req.params.id as string, tenantId: req.tenantId },
                { $set: req.body },
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
            // Simulate ping — in production this would connect to device IP
            const reachable = !!(device.ipAddress);
            const newStatus = reachable ? 'online' : 'offline';
            await BiometricDevice.findByIdAndUpdate(device._id, { status: newStatus, lastPing: new Date() });
            res.json({ success: true, data: { reachable, status: newStatus, latency: reachable ? Math.round(Math.random() * 50 + 10) : null } });
        } catch (error) { next(error); }
    }

    async syncDevice(req: Request, res: Response, next: NextFunction) {
        try {
            const device = await BiometricDevice.findOne({ _id: req.params.id as string, tenantId: req.tenantId });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }
            await BiometricDevice.findByIdAndUpdate(device._id, { status: 'syncing', lastSync: new Date() });

            const job = await new BiometricSyncJob({
                tenantId: req.tenantId,
                branchId: device.branchId,
                deviceId: device._id,
                trigger: 'manual',
                status: 'running',
                startedAt: new Date(),
            }).save();

            setTimeout(async () => {
                await BiometricDevice.findByIdAndUpdate(device._id, { status: 'online' });
                await BiometricSyncJob.findByIdAndUpdate((job as any)._id, { status: 'completed', completedAt: new Date() });
            }, 2000);

            res.json({ success: true, message: 'Sync initiated', data: { syncedAt: new Date(), jobId: (job as any)._id } });
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
            const filter: any = { tenantId, isActive: true };
            if (deviceId) filter.deviceId = deviceId;

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const [enrollments, total] = await Promise.all([
                BiometricMember.find(filter)
                    .populate('memberId', 'firstName lastName membershipNumber personalInfo.profilePicture')
                    .populate('deviceId', 'name location')
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(parseInt(limit)),
                BiometricMember.countDocuments(filter),
            ]);
            res.json({ success: true, data: { enrollments, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
        } catch (error) { next(error); }
    }

    async enrollMember(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const { memberId, deviceId, enrollmentType, template, cardNumber } = req.body;

            const member = await Member.findOne({ _id: memberId, tenantId });
            if (!member) { res.status(404).json({ success: false, message: 'Member not found' }); return; }

            const device = await BiometricDevice.findOne({ _id: deviceId, tenantId });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }

            let enrollment = await BiometricMember.findOne({ tenantId, memberId, deviceId });
            const enrollmentEntry = {
                type: enrollmentType || 'fingerprint',
                template,
                cardNumber,
                enrolledAt: new Date(),
                enrolledBy: req.user!._id,
            };

            if (enrollment) {
                enrollment.enrollmentData.push(enrollmentEntry as any);
                await enrollment.save();
            } else {
                enrollment = await BiometricMember.create({
                    tenantId,
                    memberId,
                    userId: member.userId,
                    deviceId,
                    enrollmentData: [enrollmentEntry],
                });
                // Increment device enrolled count
                await BiometricDevice.findByIdAndUpdate(deviceId, { $inc: { enrolledMembers: 1 } });
            }

            res.status(201).json({ success: true, message: 'Member enrolled successfully', data: enrollment });
        } catch (error) { next(error); }
    }

    async getMemberEnrollment(req: Request, res: Response, next: NextFunction) {
        try {
            const enrollment = await BiometricMember.findOne({ _id: req.params.id as string, tenantId: req.tenantId })
                .populate('memberId', 'firstName lastName membershipNumber')
                .populate('deviceId', 'name location type');
            if (!enrollment) { res.status(404).json({ success: false, message: 'Enrollment not found' }); return; }
            res.json({ success: true, data: enrollment });
        } catch (error) { next(error); }
    }

    async removeEnrollment(req: Request, res: Response, next: NextFunction) {
        try {
            const enrollment = await BiometricMember.findOneAndUpdate(
                { _id: req.params.id as string, tenantId: req.tenantId },
                { isActive: false },
                { new: true }
            );
            if (!enrollment) { res.status(404).json({ success: false, message: 'Enrollment not found' }); return; }
            await BiometricDevice.findByIdAndUpdate(enrollment.deviceId, { $inc: { enrolledMembers: -1 } });
            res.json({ success: true, message: 'Enrollment removed' });
        } catch (error) { next(error); }
    }

    // PUT /biometric/members/:memberId — upsert biometricUserId mapping for a member
    async updateMemberBiometric(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.tenantId!;
            const { memberId } = req.params as any;
            const { biometricUserId, deviceId, assignedDeviceIds } = req.body;

            const member = await Member.findOne({ _id: memberId, tenantId });
            if (!member) { res.status(404).json({ success: false, message: 'Member not found' }); return; }

            // Resolve device: use deviceId directly, or first from assignedDeviceIds array
            const resolvedDeviceId = deviceId || (Array.isArray(assignedDeviceIds) && assignedDeviceIds[0]) || undefined;

            const filter: any = { tenantId, memberId };
            if (resolvedDeviceId) filter.deviceId = resolvedDeviceId;

            const update: any = { isActive: true };
            if (biometricUserId !== undefined) update.biometricUserId = biometricUserId;

            const enrollment = await BiometricMember.findOneAndUpdate(filter, { $set: update }, {
                new: true, upsert: true, setDefaultsOnInsert: true,
            });

            res.json({ success: true, message: 'Biometric mapping updated', data: enrollment });
        } catch (error) { next(error); }
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
                BiometricDevice.find({ tenantId, isActive: true }).select('settings name branchId'),
            ]);

            res.json({
                success: true,
                data: {
                    globalSettings: settings || {
                        dedupeWindowMinutes: 5,
                        autoCheckoutAfterMinutes: 180,
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
                BiometricMember.countDocuments({ tenantId, isActive: true }),
            ]);

            const dailyStats = await Attendance.aggregate([
                { $match: { tenantId: { $exists: true }, checkInTime: { $gte: start, $lte: end } } },
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
            // Attendance records with no member data populated (memberId not found)
            const unmatched = await Attendance.find({
                tenantId: req.tenantId,
                memberId: null,
            }).sort({ checkInTime: -1 }).limit(100);
            res.json({ success: true, data: unmatched });
        } catch (error) { next(error); }
    }
}

export default new BiometricController();

