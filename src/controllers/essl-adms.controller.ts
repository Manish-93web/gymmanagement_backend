import { Request, Response } from 'express';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricMember from '../models/BiometricMember.model';
import BiometricRawLog from '../models/BiometricRawLog.model';
import Attendance from '../models/Attendance.model';
import Member from '../models/Member.model';
import { AttendanceService } from '../services/attendance.service';

const attendanceService = new AttendanceService();

// ADMS ATTLOG line format: ENROLLID\tTIME\tSTATUS\tVERIFY\tWORKCODE\tRESERVED
// STATUS 0 or 4 = check-in, 1 or 5 = check-out, 255 = unknown

/**
 * Find device by SN. On first-ever heartbeat, auto-associates the SN with any
 * eSSL device that has no serialNumber set yet (seed creates devices this way).
 */
async function resolveDevice(sn: string) {
    if (!sn) return null;

    // Fast path: already linked by serialNumber
    let device = await BiometricDevice.findOneAndUpdate(
        { serialNumber: sn, vendor: 'essl', isActive: true },
        { lastPing: new Date(), status: 'online' },
        { new: true }
    ).catch(() => null);
    if (device) return device;

    // Fallback: device whose deviceId was set to the seeded placeholder
    device = await BiometricDevice.findOneAndUpdate(
        { deviceId: sn, vendor: 'essl', isActive: true },
        { lastPing: new Date(), status: 'online' },
        { new: true }
    ).catch(() => null);
    if (device) return device;

    // Auto-associate: first eSSL device with no serialNumber (seed default)
    device = await BiometricDevice.findOneAndUpdate(
        {
            vendor: 'essl',
            isActive: true,
            $or: [{ serialNumber: { $exists: false } }, { serialNumber: null }, { serialNumber: '' }],
        },
        { serialNumber: sn, lastPing: new Date(), status: 'online' },
        { new: true }
    ).catch(() => null);

    if (device) {
        console.log(`[eSSL ADMS] Auto-associated SN="${sn}" with device "${device.name}" (_id=${device._id})`);
    } else {
        console.warn(`[eSSL ADMS] Unknown SN="${sn}" — no un-associated eSSL device found. Run npm run seed:essl-device first.`);
    }
    return device;
}

class EsslAdmsController {
    // GET /iclock/cdata — device heartbeat & option request
    async heartbeat(req: Request, res: Response) {
        const sn = (req.query.SN as string) || (req.query.sn as string) || '';
        if (!sn) { res.type('text/plain').send('ERROR'); return; }

        const device = await resolveDevice(sn);

        const stamp = device?.lastSync ? Math.floor(device.lastSync.getTime() / 1000) : 0;
        const response = [
            `GET OPTION FROM:${sn}`,
            `ATTLOGStamp=${stamp}`,
            `OPERLOGStamp=9999`,
            `ATTPHOTOStamp=9999`,
            `ErrorDelay=30`,
            `Delay=10`,
            `TransTimes=00:00;14:05`,
            `TransInterval=1`,
            `TransFlag=TransData AttLog OpLog AttPhoto`,
            `ServerVer=2.4.1`,
            `PushOptionsFlag=1`,
        ].join('\r\n');

        res.type('text/plain').send(response);
    }

    // POST /iclock/cdata — device pushes ATTLOG / OPERLOG data
    async receiveData(req: Request, res: Response) {
        const sn   = (req.query.SN as string) || (req.query.sn as string) || '';
        const table = (req.query.table as string || '').toUpperCase();

        // Only process ATTLOG; acknowledge everything else
        if (table !== 'ATTLOG') {
            res.type('text/plain').send('OK');
            return;
        }

        const device = await resolveDevice(sn);
        if (device) {
            await BiometricDevice.findByIdAndUpdate(device._id, { lastSync: new Date() }).catch(() => {});
        }

        if (!device) {
            res.type('text/plain').send('OK');
            return;
        }

        const body: string = typeof req.body === 'string' ? req.body : '';
        const lines = body.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 3) continue;

            const enrollId = parts[0].trim();
            const timeStr = parts[1].trim();
            const statusCode = parseInt(parts[2].trim(), 10);

            const punchTime = new Date(timeStr.replace(' ', 'T'));
            if (isNaN(punchTime.getTime())) continue;

            // 0/4 = in, 1/5 = out
            const eventType = (statusCode === 1 || statusCode === 5) ? 'check_out' : 'check_in';

            // Deduplicate by (deviceId, biometricUserId, punchTime) — unique index in model
            const existing = await BiometricRawLog.findOne({
                deviceId: device._id,
                biometricUserId: enrollId,
                punchTime,
            }).catch(() => null);
            if (existing) continue;

            let rawLog: any;
            try {
                rawLog = await new BiometricRawLog({
                    tenantId: device.tenantId,
                    branchId: device.branchId,
                    deviceId: device._id,
                    biometricUserId: enrollId,
                    eventType,
                    punchTime,
                    deviceLocalTime: timeStr,
                    rawPayload: { enrollId, timeStr, statusCode, rawLine: line },
                    processed: false,
                }).save();
            } catch (dupErr: any) {
                if (dupErr?.code === 11000) continue; // duplicate key — already processed
                continue;
            }

            // Map enrollId → member via BiometricMember.biometricUserId
            const enrollment = await BiometricMember.findOne({
                deviceId: device._id,
                biometricUserId: enrollId,
                isActive: true,
            }).catch(() => null);

            if (!enrollment) {
                await BiometricRawLog.findByIdAndUpdate(rawLog._id, { skippedReason: 'member_not_enrolled' });
                continue;
            }

            const member = await Member.findOne({ _id: enrollment.memberId, tenantId: device.tenantId }).catch(() => null);
            if (!member) {
                await BiometricRawLog.findByIdAndUpdate(rawLog._id, { skippedReason: 'member_not_found' });
                continue;
            }

            try {
                let attendanceId: string | undefined;
                if (eventType === 'check_in') {
                    const record = await attendanceService.checkIn({
                        memberId: member._id.toString(),
                        tenantId: device.tenantId.toString(),
                        branchId: device.branchId.toString(),
                        checkInMethod: 'biometric',
                    });
                    attendanceId = (record as any)?._id?.toString();
                } else {
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
                await BiometricRawLog.findByIdAndUpdate(rawLog._id, { processed: true, processedAt: new Date(), attendanceId });
                await BiometricMember.findByIdAndUpdate(enrollment._id, { lastUsed: new Date() });
            } catch (err) {
                console.error('[eSSL ADMS] Attendance processing error for member', member._id, err);
                await BiometricRawLog.findByIdAndUpdate(rawLog._id, { skippedReason: 'attendance_error' });
            }
        }

        res.type('text/plain').send('OK');
    }

    // GET /iclock/getrequest — device checks for pending server commands
    async getRequest(_req: Request, res: Response) {
        res.type('text/plain').send('OK');
    }

    // POST /iclock/devicecmd — device sends command execution results
    async deviceCmd(_req: Request, res: Response) {
        res.type('text/plain').send('OK');
    }
}

export default new EsslAdmsController();
