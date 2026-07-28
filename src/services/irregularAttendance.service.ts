import mongoose from 'mongoose';
import Attendance from '../models/Attendance.model';
import Member from '../models/Member.model';

export type AttendancePattern = 'regular' | 'irregular' | 'at_risk' | 'lapsed';

export interface IrregularMemberRow {
    memberId: string;
    memberName: string;
    email: string;
    mobile: string;
    lastCheckIn: Date | null;
    daysSinceLastVisit: number;
    checkInsLast30Days: number;
    checkInsLast90Days: number;
    pattern: AttendancePattern;
}

interface QueryOptions {
    tenantId: string;
    branchId?: string;
    inactiveDaysThreshold?: number;   // days with no check-in to flag (default 14)
    lookbackDays?: number;            // window for "recent" check-ins (default 90)
}

/**
 * GAP 55: Irregular Member Attendance Detection Report
 *
 * Classification:
 *   - regular:   ≥ 8 check-ins in last 30 days
 *   - irregular: < 8 check-ins in last 30 days but at least 1
 *   - at_risk:   0 check-ins in last N days (inactiveDaysThreshold) but ≥1 in prior 60 days
 *   - lapsed:    0 check-ins in last 90 days (includes members who never returned)
 */
export async function getIrregularAttendanceReport(
    opts: QueryOptions
): Promise<IrregularMemberRow[]> {
    const {
        tenantId,
        branchId,
        inactiveDaysThreshold = 14,
        lookbackDays = 90,
    } = opts;

    const tenantObjId = new mongoose.Types.ObjectId(tenantId);
    const branchObjId = branchId ? new mongoose.Types.ObjectId(branchId) : null;

    const now = new Date();
    const d14Ago = new Date(now.getTime() - inactiveDaysThreshold * 86400_000);
    const d30Ago = new Date(now.getTime() - 30 * 86400_000);
    const d90Ago = new Date(now.getTime() - lookbackDays * 86400_000);

    const matchBase: Record<string, unknown> = { tenantId: tenantObjId };
    if (branchObjId) matchBase['branchId'] = branchObjId;

    // Aggregate attendance per member over the lookback window
    const stats = await Attendance.aggregate([
        { $match: { ...matchBase, checkInTime: { $gte: d90Ago } } },
        {
            $group: {
                _id: '$memberId',
                lastCheckIn: { $max: '$checkInTime' },
                checkInsLast90Days: { $sum: 1 },
                checkInsLast30Days: {
                    $sum: { $cond: [{ $gte: ['$checkInTime', d30Ago] }, 1, 0] },
                },
            },
        },
    ]);

    // Also get active members with ZERO check-ins in the window (lapsed)
    const memberIdsWithActivity = stats.map(s => s._id);

    const matchMembers: Record<string, unknown> = {
        tenantId: tenantObjId,
        status: { $in: ['active', 'trial'] },
    };
    if (branchObjId) matchMembers['branchId'] = branchObjId;

    const allActiveMembers = await Member.find(matchMembers, {
        _id: 1,
        firstName: 1,
        lastName: 1,
        email: 1,
        mobile: 1,
        lastCheckIn: 1,
    }).lean();

    // Build a lookup map from the attendance aggregation
    const statMap = new Map<string, typeof stats[number]>();
    for (const s of stats) statMap.set(s._id.toString(), s);

    const rows: IrregularMemberRow[] = [];

    for (const m of allActiveMembers) {
        const id = m._id.toString();
        const s = statMap.get(id);

        const lastCheckIn: Date | null = s?.lastCheckIn ?? m.lastCheckIn ?? null;
        const daysSince = lastCheckIn
            ? Math.floor((now.getTime() - lastCheckIn.getTime()) / 86400_000)
            : 9999;
        const checkInsLast30 = s?.checkInsLast30Days ?? 0;
        const checkInsLast90 = s?.checkInsLast90Days ?? 0;

        let pattern: AttendancePattern;
        if (checkInsLast30 >= 8) {
            pattern = 'regular';
        } else if (checkInsLast30 > 0) {
            pattern = 'irregular';
        } else if (daysSince <= inactiveDaysThreshold) {
            pattern = 'irregular';     // just went inactive
        } else if (checkInsLast90 > 0 || daysSince <= 90) {
            pattern = 'at_risk';
        } else {
            pattern = 'lapsed';
        }

        // Skip members who are regular — report focuses on non-regular
        if (pattern === 'regular') continue;

        rows.push({
            memberId: id,
            memberName: `${m.firstName} ${m.lastName}`,
            email: m.email,
            mobile: m.mobile,
            lastCheckIn,
            daysSinceLastVisit: daysSince === 9999 ? -1 : daysSince,
            checkInsLast30Days: checkInsLast30,
            checkInsLast90Days: checkInsLast90,
            pattern,
        });
    }

    // Sort: lapsed first, then at_risk, then irregular
    const ORDER: Record<AttendancePattern, number> = {
        lapsed: 0, at_risk: 1, irregular: 2, regular: 3,
    };
    rows.sort((a, b) => ORDER[a.pattern] - ORDER[b.pattern]);

    return rows;
}
