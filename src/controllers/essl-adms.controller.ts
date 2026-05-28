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
 */
function deviceLocalToUTC(timeStr: string, tz: string): Date {
    const naive = new Date(timeStr.replace(' ', 'T') + 'Z');
    if (isNaN(naive.getTime())) return new Date(NaN);

    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
        }).formatToParts(naive);
        const m: Record<string, string> = {};
        for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value;
        const tzInterpretedAsUTC = new Date(
            `${m.year}-${m.month}-${m.day}T${m.hour}:${m.minute}:${m.second}Z`
        );
        const offsetMs = tzInterpretedAsUTC.getTime() - naive.getTime();
        return new Date(naive.getTime() - offsetMs);
    } catch {
        return naive;
    }
}

const PLACEHOLDER_SN = /^(TEST|PING|test|ping|0+)$/i;

const NO_SN_FILTER = [
    { serialNumber: { $exists: false } },
    { serialNumber: null },
    { serialNumber: '' },
    { serialNumber: { $regex: '^(TEST|PING|test|ping|0+)$', $options: 'i' } },
];

/**
 * Resolve device by SN (+ optional IP for smarter matching).
 * Priority:
 *   1. Exact serialNumber match
 *   2. deviceId match
 *   3. IP-address match on an unassigned device (any brand, matching IP)
 *   4. Blind auto-associate: most-recently-created unassigned device (eSSL first, then any brand)
 */
async function resolveDevice(sn: string, deviceIP?: string) {
    if (!sn) return null;

    const now = new Date();
    const onlineUpdate = { lastPing: now, lastSeenAt: now, status: 'active', consecutiveFailures: 0 };

    // 1. Fast path: exact serialNumber match
    if (!PLACEHOLDER_SN.test(sn)) {
        let device = await BiometricDevice.findOneAndUpdate(
            { serialNumber: sn, isDeleted: false },
            onlineUpdate,
            { new: true }
        ).catch(() => null) as any;
        if (device) return device;

        // 2. deviceId matches SN
        device = await BiometricDevice.findOneAndUpdate(
            { deviceId: sn, isDeleted: false },
            onlineUpdate,
            { new: true }
        ).catch(() => null) as any;
        if (device) return device;
    }

    // 3. IP-based match: prefer device whose configured IP matches the request IP
    if (deviceIP) {
        const normalizedIP = deviceIP.replace(/^::ffff:/, '');
        const deviceByIP = await BiometricDevice.findOneAndUpdate(
            { ipAddress: normalizedIP, isDeleted: false, $or: NO_SN_FILTER } as any,
            { serialNumber: sn, ...onlineUpdate },
            { new: true, sort: { createdAt: -1 } }
        ).catch(() => null) as any;
        if (deviceByIP) {
            console.log(
                `[eSSL ADMS] IP-matched SN="${sn}" → device "${deviceByIP.deviceName || deviceByIP.name}"` +
                ` (ip=${normalizedIP}, _id=${deviceByIP._id})`
            );
            return deviceByIP;
        }
    }

    // 4. Blind auto-associate: try eSSL first (case-insensitive), then any brand
    for (const extraFilter of [
        { deviceBrand: { $regex: '^essl$', $options: 'i' } } as any,
        null,  // any brand (widest fallback)
    ]) {
        const baseQuery: any = { isDeleted: false, $or: NO_SN_FILTER };
        if (extraFilter) Object.assign(baseQuery, extraFilter);

        const candidates = await BiometricDevice.find(baseQuery)
            .select('_id deviceName name tenantId').lean().catch(() => []);

        if (candidates.length === 0) continue;

        if (candidates.length > 1) {
            console.warn(
                `[eSSL ADMS] SN="${sn}" — ${candidates.length} unassigned devices found.` +
                ` Auto-associating with the newest one. Enter the device Serial Number to avoid ambiguity.` +
                ` Candidates: ${candidates.map((c: any) => `${c.deviceName || c.name} (${c._id})`).join(', ')}`
            );
        }

        const device = await BiometricDevice.findOneAndUpdate(
            baseQuery,
            { serialNumber: sn, ...onlineUpdate },
            { new: true, sort: { createdAt: -1 } }
        ).catch(() => null) as any;

        if (device) {
            console.log(
                `[eSSL ADMS] Auto-associated SN="${sn}" with device "${device.deviceName || device.name}"` +
                ` (_id=${device._id}, brand=${device.deviceBrand || device.vendor || 'unknown'})`
            );
            return device;
        }
    }

    console.warn(`[eSSL ADMS] Unknown SN="${sn}" — no device found. Add the device in Biometric Devices page first.`);
    return null;
}

class EsslAdmsController {

    // GET /iclock/cdata — device heartbeat
    async heartbeat(req: Request, res: Response) {
        const sn = (req.query.SN as string) || (req.query.sn as string) || '';
        const deviceIP = (req.socket?.remoteAddress || req.ip || '').replace(/^::ffff:/, '');
        console.log(`[eSSL ADMS] GET heartbeat SN="${sn}" from ${deviceIP}`);

        if (!sn) { res.type('text/plain').send('ERROR'); return; }
        const device = await resolveDevice(sn, deviceIP);

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
        const sn       = (req.query.SN as string) || (req.query.sn as string) || '';
        const deviceIP = (req.socket?.remoteAddress || req.ip || '').replace(/^::ffff:/, '');

        // Read body early — needed for table detection and ATTLOG extraction
        const rawBody: string = typeof req.body === 'string' ? req.body
            : (req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : '');

        // Log every POST before any early return
        console.log(
            `[eSSL ADMS] POST SN="${sn}" from ${deviceIP} ` +
            `query="${JSON.stringify(req.query)}" ` +
            `content-type="${req.headers['content-type']}" ` +
            `body-len=${rawBody.length} ` +
            `body-preview="${rawBody.slice(0, 400)}"`
        );

        // Detect table: query string takes priority, then URL-encoded body
        let table = ((req.query.table as string) || '').toUpperCase();
        if (!table && rawBody) {
            const m = rawBody.match(/(?:^|&|\r?\n)table=([^\s&\r\n]+)/i);
            if (m) table = m[1].toUpperCase();
        }
        console.log(`[eSSL ADMS] POST SN="${sn}" resolved table="${table}"`);

        const device = await resolveDevice(sn, deviceIP);

        // Only process ATTLOG; acknowledge everything else silently
        if (table !== 'ATTLOG') {
            console.log(`[eSSL ADMS] POST SN="${sn}" — table="${table}" is not ATTLOG, acknowledging silently`);
            res.type('text/plain').send('OK');
            return;
        }

        if (!device) {
            console.warn(
                `[eSSL ADMS] POST SN="${sn}" — no device found. ` +
                `Add the device in Biometric Devices page (set brand=essl and enter IP address for best matching).`
            );
            res.type('text/plain').send('OK');
            return;
        }

        // Resolve branchId
        let branchId: string | null = (device as any).branchId?.toString() ?? null;
        if (!branchId) {
            const fallback = await Branch.findOne({ tenantId: device.tenantId }).select('_id').lean();
            branchId = fallback?._id?.toString() ?? null;
            if (branchId) {
                await BiometricDevice.findByIdAndUpdate(device._id, { branchId }).catch(() => {});
            } else {
                console.warn(`[eSSL ADMS] SN="${sn}" — no branch found for tenant ${device.tenantId}, processing without branchId`);
            }
        }

        console.log(
            `[eSSL ADMS] POST SN="${sn}" device="${(device as any).deviceName || (device as any).name}"` +
            ` tenant=${device.tenantId} branch=${branchId}`
        );

        // Extract ATTLOG text from body
        // Format A: URL-encoded — table=ATTLOG&Stamp=N&ATTLOG=line1%0Aline2
        // Format B: Key=Value lines — table=ATTLOG\r\nATTLOG=line1\r\nline2
        // Format C: Raw lines only — 1\tTIME\t0\t...\n2\tTIME\t0\t...
        let attlogText = rawBody;
        if (rawBody.includes('ATTLOG=')) {
            try {
                const params = new URLSearchParams(rawBody);
                const extracted = params.get('ATTLOG');
                if (extracted && extracted.length > 0) {
                    attlogText = extracted;
                }
            } catch { /* keep attlogText = rawBody */ }
        }

        // Parse ATTLOG lines.
        // A valid ATTLOG line has at least: ENROLLID\tDATETIME\tSTATUS (≥ 2 tabs = ≥ 3 fields).
        // We accept lines with ≥ 1 tab (≥ 2 fields) so minimal firmware variants still work.
        // Header lines like "table=ATTLOG", "Stamp=9999" have 0 tabs and are skipped.
        const lines = attlogText
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(l => l && (l.match(/\t/g) || []).length >= 1);

        console.log(`[eSSL ADMS] SN="${sn}" — ${lines.length} candidate ATTLOG line(s) after tab filter`);

        let processedCount = 0;
        for (const line of lines) {
            const parts = line.split('\t');
            if (parts.length < 2) continue; // need at least enrollId + time

            // Strip "ATTLOG=" prefix from first field (some firmware embeds: ATTLOG=1\t...)
            let enrollId = parts[0].trim();
            if (/^ATTLOG=/i.test(enrollId)) {
                enrollId = enrollId.slice(7).trim();
            }

            // Skip header/metadata lines that got through (e.g. "table=ATTLOG" has a tab in some variants)
            if (/^(table|stamp|sn|device|version)=/i.test(enrollId)) continue;
            if (!enrollId || enrollId === '') continue;

            const timeStr    = parts[1].trim();
            const statusCode = parts.length >= 3 ? parseInt(parts[2].trim(), 10) : 0;
            const eventType  = esslStatusToEventType(isNaN(statusCode) ? 0 : statusCode);

            const deviceTz  = (device as any).timezone || (device as any).settings?.timezone || 'Asia/Kolkata';
            const punchTime = deviceLocalToUTC(timeStr, deviceTz);
            if (isNaN(punchTime.getTime())) {
                console.warn(`[eSSL ADMS] Invalid time "${timeStr}" in line: ${line}`);
                continue;
            }

            console.log(
                `[eSSL ADMS] Processing punch: enrollId="${enrollId}" time="${timeStr}"` +
                ` (UTC=${punchTime.toISOString()}) event="${eventType}"`
            );

            try {
                const result = await BiometricAttendanceService.processPushPunch({
                    tenantId:        device.tenantId.toString(),
                    branchId:        branchId ?? undefined,
                    deviceId:        device._id.toString(),
                    biometricUserId: enrollId,
                    punchTime,
                    eventType,
                    rawPayload:      { enrollId, timeStr, statusCode, rawLine: line },
                });
                processedCount++;
                if (result.created) {
                    console.log(
                        `[eSSL ADMS] ✅ Attendance created for enrollId="${enrollId}": attendanceId=${result.attendanceId}`
                    );
                } else {
                    console.log(`[eSSL ADMS] Punch enrollId="${enrollId}" skipped: ${result.reason}`);
                }
            } catch (err: any) {
                console.error(`[eSSL ADMS] processPushPunch error enrollId="${enrollId}":`, err.message);
            }
        }

        // Advance sync cursor so next heartbeat only asks for newer records
        if (lines.length > 0) {
            for (let i = lines.length - 1; i >= 0; i--) {
                const lastParts = lines[i].split('\t');
                if (lastParts[1]?.trim()) {
                    await BiometricDevice.findByIdAndUpdate(device._id, {
                        lastSyncCursor: lastParts[1].trim(),
                        $inc: { totalRecordsFetched: processedCount },
                    }).catch(() => {});
                    break;
                }
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
