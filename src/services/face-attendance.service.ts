import mongoose from 'mongoose';
import StaffFace from '../models/StaffFace.model';
import StaffAttendance from '../models/StaffAttendance.model';
import Tenant from '../models/Tenant.model';
import User from '../models/User.model';
import Trainer from '../models/Trainer.model';
import StaffAttendanceService, { StaffAttendanceError } from './staff-attendance.service';
import { minutesToHHMM } from '../utils/tz.utils';

const DIM = 128;
/** Two captures of the same face are normally well under 0.5 apart; different people are usually above 0.6. */
export const MATCH_DISTANCE = 0.5;
/** Enrolment captures (straight and slightly turned) must all be one person. */
const SAME_PERSON_SPREAD = 0.6;
/** A new face this close to someone else's is the same person registered twice. */
const DUPLICATE_DISTANCE = 0.4;
const MAX_WRONG_IN_A_ROW = 5;
const LOCK_MINUTES = 10;
const PAYABLE_ROLES = ['trainer', 'staff', 'branch_manager', 'accountant'];

export class FaceError extends Error {
    constructor(public status: number, message: string, public code?: string) { super(message); }
}

const toId = (v: mongoose.Types.ObjectId | string) => new mongoose.Types.ObjectId(String(v));

export function distance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < DIM; i++) { const d = a[i] - b[i]; sum += d * d; }
    return Math.sqrt(sum);
}

/** A descriptor must be 128 finite numbers of the size a face template has. */
export function validDescriptor(d: unknown): d is number[] {
    return Array.isArray(d) && d.length === DIM && d.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 2);
}

class FaceAttendanceService {
    /** Everyone who can check in by face, with who is registered and who is in right now. */
    async roster(tenantId: string) {
        const tId = toId(tenantId);
        const [tenant, users, faces, tz] = await Promise.all([
            Tenant.findById(tId).select('name').lean(),
            User.find({ tenantId: tId, role: { $in: PAYABLE_ROLES as any }, isActive: true }).select('firstName lastName role').sort({ firstName: 1 }).lean(),
            StaffFace.find({ tenantId: tId }).select('staffId lockedUntil').lean(),
            StaffAttendanceService.dayWindow(tId, new Date()),
        ]);
        // a trainer whose profile was removed no longer checks in
        const removed = new Set((await Trainer.find({ tenantId: tId, isActive: false }).select('userId').lean()).map((t: any) => String(t.userId)));
        const faceByStaff = new Map(faces.map((f: any) => [String(f.staffId), f]));
        const records = await StaffAttendance.find({ tenantId: tId, date: { $gte: tz.start, $lte: tz.end } }).lean();
        const byStaff = new Map(records.map(r => [String(r.staffId), r]));
        const now = new Date();

        const people = await Promise.all(users.filter((u: any) => !removed.has(String(u._id))).map(async (u: any) => {
            const sched = await StaffAttendanceService.schedule(tId, u._id);
            let r: any = byStaff.get(String(u._id));
            // after midnight, someone on a late shift is still on yesterday's record
            if (!r) r = (await StaffAttendanceService.overnightRecordFor(tId, u._id, now, sched))?.record;
            const rules = sched.at(tz.start);
            const face: any = faceByStaff.get(String(u._id));
            return {
                staffId: String(u._id),
                name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Staff',
                role: u.role,
                faceEnrolled: !!face,
                faceLocked: !!(face?.lockedUntil && face.lockedUntil > now),
                state: !r ? 'not_in' : r.clockOut ? 'checked_out' : 'checked_in',
                clockIn: r?.clockIn ?? null,
                clockOut: r?.clockOut ?? null,
                shiftTime: rules.segments.length ? rules.segments.map(g => `${minutesToHHMM(g.start)}-${minutesToHHMM(g.end)}`).join(', ') : null,
                offDay: rules.offDay,
            };
        }));
        return { gymName: (tenant as any)?.name ?? '', timezone: tz.timezone, people };
    }

    private async staffMember(tenantId: string, staffId: string) {
        const user: any = await User.findOne({ _id: staffId, tenantId, role: { $in: PAYABLE_ROLES as any }, isActive: true }).select('firstName lastName branchId').lean();
        if (!user) throw new FaceError(404, 'Staff member not found');
        return user;
    }

    /** Save a person's face captures (replacing any earlier ones). */
    async enroll(tenantId: string, staffId: string, descriptors: unknown, enrolledBy?: string) {
        if (!Array.isArray(descriptors) || descriptors.length < 3 || descriptors.length > 8 || !descriptors.every(validDescriptor)) {
            throw new FaceError(400, 'We need 3 to 8 clear face captures. Please try again.');
        }
        const captures = descriptors as number[][];
        await this.staffMember(tenantId, staffId);

        for (let i = 0; i < captures.length; i++) {
            for (let j = i + 1; j < captures.length; j++) {
                if (distance(captures[i], captures[j]) > SAME_PERSON_SPREAD) {
                    throw new FaceError(400, 'The captures do not look like the same person. Please keep one face in front of the camera and try again.', 'NOT_SAME_PERSON');
                }
            }
        }

        // Someone else already registered with this face?
        const others: any[] = await StaffFace.find({ tenantId: toId(tenantId), staffId: { $ne: toId(staffId) } }).select('staffId descriptors').lean();
        for (const other of others) {
            const close = (other.descriptors as number[][]).some(d => captures.some(c => distance(d, c) < DUPLICATE_DISTANCE));
            if (close) {
                const who: any = await User.findById(other.staffId).select('firstName lastName').lean();
                throw new FaceError(409, `This face is already registered for ${`${who?.firstName ?? ''} ${who?.lastName ?? ''}`.trim() || 'another staff member'}.`, 'DUPLICATE_FACE');
            }
        }

        await StaffFace.findOneAndUpdate(
            { tenantId: toId(tenantId), staffId: toId(staffId) },
            { $set: { descriptors: captures, enrolledBy, enrolledAt: new Date(), failedAttempts: 0 }, $unset: { lockedUntil: 1 } },
            { upsert: true }
        );
    }

    async remove(tenantId: string, staffId: string) {
        const res = await StaffFace.deleteOne({ tenantId: toId(tenantId), staffId: toId(staffId) });
        if (!res.deletedCount) throw new FaceError(404, 'No face is registered for this person');
    }

    /** Owner unlocks someone who was locked out after wrong attempts. */
    async unlock(tenantId: string, staffId: string) {
        await StaffFace.updateOne({ tenantId: toId(tenantId), staffId: toId(staffId) }, { $set: { failedAttempts: 0 }, $unset: { lockedUntil: 1 } });
    }

    /** Is this face the registered person? Counts wrong attempts and pauses after too many. */
    private async verify(tenantId: string, staffId: string, descriptor: unknown): Promise<number> {
        if (!validDescriptor(descriptor)) throw new FaceError(400, 'No clear face was received. Please try again.');
        const face: any = await StaffFace.findOne({ tenantId: toId(tenantId), staffId: toId(staffId) }).select('+descriptors').lean();
        if (!face) throw new FaceError(409, 'Face is not registered yet. Ask the owner to register it.', 'NOT_ENROLLED');
        if (face.lockedUntil && face.lockedUntil > new Date()) {
            const mins = Math.max(1, Math.ceil((face.lockedUntil.getTime() - Date.now()) / 60_000));
            throw new FaceError(429, `Too many wrong attempts. Try again in ${mins} minute(s), or ask the owner to unlock.`, 'LOCKED');
        }

        const best = Math.min(...(face.descriptors as number[][]).map(d => distance(d, descriptor)));
        if (best <= MATCH_DISTANCE) {
            await StaffFace.updateOne({ _id: face._id }, { $set: { failedAttempts: 0, lastMatchAt: new Date() }, $unset: { lockedUntil: 1 } });
            return best;
        }
        const failed = (face.failedAttempts ?? 0) + 1;
        await StaffFace.updateOne({ _id: face._id }, {
            $set: failed >= MAX_WRONG_IN_A_ROW
                ? { failedAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
                : { failedAttempts: failed },
        });
        throw new FaceError(401, failed >= MAX_WRONG_IN_A_ROW
            ? `Face did not match. Face check-in is paused for ${LOCK_MINUTES} minutes for this person.`
            : 'Face did not match. Please try again.', 'NO_MATCH');
    }

    /** Verify the face, then record the check-in or check-out at the server's time. */
    async punch(tenantId: string, staffId: string, action: 'check_in' | 'check_out', descriptor: unknown) {
        if (action !== 'check_in' && action !== 'check_out') throw new FaceError(400, 'Choose check in or check out');
        const user = await this.staffMember(tenantId, staffId);
        const score = await this.verify(tenantId, staffId, descriptor);

        try {
            const record: any = action === 'check_in'
                ? await StaffAttendanceService.clockIn(tenantId, staffId, user.branchId, new Date(), 'face')
                : await StaffAttendanceService.clockOut(tenantId, staffId, new Date(), 'face');
            return {
                name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim(),
                action,
                at: action === 'check_in' ? record.clockIn : record.clockOut,
                hoursWorked: record.hoursWorked ?? null,
                status: record.status,
                score: Math.round(score * 1000) / 1000,
            };
        } catch (err: any) {
            if (err instanceof StaffAttendanceError) throw new FaceError(err.status === 404 ? 409 : err.status, err.message, 'ATTENDANCE_RULE');
            throw err;
        }
    }
}

export default new FaceAttendanceService();
