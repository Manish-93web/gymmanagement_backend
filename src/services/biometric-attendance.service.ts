import mongoose from 'mongoose';
import BiometricRawLog, { PunchEventType } from '../models/BiometricRawLog.model';
import BiometricMember from '../models/BiometricMember.model';
import BiometricDevice from '../models/BiometricDevice.model';
import BiometricSettings from '../models/BiometricSettings.model';
import Attendance from '../models/Attendance.model';
import Member from '../models/Member.model';

/**
 * Compute start and end of a calendar day in a given timezone, returned as UTC Date objects.
 * e.g. for Asia/Kolkata: day start = UTC 18:30 previous day, day end = UTC 18:29:59.999 current day
 */
function dayBoundsUTC(date: Date, tz: string): { start: Date; end: Date } {
    try {
        // Get the YYYY-MM-DD string in the target timezone
        const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date); // "2024-03-15"

        // Build midnight and end-of-day in that timezone, then convert to UTC
        const tzToUTC = (localStr: string): Date => {
            // Treat the string as UTC first, then correct for the tz offset
            const naive = new Date(localStr + 'Z');
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
        };

        return {
            start: tzToUTC(`${dayStr}T00:00:00`),
            end:   tzToUTC(`${dayStr}T23:59:59.999`),
        };
    } catch {
        // Fallback to UTC day bounds
        const start = new Date(date); start.setUTCHours(0, 0, 0, 0);
        const end   = new Date(date); end.setUTCHours(23, 59, 59, 999);
        return { start, end };
    }
}

export interface ProcessResult {
    created: boolean;
    attendanceId?: string;
    reason?: string;
}

export interface BatchProcessResult {
    created: number;
    unmatched: number;
    skipped: number;
}

class BiometricAttendanceService {

    /**
     * Process a single raw log into an attendance record.
     * Mirrors reference biometric-attendance.service.ts logic exactly.
     */
    async processRawLog(rawLog: any): Promise<ProcessResult> {
        const tenantId = rawLog.tenantId;

        // 1. Find member mapping by biometricUserId
        let mapping = await BiometricMember.findOne({
            tenantId,
            biometricUserId: rawLog.biometricUserId,
            active: true,
        });

        // Fallback: auto-match by member sNo (device enroll ID = member serial number)
        if (!mapping) {
            const sNoInt = parseInt(rawLog.biometricUserId, 10);
            if (!isNaN(sNoInt)) {
                const memberBySNo = await Member.findOne({ tenantId, sNo: sNoInt }).lean();
                if (memberBySNo) {
                    const autoMap = await BiometricMember.findOneAndUpdate(
                        { tenantId, biometricUserId: rawLog.biometricUserId },
                        {
                            $setOnInsert: {
                                memberId: (memberBySNo as any)._id,
                                tenantId,
                                biometricUserId: rawLog.biometricUserId,
                                active: true,
                                enrolledAt: new Date(),
                            },
                        },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );
                    console.log(`[BiometricAttendance] Auto-matched enrollId="${rawLog.biometricUserId}" to member sNo=${sNoInt}`);
                    if (autoMap?.active) {
                        return this.processRawLog(rawLog);
                    }
                }
            }
        }

        if (!mapping) {
            await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                processed: true, processedAt: new Date(), skippedReason: 'no_member_mapping',
            });
            console.log(`[BiometricAttendance] enrollId="${rawLog.biometricUserId}" has no active BiometricMember mapping`);
            return { created: false, reason: 'no_member_mapping' };
        }

        const memberId = mapping.memberId;

        // 2. Check member is active
        const member = await Member.findOne({ _id: memberId, tenantId }).lean();
        if (!member || !['active', 'trial'].includes((member as any).status)) {
            await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                processed: true, processedAt: new Date(), skippedReason: 'member_inactive',
            });
            return { created: false, reason: 'member_inactive' };
        }

        // 3. Load per-tenant settings (dedupe window, auto-checkout threshold)
        const tenantSettings = await BiometricSettings.findOne({
            tenantId,
            branchId: null,
        }).lean();
        const DEDUPE_MINUTES = (tenantSettings as any)?.dedupeWindowMinutes ?? 5;
        const AUTO_CHECKOUT_AFTER = (tenantSettings as any)?.autoCheckoutAfterMinutes ?? 480;

        // Dedupe: skip punches within DEDUPE_MINUTES of an existing record for same member
        const dedupeWindow = new Date(rawLog.punchTime.getTime() - DEDUPE_MINUTES * 60_000);

        const recentDupe = await Attendance.findOne({
            memberId,
            tenantId,
            checkInTime: { $gte: dedupeWindow, $lte: rawLog.punchTime },
        });
        if (recentDupe) {
            await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                processed: true, processedAt: new Date(), skippedReason: 'duplicate_punch',
                attendanceId: recentDupe._id,
            });
            return { created: false, reason: 'duplicate_punch' };
        }

        // 4. Find open check-in for today (no checkout yet) — use device timezone for day bounds
        const device = await BiometricDevice.findById(rawLog.deviceId).lean();
        const tz = (device as any)?.timezone || (device as any)?.settings?.timezone || 'Asia/Kolkata';
        const { start: todayStart, end: todayEnd } = dayBoundsUTC(rawLog.punchTime, tz);

        const openRecord = await Attendance.findOne({
            memberId,
            tenantId,
            checkInTime: { $gte: todayStart, $lte: todayEnd },
            checkOutTime: null,
        }).sort({ checkInTime: -1 });

        let attendanceId: string;

        if (!openRecord) {
            // No open record → check-in
            const att = await Attendance.create({
                tenantId,
                branchId: rawLog.branchId,
                memberId,
                checkInTime: rawLog.punchTime,
                method: 'biometric',
                source: 'biometric',
                deviceId: rawLog.deviceId?.toString(),
                biometricLogId: rawLog._id,
                isFraudulent: false,
                isOverstay:   false,
            });
            attendanceId = att._id.toString();
            console.log(`[BiometricAttendance] ✅ CHECK-IN "${(member as any).firstName} ${(member as any).lastName}" at ${rawLog.punchTime.toISOString()}`);

        } else {
            // Open record exists → check-out
            const gapMs = rawLog.punchTime.getTime() - new Date(openRecord.checkInTime).getTime();
            // Must be at least DEDUPE_MINUTES after check-in (matches reference)
            if (gapMs < DEDUPE_MINUTES * 60_000) {
                await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                    processed: true, processedAt: new Date(), skippedReason: 'too_soon_after_checkin',
                    attendanceId: openRecord._id,
                });
                return { created: false, reason: 'too_soon_after_checkin' };
            }
            const durationMinutes = Math.round(gapMs / 60_000);
            const isOverstay = durationMinutes > AUTO_CHECKOUT_AFTER;

            await Attendance.findByIdAndUpdate(openRecord._id, {
                checkOutTime: rawLog.punchTime,
                duration: durationMinutes,
                isOverstay,
                overstayMinutes: isOverstay ? durationMinutes - AUTO_CHECKOUT_AFTER : 0,
            });
            attendanceId = openRecord._id.toString();
            console.log(`[BiometricAttendance] ✅ CHECK-OUT "${(member as any).firstName} ${(member as any).lastName}" duration=${durationMinutes}m`);
        }

        // 5. Mark raw log processed
        await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
            processed: true, processedAt: new Date(),
            attendanceId: new mongoose.Types.ObjectId(attendanceId),
        });

        // 6. Update last punch on mapping
        await BiometricMember.updateOne(
            { _id: mapping._id },
            { $set: { lastPunchAt: rawLog.punchTime, lastPunchDeviceId: rawLog.deviceId } }
        );

        // 7. Emit real-time socket event
        this.emitPunchEvent(tenantId.toString(), rawLog.branchId?.toString(), {
            memberId: memberId.toString(),
            memberName: `${(member as any).firstName} ${(member as any).lastName}`,
            punchTime: rawLog.punchTime,
            type: openRecord ? 'checkout' : 'checkin',
            attendanceId,
        });

        return { created: true, attendanceId };
    }

    /**
     * Process a push punch from the ADMS device: save raw log then immediately process.
     * Called by essl-adms.controller for each ATTLOG line.
     */
    async processPushPunch(payload: {
        tenantId:        string;
        branchId?:       string;
        deviceId:        string;
        biometricUserId: string;
        punchTime:       Date;
        eventType?:      string;
        rawPayload?:     any;
    }): Promise<ProcessResult> {

        // Resolve branchId from device record (authoritative source, like reference)
        let resolvedBranchId = payload.branchId;
        if (!resolvedBranchId) {
            const device = await BiometricDevice.findById(payload.deviceId).lean();
            resolvedBranchId = (device as any)?.branchId?.toString();
        }

        // Save raw log (unique index deduplicates exact repeats)
        let rawLog: any;
        try {
            rawLog = await BiometricRawLog.create({
                tenantId:        new mongoose.Types.ObjectId(payload.tenantId),
                branchId:        resolvedBranchId ? new mongoose.Types.ObjectId(resolvedBranchId) : undefined,
                deviceId:        new mongoose.Types.ObjectId(payload.deviceId),
                biometricUserId: payload.biometricUserId,
                eventType:       (payload.eventType || 'check_in') as PunchEventType,
                punchTime:       payload.punchTime,
                deviceLocalTime: payload.rawPayload?.timeStr,
                rawPayload:      payload.rawPayload,
                processed:       false,
            });
        } catch (err: any) {
            if (err?.code === 11000) {
                return { created: false, reason: 'duplicate' };
            }
            throw err;
        }

        // Immediately process into attendance
        return this.processRawLog(rawLog);
    }

    /**
     * Batch-process all unprocessed logs for a device.
     */
    async processUnprocessedLogs(tenantId: string, deviceId: string): Promise<BatchProcessResult> {
        const logs = await BiometricRawLog.find({
            tenantId:  new mongoose.Types.ObjectId(tenantId),
            deviceId:  new mongoose.Types.ObjectId(deviceId),
            processed: false,
        }).sort({ punchTime: 1 });

        let created = 0, unmatched = 0, skipped = 0;
        for (const log of logs) {
            const result = await this.processRawLog(log);
            if (result.created) created++;
            else if (result.reason === 'no_member_mapping') unmatched++;
            else skipped++;
        }
        return { created, unmatched, skipped };
    }

    /**
     * After a BiometricMember mapping is created/updated, reset previously-skipped
     * logs for that biometricUserId so they get re-processed into attendance records.
     */
    async reprocessSkippedLogs(tenantId: string, biometricUserId: string): Promise<number> {
        const result = await BiometricRawLog.updateMany(
            {
                tenantId: new mongoose.Types.ObjectId(tenantId),
                biometricUserId,
                processed: true,
                skippedReason: { $in: ['no_member_mapping', 'member_not_enrolled', 'member_not_found'] },
            },
            { $set: { processed: false }, $unset: { skippedReason: '' } }
        );
        if (result.modifiedCount === 0) return 0;

        console.log(`[BiometricAttendance] Reset ${result.modifiedCount} skipped logs for enrollId="${biometricUserId}" — reprocessing now`);

        // Find device from any reset log and batch-reprocess
        const sampleLog = await BiometricRawLog.findOne({
            tenantId: new mongoose.Types.ObjectId(tenantId),
            biometricUserId,
            processed: false,
        });
        if (sampleLog) {
            await this.processUnprocessedLogs(tenantId, sampleLog.deviceId.toString());
        }
        return result.modifiedCount;
    }

    private emitPunchEvent(tenantId: string, branchId: string | undefined, payload: any) {
        try {
            const ws = (global as any).websocketService;
            if (ws) {
                if (branchId && ws.broadcastToBranch) {
                    ws.broadcastToBranch(branchId, 'biometric:punch', payload);
                }
                if (ws.broadcastToTenant) {
                    ws.broadcastToTenant(tenantId, 'attendance:update', payload);
                }
            }
        } catch { /* non-critical */ }
    }
}

export default new BiometricAttendanceService();
