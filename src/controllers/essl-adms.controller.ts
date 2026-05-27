import { Request, Response } from 'express';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricAttendanceService from '../services/biometric-attendance.service';
import Branch from '../models/Branch.model';

/**
 * eSSL ADMS Push Endpoint — /iclock/cdata
 *
 * GET  — device heartbeat / option request
 * POST — device pushes ATTLOG records
 *
 * ATTLOG line format: ENROLLID\tTIME\tSTATUS\tVERIFY\tWORKCODE\tRESERVED
 *   STATUS 0 = check-in, 1 = check-out, 4 = overtime-in, 5 = overtime-out
 */

function esslStatusToEventType(code: number): string {
    switch (code) {
        case 1:  return 'check_out';
        case 4:  return 'overtime_in';
        case 5:  return 'overtime_out';
        default: return 'check_in';
    }
}

/**
 * Convert a device-local time string to UTC.
 * Device sends "YYYY-MM-DD HH:MM:SS" in its configured timezone (e.g. Asia/Kolkata).
 * We need the UTC equivalent so attendance timestamps are correct.
 */
function deviceLocalToUTC(timeStr: string, tz: string): Date {
    // Parse the string as-is first to get a numeric base
    const naive = new Date(timeStr.replace(' ', 'T') + 'Z'); // treat as UTC temporarily
    if (isNaN(naive.getTime())) return new Date(NaN);

    try {
        // Find what this UTC moment looks like in the device's timezone
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        }).formatToParts(naive);
        const m: Record<string, string> = {};
        for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
        // This is what the device clock says when UTC = naive
        const tzInterpretedAsUTC = new Date(
            `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}Z`
        );
        // offset = (what tz shows) - (UTC) → negate to convert device local → UTC
        const offsetMs = tzInterpretedAsUTC.getTime() - naive.getTime();
        return new Date(naive.getTime() - offsetMs);
    } catch {
        // Fallback: treat as UTC (better than crashing)
        return naive;
    }
}

// SNs from browser tests — not real device serial numbers
const PLACEHOLDER_SN = /^(TEST|PING|test|ping|0+)$/i;

/**
 * Resolve device by SN. On first real heartbeat, auto-associates the SN with any
 * eSSL device that has no SN yet — or one that holds a browser-test placeholder (TEST/PING).
 * This lets the real device "reclaim" a document after a browser test set a fake SN on it.
 */
async function resolveDevice(sn: string) {
    if (!sn) return null;

    const now = new Date();
    const onlineUpdate = { lastPing: now, lastSeenAt: now, status: 'active', consecutiveFailures: 0 };

    // Fast path: already linked with this exact SN (skip for placeholders so real device can overwrite)
    if (!PLACEHOLDER_SN.test(sn)) {
        let device = await BiometricDevice.findOneAndUpdate(
            { serialNumber: sn, isDeleted: false },
            onlineUpdate,
            { new: true }
        ).catch(() => null);
        if (device) return device;

        // Fallback: deviceId matches SN
        device = await BiometricDevice.findOneAndUpdate(
            { deviceId: sn, isDeleted: false },
            onlineUpdate,
            { new: true }
        ).catch(() => null);
        if (device) return device;
    }

    // Auto-associate: first eSSL device with no SN yet OR a placeholder SN from a browser test.
    // Including placeholder devices here is what allows the real device to "take over"
    // after a browser test temporarily set serialNumber=PING on the device doc.
    const device = await BiometricDevice.findOneAndUpdate(
        {
            deviceBrand: 'essl',
            isDeleted: false,
            $or: [
                { serialNumber: { $exists: false } },
                { serialNumber: null },
                { serialNumber: '' },
                { serialNumber: { $regex: PLACEHOLDER_SN } },
            ],
        },
        { serialNumber: sn, ...onlineUpdate },
        { new: true }
    ).catch(() => null);

    if (device) {
        console.log(`[eSSL ADMS] Auto-associated SN="${sn}" with device "${device.deviceName || (device as any).name}" (_id=${device._id})`);
    } else {
        console.warn(`[eSSL ADMS] Unknown SN="${sn}" — add the device in Biometric Devices page first.`);
    }
    return device;
}

class EsslAdmsController {

    // GET /iclock/cdata — device heartbeat
    async heartbeat(req: Request, res: Response) {
        const sn = (req.query.SN as string) || (req.query.sn as string) || '';
        console.log(`[eSSL ADMS] GET heartbeat SN="${sn}"`);

        if (!sn) { res.type('text/plain').send('ERROR'); return; }
        const device = await resolveDevice(sn);

        // Compute ATTLOGStamp: Unix timestamp of last received punch, or 0 to get all records.
        // We use lastSyncCursor (a datetime string from the last ATTLOG line) converted to Unix seconds.
        // If the device has never pushed to us, stamp=0 forces it to send everything.
        let stamp = 0;
        const cursor = (device as any)?.lastSyncCursor;
        if (cursor) {
            const t = new Date(String(cursor).replace(' ', 'T'));
            if (!isNaN(t.getTime())) stamp = Math.floor(t.getTime() / 1000);
        }

        const response = [
            `GET OPTION FROM:${sn}`,
            `ATTLOGStamp=${stamp}`,
            `OPERLOGStamp=9999`,
            `ATTPHOTOStamp=9999`,
            `ErrorDelay=30`,
            `Delay=5`,
            `TransTimes=00:00`,
            `TransInterval=1`,
            `RealTime=1`,
            `TransFlag=TransData AttLog OpLog AttPhoto`,
            `ServerVer=2.4.1`,
            `PushOptionsFlag=1`,
        ].join('\r\n');

        res.type('text/plain').send(response);
    }

    // POST /iclock/cdata — device pushes ATTLOG
    async receiveData(req: Request, res: Response) {
        const sn    = (req.query.SN as string) || (req.query.sn as string) || '';
        const table = ((req.query.table as string) || '').toUpperCase();

        const device = await resolveDevice(sn);

        // Only process ATTLOG; acknowledge everything else silently
        if (table !== 'ATTLOG') {
            res.type('text/plain').send('OK');
            return;
        }

        if (!device) {
            res.type('text/plain').send('OK');
            return;
        }

        // Resolve branchId — BiometricRawLog requires it
        let branchId: string | null = device.branchId?.toString() ?? null;
        if (!branchId) {
            const fallback = await Branch.findOne({ tenantId: device.tenantId }).select('_id').lean();
            branchId = fallback?._id?.toString() ?? null;
        }
        if (!branchId) {
            console.warn(`[eSSL ADMS] SN="${sn}" — no branch for tenant ${device.tenantId}. Punches skipped.`);
            res.type('text/plain').send('OK');
            return;
        }

        // Read raw body — express.text() gives us a string directly
        const rawBody: string = typeof req.body === 'string' ? req.body
            : (req.body ? JSON.stringify(req.body) : '');

        console.log(`[eSSL ADMS] POST SN="${sn}" device="${(device as any).deviceName || (device as any).name}" content-type="${req.headers['content-type']}" body-preview="${rawBody.slice(0, 200)}"`);

        // eSSL ADMS delivers ATTLOG in two formats:
        //   1. URL-encoded: table=ATTLOG&Stamp=N&ATTLOG=line1%0Aline2
        //   2. Raw text:    ENROLLID\tTIME\tSTATUS\t...  (one per line)
        let attlogText = rawBody;
        if (rawBody.includes('ATTLOG=')) {
            try {
                const params = new URLSearchParams(rawBody);
                attlogText = params.get('ATTLOG') ?? rawBody;
            } catch { attlogText = rawBody; }
        }

        const lines = attlogText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        console.log(`[eSSL ADMS] SN="${sn}" — ${lines.length} ATTLOG line(s) to process`);

        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 3) continue;

            const enrollId   = parts[0].trim();
            const timeStr    = parts[1].trim();
            const statusCode = parseInt(parts[2].trim(), 10);
            const eventType  = esslStatusToEventType(statusCode);

            // Convert device-local time (e.g. IST) to UTC using device's configured timezone
            const deviceTz = (device as any).timezone || (device as any).settings?.timezone || 'Asia/Kolkata';
            const punchTime = deviceLocalToUTC(timeStr, deviceTz);
            if (isNaN(punchTime.getTime())) {
                console.warn(`[eSSL ADMS] Invalid time "${timeStr}" in line: ${line}`);
                continue;
            }

            console.log(`[eSSL ADMS] Punch: enrollId="${enrollId}" time="${timeStr}" event="${eventType}"`);

            try {
                const result = await BiometricAttendanceService.processPushPunch({
                    tenantId:        device.tenantId.toString(),
                    branchId,
                    deviceId:        device._id.toString(),
                    biometricUserId: enrollId,
                    punchTime,
                    eventType,
                    rawPayload:      { enrollId, timeStr, statusCode, rawLine: line },
                });
                if (result.created) {
                    console.log(`[eSSL ADMS] ✅ Attendance created: attendanceId=${result.attendanceId}`);
                } else {
                    console.log(`[eSSL ADMS] Skipped: ${result.reason}`);
                }
            } catch (err: any) {
                if (err?.code !== 11000) {
                    console.error(`[eSSL ADMS] processPushPunch error enrollId=${enrollId}:`, err.message);
                }
            }
        }

        // Update sync cursor to latest punch time seen
        if (lines.length > 0) {
            const lastParts = lines[lines.length - 1].split('\t');
            if (lastParts[1]) {
                await BiometricDevice.findByIdAndUpdate(device._id, {
                    lastSyncCursor: lastParts[1].trim(),
                    $inc: { totalRecordsFetched: lines.length },
                }).catch(() => {});
            }
        }

        res.type('text/plain').send('OK');
    }

    // GET /iclock/getrequest — device polls for pending commands
    async getRequest(req: Request, res: Response) {
        res.type('text/plain').send('OK');
    }

    // POST /iclock/devicecmd — device acknowledges a command
    async deviceCmd(req: Request, res: Response) {
        res.type('text/plain').send('OK');
    }
}

export default new EsslAdmsController();
