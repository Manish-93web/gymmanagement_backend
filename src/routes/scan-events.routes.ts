/**
 * Scan Events Routes — Real-time check-in popup for front desk UX
 *
 * REGISTRATION: Add to server.ts (do not modify server.ts yourself; ask the integrator):
 *   import scanEventsRoutes from './routes/scan-events.routes';
 *   app.use('/api/scan-events', scanEventsRoutes);
 *
 * NOTE on attendance integration: The WebSocket `scan:checkin` event is fired
 * from POST /scan-events/manual-lookup below. To also fire it on every biometric /
 * QR / hardware check-in, the attendance controller's checkIn / scanQR /
 * hardwareEntry handlers should call buildAndEmitScanEvent (extract to a shared
 * helper if needed). Do NOT modify attendance.routes.ts — wire it in
 * attendance.controller.ts instead.
 */

import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import Member from '../models/Member.model';
import Subscription from '../models/Subscription.model';
import Attendance from '../models/Attendance.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcStatus(daysRemaining: number): 'active' | 'expiring_soon' | 'expired' {
    if (daysRemaining < 0) return 'expired';
    if (daysRemaining <= 7) return 'expiring_soon';
    return 'active';
}

/**
 * Build the ScanEvent payload and broadcast it over WebSocket to the tenant room.
 * The same payload is returned so the HTTP response can carry it.
 */
function buildAndEmitScanEvent(
    tenantId: string,
    member: any,
    subscription: any | null,
    planName: string,
) {
    const now = new Date();
    const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
    const daysRemaining = endDate
        ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : -999;

    const payload = {
        event: 'scan:checkin' as const,
        memberId: member._id.toString(),
        memberName: `${member.firstName} ${member.lastName}`,
        phone: member.mobile || '',
        profilePhoto: member.personalInfo?.profilePicture || undefined,
        planName,
        daysRemaining,
        status: calcStatus(daysRemaining),
        checkInTime: now.toISOString(),
    };

    const ws = (global as any).websocketService;
    if (ws) {
        ws.broadcastToTenant(tenantId, 'scan:checkin', payload);
    }

    return payload;
}

// ─── POST /scan-events/manual-lookup ─────────────────────────────────────────
// Staff triggers a lookup by QR code value or memberId.
// Finds member + active subscription + plan name → calculates days remaining →
// fires `scan:checkin` WebSocket event to the tenant room → returns member details.
router.post(
    '/manual-lookup',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId as string;
            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant context missing' });
                return;
            }

            const { memberId, qrValue } = req.body as { memberId?: string; qrValue?: string };
            const lookupId = (memberId || qrValue || '').trim();

            if (!lookupId) {
                res.status(400).json({ success: false, message: 'memberId or qrValue is required' });
                return;
            }

            // Try ObjectId lookup first; fall back to membershipNumber
            let member: any = null;

            if (mongoose.Types.ObjectId.isValid(lookupId)) {
                member = await Member.findOne({
                    _id: new mongoose.Types.ObjectId(lookupId),
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                }).lean();
            }

            if (!member) {
                member = await Member.findOne({
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                    membershipNumber: lookupId,
                }).lean();
            }

            if (!member) {
                res.status(404).json({ success: false, message: 'Member not found' });
                return;
            }

            // Find the most recent active (or paused / frozen) subscription
            const subscription = await Subscription.findOne({
                tenantId: new mongoose.Types.ObjectId(tenantId),
                memberId: member._id,
                status: { $in: ['active', 'paused', 'frozen'] },
            })
                .sort({ endDate: -1 })
                .populate('planId', 'name')
                .lean();

            // Resolve plan name from subscription → member.planId → fallback
            let planName = 'No Plan';
            if (subscription?.planId) {
                planName = (subscription.planId as any).name || 'Unknown Plan';
            } else if (member.planId) {
                // Member schema stores planId ref to MembershipPlan but doesn't populate here;
                // do a lightweight populate manually
                const MembershipPlan = (await import('../models/MembershipPlan.model')).default;
                const plan = await MembershipPlan.findById(member.planId).select('name').lean();
                if (plan) planName = (plan as any).name || 'Unknown Plan';
            }

            const payload = buildAndEmitScanEvent(tenantId, member, subscription, planName);

            res.json({ success: true, data: payload });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

// ─── GET /scan-events/recent ──────────────────────────────────────────────────
// Last 20 check-in events for this tenant (Attendance, populated with member name + photo).
router.get(
    '/recent',
    requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
    async (req: Request, res: Response) => {
        try {
            const tenantId = (req as any).tenantId as string;
            if (!tenantId) {
                res.status(400).json({ success: false, message: 'Tenant context missing' });
                return;
            }

            const records = await Attendance.find({
                tenantId: new mongoose.Types.ObjectId(tenantId),
            })
                .sort({ checkInTime: -1 })
                .limit(20)
                .populate('memberId', 'firstName lastName personalInfo mobile')
                .lean();

            const formatted = records.map((rec: any) => {
                const m = rec.memberId;
                return {
                    attendanceId: rec._id,
                    memberId: m?._id ?? null,
                    memberName: m ? `${m.firstName} ${m.lastName}` : 'Unknown',
                    profilePhoto: m?.personalInfo?.profilePicture ?? null,
                    phone: m?.mobile ?? '',
                    checkInTime: rec.checkInTime,
                    checkOutTime: rec.checkOutTime ?? null,
                    method: rec.method,
                };
            });

            res.json({ success: true, data: formatted });
        } catch (err: any) {
            res.status(500).json({ success: false, message: err.message });
        }
    },
);

export default router;
