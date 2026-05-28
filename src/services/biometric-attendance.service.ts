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
        const dayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);

        const tzToUTC = (localStr: string): Date => {
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
        const start = new Date(date); start.setUTCHours(0, 0, 0, 0);
        const end   = new Date(date); end.setUTCHours(23, 59, 59, 999);
        return { start, end };
    }
}

/**
 * Normalize a biometric user ID: strip leading zeros for numeric IDs so
 * "001", "01", "1" all become "1". Non-numeric IDs are trimmed but unchanged.
 * This prevents "1" vs "001" mismatches between device and enrollment.
 */
function normalizeBiometricId(id: string): string {
    const trimmed = id.trim();
    const n = parseInt(trimmed, 10);
    return isNaN(n) ? trimmed : String(n);
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
     */
    async processRawLog(rawLog: any): Promise<ProcessResult> {
        const tenantId = rawLog.tenantId;
        const rawBioId  = String(rawLog.biometricUserId ?? '');
        const normBioId = normalizeBiometricId(rawBioId);

        // Build search variants: raw form + normalized form (deduped)
        const bioIdVariants = normBioId !== rawBioId ? [rawBioId, normBioId] : [rawBioId];

        // 1. Find member mapping by biometricUserId (try raw and normalized forms)
        let mapping = await BiometricMember.findOne({
            tenantId,
            biometricUserId: bioIdVariants.length === 1 ? bioIdVariants[0] : { $in: bioIdVariants },
            active: true,
        });

        // 2. Fallback: auto-match by member sNo if numeric
        if (!mapping) {
            const sNoInt = parseInt(normBioId, 10);
            if (!isNaN(sNoInt)) {
                const memberBySNo = await Member.findOne({ tenantId, sNo: sNoInt }).lean();
                if (memberBySNo) {
                    // Look for existing enrollment for this member (by memberId — authoritative key)
                    const existingForMember = await BiometricMember.findOne({
                        tenantId,
                        memberId: (memberBySNo as any)._id,
                    });

                    if (existingForMember) {
                        if (existingForMember.active) {
                            // Member is enrolled but with a different biometricUserId format.
                            // Update the stored biometricUserId to match what the device sends,
                            // so future punches hit the fast path directly.
                            if (existingForMember.biometricUserId !== normBioId) {
                                await BiometricMember.updateOne(
                                    { _id: existingForMember._id },
                                    { $set: { biometricUserId: normBioId } }
                                ).catch(() => {
                                    // Ignore — another member may already have normBioId; keep existing.
                                });
                            }
                            mapping = existingForMember;
                            console.log(
                                `[BiometricAttendance] Found enrollment for sNo=${sNoInt} via existing BiometricMember` +
                                ` (stored biometricUserId="${existingForMember.biometricUserId}", device sent "${rawBioId}")`
                            );
                        } else {
                            await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                                processed: true, processedAt: new Date(), skippedReason: 'member_inactive',
                            }).catch(() => {});
                            console.log(`[BiometricAttendance] Member sNo=${sNoInt} has inactive enrollment — skipping`);
                            return { created: false, reason: 'member_inactive' };
                        }
                    } else {
                        // No enrollment at all — create one (auto-enroll on first punch)
                        try {
                            const created = await BiometricMember.create({
                                tenantId,
                                memberId: (memberBySNo as any)._id,
                                biometricUserId: normBioId,
                                active: true,
                                enrolledAt: new Date(),
                                assignedDeviceIds: rawLog.deviceId ? [rawLog.deviceId] : [],
                            });
                            mapping = created;
                            console.log(
                                `[BiometricAttendance] Auto-enrolled member sNo=${sNoInt} with biometricUserId="${normBioId}"`
                            );
                        } catch (createErr: any) {
                            if (createErr?.code === 11000) {
                                // Race condition or duplicate — fetch whatever was just inserted
                                mapping = await BiometricMember.findOne({
                                    tenantId,
                                    memberId: (memberBySNo as any)._id,
                                }) ?? null;
                                if (mapping && !(mapping as any).active) {
                                    await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                                        processed: true, processedAt: new Date(), skippedReason: 'member_inactive',
                                    }).catch(() => {});
                                    return { created: false, reason: 'member_inactive' };
                                }
                            } else {
                                console.error(
                                    `[BiometricAttendance] Failed to auto-enroll sNo=${sNoInt}:`, createErr.message
                                );
                            }
                        }
                    }
                }
            }
        }

        if (!mapping) {
            await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                processed: true, processedAt: new Date(), skippedReason: 'no_member_mapping',
            }).catch(() => {});
            console.log(`[BiometricAttendance] No active mapping for biometricUserId="${rawBioId}" — add enrollment in Biometric page`);
            return { created: false, reason: 'no_member_mapping' };
        }

        const memberId = mapping.memberId;

        // 3. Check member is active
        const member = await Member.findOne({ _id: memberId, tenantId }).lean();
        if (!member || !['active', 'trial'].includes((member as any).status)) {
            await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                processed: true, processedAt: new Date(), skippedReason: 'member_inactive',
            }).catch(() => {});
            console.log(
                `[BiometricAttendance] Member "${(member as any)?.firstName} ${(member as any)?.lastName}" status="${(member as any)?.status}" — skipping`
            );
            return { created: false, reason: 'member_inactive' };
        }

        // 4. Load per-tenant settings
        const tenantSettings = await BiometricSettings.findOne({ tenantId }).lean();
        const DEDUPE_MINUTES    = (tenantSettings as any)?.dedupeWindowMinutes    ?? 5;
        const AUTO_CHECKOUT_AFTER = (tenantSettings as any)?.autoCheckoutAfterMinutes ?? 480;

        // 5. Resolve branchId — required by Attendance model
        let branchId = rawLog.branchId?.toString();
        if (!branchId) {
            // Fallback: look up device's branchId
            if (rawLog.deviceId) {
                const dev = await BiometricDevice.findById(rawLog.deviceId).select('branchId').lean();
                branchId = (dev as any)?.branchId?.toString();
            }
        }
        if (!branchId) {
            // Last resort: first branch for this tenant
            const BranchModel = (await import('../models/Branch.model')).default;
            const fb = await BranchModel.findOne({ tenantId }).select('_id').lean();
            branchId = (fb as any)?._id?.toString();
        }
        if (!branchId) {
            console.error(
                `[BiometricAttendance] No branchId found for tenant ${tenantId} — cannot create attendance`
            );
            await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                processed: true, processedAt: new Date(), skippedReason: 'no_branch',
            }).catch(() => {});
            return { created: false, reason: 'no_branch' };
        }

        const punchTime = rawLog.punchTime instanceof Date
            ? rawLog.punchTime
            : new Date(rawLog.punchTime);

        // 6. Dedupe: skip if another punch for this member is within DEDUPE_MINUTES
        const dedupeWindow = new Date(punchTime.getTime() - DEDUPE_MINUTES * 60_000);
        const recentDupe = await Attendance.findOne({
            memberId,
            tenantId,
            checkInTime: { $gte: dedupeWindow, $lte: punchTime },
        });
        if (recentDupe) {
            await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                processed: true, processedAt: new Date(), skippedReason: 'duplicate_punch',
                attendanceId: recentDupe._id,
            }).catch(() => {});
            console.log(
                `[BiometricAttendance] Dedupe: punch for "${(member as any).firstName}" within ${DEDUPE_MINUTES}m of existing record`
            );
            return { created: false, reason: 'duplicate_punch' };
        }

        // 7. Find open check-in for today (device timezone)
        const device = await BiometricDevice.findById(rawLog.deviceId).lean();
        const tz = (device as any)?.timezone || (device as any)?.settings?.timezone || 'Asia/Kolkata';
        const { start: todayStart, end: todayEnd } = dayBoundsUTC(punchTime, tz);

        const openRecord = await Attendance.findOne({
            memberId,
            tenantId,
            checkInTime: { $gte: todayStart, $lte: todayEnd },
            checkOutTime: null,
        }).sort({ checkInTime: -1 });

        let attendanceId: string;

        if (!openRecord) {
            // No open record → CHECK-IN
            const att = await Attendance.create({
                tenantId,
                branchId,
                memberId,
                checkInTime: punchTime,
                method: 'biometric',
                source: 'biometric',
                deviceId: rawLog.deviceId?.toString(),
                biometricLogId: rawLog._id,
                isFraudulent: false,
                isOverstay:   false,
                notes: '',
            });
            attendanceId = att._id.toString();
            console.log(
                `[BiometricAttendance] ✅ CHECK-IN "${(member as any).firstName} ${(member as any).lastName}"` +
                ` at ${punchTime.toISOString()} (attendanceId=${attendanceId})`
            );
        } else {
            // Open record → CHECK-OUT
            const gapMs = punchTime.getTime() - new Date(openRecord.checkInTime).getTime();
            if (gapMs < DEDUPE_MINUTES * 60_000) {
                await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
                    processed: true, processedAt: new Date(), skippedReason: 'too_soon_after_checkin',
                    attendanceId: openRecord._id,
                }).catch(() => {});
                return { created: false, reason: 'too_soon_after_checkin' };
            }
            const durationMinutes = Math.round(gapMs / 60_000);
            const isOverstay = durationMinutes > AUTO_CHECKOUT_AFTER;

            await Attendance.findByIdAndUpdate(openRecord._id, {
                checkOutTime:   punchTime,
                duration:       durationMinutes,
                isOverstay,
                overstayMinutes: isOverstay ? durationMinutes - AUTO_CHECKOUT_AFTER : 0,
            });
            attendanceId = openRecord._id.toString();
            console.log(
                `[BiometricAttendance] ✅ CHECK-OUT "${(member as any).firstName} ${(member as any).lastName}"` +
                ` duration=${durationMinutes}m`
            );
        }

        // 8. Mark raw log processed
        await BiometricRawLog.findByIdAndUpdate(rawLog._id, {
            processed: true, processedAt: new Date(),
            attendanceId: new mongoose.Types.ObjectId(attendanceId),
        }).catch(() => {});

        // 9. Update last punch on mapping
        await BiometricMember.updateOne(
            { _id: mapping._id },
            { $set: { lastPunchAt: punchTime, lastPunchDeviceId: rawLog.deviceId } }
        ).catch(() => {});

        // 10. Emit real-time socket event
        this.emitPunchEvent(tenantId.toString(), branchId, {
            memberId: memberId.toString(),
            memberName: `${(member as any).firstName} ${(member as any).lastName}`,
            punchTime,
            type: openRecord ? 'checkout' : 'checkin',
            attendanceId,
        });

        return { created: true, attendanceId };
    }

    /**
     * Process a push punch from the ADMS device: save raw log then immediately process.
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

        // Normalize biometricUserId on arrival
        const biometricUserId = normalizeBiometricId(payload.biometricUserId);

        // Resolve branchId from device record if not provided
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
                biometricUserId,
                eventType:       (payload.eventType || 'check_in') as PunchEventType,
                punchTime:       payload.punchTime,
                deviceLocalTime: payload.rawPayload?.timeStr,
                rawPayload:      payload.rawPayload,
                processed:       false,
            });
            console.log(
                `[BiometricAttendance] Raw log saved: biometricUserId="${biometricUserId}"` +
                ` punchTime=${payload.punchTime.toISOString()} deviceId=${payload.deviceId}`
            );
        } catch (err: any) {
            if (err?.code === 11000) {
                console.log(`[BiometricAttendance] Duplicate punch ignored: biometricUserId="${biometricUserId}" time=${payload.punchTime.toISOString()}`);
                return { created: false, reason: 'duplicate' };
            }
            throw err;
        }

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

        console.log(`[BiometricAttendance] Processing ${logs.length} unprocessed logs for device ${deviceId}`);

        let created = 0, unmatched = 0, skipped = 0;
        for (const log of logs) {
            try {
                const result = await this.processRawLog(log);
                if (result.created) created++;
                else if (result.reason === 'no_member_mapping') unmatched++;
                else skipped++;
            } catch (err: any) {
                console.error(`[BiometricAttendance] Error processing log ${log._id}:`, err.message);
                skipped++;
            }
        }
        console.log(`[BiometricAttendance] Batch done: created=${created} unmatched=${unmatched} skipped=${skipped}`);
        return { created, unmatched, skipped };
    }

    /**
     * After a BiometricMember mapping is created/updated, reset previously-skipped
     * logs for that biometricUserId so they get re-processed.
     */
    async reprocessSkippedLogs(tenantId: string, biometricUserId: string): Promise<number> {
        const normId = normalizeBiometricId(biometricUserId);
        const searchIds = normId !== biometricUserId ? [biometricUserId, normId] : [biometricUserId];

        const result = await BiometricRawLog.updateMany(
            {
                tenantId: new mongoose.Types.ObjectId(tenantId),
                biometricUserId: { $in: searchIds },
                processed: true,
                skippedReason: { $in: ['no_member_mapping', 'member_not_enrolled', 'member_not_found', 'no_branch'] },
            },
            { $set: { processed: false }, $unset: { skippedReason: '' } }
        );
        if (result.modifiedCount === 0) return 0;

        console.log(
            `[BiometricAttendance] Reset ${result.modifiedCount} skipped logs for enrollId="${biometricUserId}" — reprocessing`
        );

        const sampleLog = await BiometricRawLog.findOne({
            tenantId: new mongoose.Types.ObjectId(tenantId),
            biometricUserId: { $in: searchIds },
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
