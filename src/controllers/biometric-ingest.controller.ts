import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import BiometricDevice from '../models/BiometricDevice.model';
import Branch from '../models/Branch.model';
import BiometricAttendanceService from '../services/biometric-attendance.service';
import { parsePunches, punchFromQuery, ParseResult } from '../utils/punch-parser';

/**
 * Brand-neutral punch intake, so any machine works, not only eSSL / ZKTeco ADMS:
 *   - Push by URL:  POST|GET /ingest/:token       (device or middleware calls it; token identifies the device)
 *   - File import:  POST /api/biometric/import    (USB export / vendor software CSV, Excel-as-CSV, JSON)
 * Both feed BiometricAttendanceService.processPushPunch, so members and trainers/staff behave identically.
 */

const MAX_PUNCHES = 5000;
const newToken = () => crypto.randomBytes(24).toString('hex');

interface IngestSummary {
    received: number;
    created: number;
    skipped: Record<string, number>;
    rejected: { row: number; reason: string }[];
}

async function ingest(device: any, parsed: ParseResult, source: string): Promise<IngestSummary> {
    const summary: IngestSummary = { received: parsed.punches.length, created: 0, skipped: {}, rejected: parsed.rejected.slice(0, 50) };

    let branchId: string | undefined = device.branchId?.toString();
    if (!branchId) {
        const fallback = await Branch.findOne({ tenantId: device.tenantId }).select('_id').lean();
        branchId = fallback?._id?.toString();
    }

    const punches = parsed.punches.slice(0, MAX_PUNCHES).sort((a, b) => a.punchTime.getTime() - b.punchTime.getTime());
    let latest: Date | null = null;
    for (const p of punches) {
        try {
            const r = await BiometricAttendanceService.processPushPunch({
                tenantId: device.tenantId.toString(),
                branchId,
                deviceId: device._id.toString(),
                biometricUserId: p.biometricUserId,
                punchTime: p.punchTime,
                eventType: p.eventType,
                rawPayload: { source, raw: p.raw },
            });
            if (r.created) summary.created++;
            else summary.skipped[r.reason || 'skipped'] = (summary.skipped[r.reason || 'skipped'] || 0) + 1;
            if (!latest || p.punchTime > latest) latest = p.punchTime;
        } catch (err: any) {
            summary.rejected.push({ row: 0, reason: `${p.biometricUserId}: ${err.message}` });
        }
    }
    if (parsed.punches.length > MAX_PUNCHES) {
        summary.rejected.push({ row: 0, reason: `only the first ${MAX_PUNCHES} punches were processed; send the rest in another request` });
    }

    const now = new Date();
    await BiometricDevice.findByIdAndUpdate(device._id, {
        lastPing: now, lastSeenAt: now, lastSyncAt: now, lastSync: now, status: 'active', consecutiveFailures: 0,
        $inc: { totalRecordsFetched: summary.created },
    }).catch(() => {});
    return summary;
}

const deviceTz = (d: any) => d.timezone || d.settings?.timezone || 'Asia/Kolkata';

class BiometricIngestController {
    /** Public. POST|GET /ingest/:token — body may be JSON, CSV/TSV, ADMS lines or XML; GET carries one punch in the query. */
    async receive(req: Request, res: Response) {
        try {
            const token = String(req.params.token || req.headers['x-ingest-token'] || '');
            const device: any = token.length >= 32
                ? await BiometricDevice.findOne({ ingestToken: token, isDeleted: { $ne: true } })
                : null;
            if (!device) { res.status(401).json({ success: false, message: 'Invalid ingest token' }); return; }
            if (device.isActive === false) { res.status(403).json({ success: false, message: 'Device is disabled' }); return; }

            const tz = deviceTz(device);
            const body = typeof req.body === 'string' ? req.body : (req.body && Object.keys(req.body).length ? req.body : '');
            let parsed = parsePunches(body, tz);
            if (!parsed.punches.length && Object.keys(req.query).length) parsed = punchFromQuery(req.query as any, tz);

            const summary = await ingest(device, parsed, 'ingest');
            res.json({ success: true, ...summary });
        } catch (err: any) {
            console.error('[Biometric ingest] failed:', err.message);
            res.status(500).json({ success: false, message: 'Could not process punches' });
        }
    }

    /** POST /api/biometric/import { deviceId, content | rows } — owner uploads a file exported from the machine. */
    async importFile(req: Request, res: Response, next: NextFunction) {
        try {
            const { deviceId, content, rows } = req.body || {};
            if (!deviceId) { res.status(400).json({ success: false, message: 'deviceId required' }); return; }
            const device: any = await BiometricDevice.findOne({ _id: String(deviceId), tenantId: req.tenantId, isDeleted: { $ne: true } });
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }

            const input = rows ?? content;
            if (!input || (typeof input === 'string' && !input.trim())) {
                res.status(400).json({ success: false, message: 'Paste or upload the punch file contents' }); return;
            }
            const parsed = parsePunches(input, deviceTz(device));
            if (!parsed.punches.length) {
                res.status(400).json({
                    success: false,
                    message: 'No punches could be read. Each row needs a user ID and a date/time.',
                    rejected: parsed.rejected.slice(0, 20),
                });
                return;
            }
            const summary = await ingest(device, parsed, 'import');
            res.json({ success: true, data: summary });
        } catch (error) { next(error); }
    }

    /** GET /api/biometric/devices/:id/connection — the URLs to give the machine / vendor software. */
    async connection(req: Request, res: Response, next: NextFunction) {
        try {
            const device: any = await BiometricDevice.findOne({ _id: String(req.params.id), tenantId: req.tenantId, isDeleted: { $ne: true } }).select('+ingestToken');
            if (!device) { res.status(404).json({ success: false, message: 'Device not found' }); return; }
            if (!device.ingestToken) {
                device.ingestToken = newToken();
                await BiometricDevice.updateOne({ _id: device._id }, { ingestToken: device.ingestToken });
            }
            res.json({ success: true, data: { ingestToken: device.ingestToken, serialNumber: device.serialNumber || null } });
        } catch (error) { next(error); }
    }

    /** POST /api/biometric/devices/:id/rotate-token — invalidate a leaked URL. */
    async rotateToken(req: Request, res: Response, next: NextFunction) {
        try {
            const token = newToken();
            const r = await BiometricDevice.updateOne({ _id: String(req.params.id), tenantId: req.tenantId, isDeleted: { $ne: true } }, { ingestToken: token });
            if (!r.matchedCount) { res.status(404).json({ success: false, message: 'Device not found' }); return; }
            res.json({ success: true, data: { ingestToken: token } });
        } catch (error) { next(error); }
    }
}

export default new BiometricIngestController();
