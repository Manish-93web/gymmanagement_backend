import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Payment from '../models/Payment.model';
import MembershipPlan from '../models/MembershipPlan.model';

const NO_TENANT = (res: Response) =>
    res.status(400).json({ success: false, message: 'Tenant context required' });

// Track seeding status per tenant in-memory (lightweight; no dedicated model needed)
const seedStatus: Record<string, { seeded: boolean; lastSeeded: Date }> = {};

const DEMO_MEMBER_NAMES = [
    { firstName: 'Demo', lastName: 'Member 1' },
    { firstName: 'Demo', lastName: 'Member 2' },
    { firstName: 'Demo', lastName: 'Member 3' },
    { firstName: 'Demo', lastName: 'Member 4' },
    { firstName: 'Demo', lastName: 'Member 5' },
];

async function performSeed(tenantId: string, branchId: string, userId: string) {
    // 1. Ensure at least one membership plan exists
    let plan = await MembershipPlan.findOne({ tenantId, isActive: true });
    if (!plan) {
        plan = await MembershipPlan.create({
            tenantId,
            branchId,
            name:          'Demo Basic Plan',
            description:   'Auto-created demo plan',
            type:          'time_based',
            duration:      'monthly',
            durationValue: 1,
            pricing: {
                basePrice:       999,
                taxRate:         18,
                discountPercent: 0,
                finalPrice:      999,
            },
            features: {
                gymAccess:             true,
                groupClasses:          false,
                personalTraining:      false,
                onlineClasses:         false,
                dietPlan:              false,
                lockerFacility:        false,
                freezeAllowed:         false,
                branchTransferAllowed: false,
            },
            addOns:          [],
            isFamilyPlan:    false,
            isActive:        true,
            currentMembers:  0,
            metadata:        { isDemo: true },
        } as any);
    }

    const now        = new Date();
    const expiry     = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
    const createdMembers: any[] = [];

    // 2. Create 5 demo members
    for (let i = 0; i < DEMO_MEMBER_NAMES.length; i++) {
        const { firstName, lastName } = DEMO_MEMBER_NAMES[i];
        const membershipNumber = `DEMO-${tenantId.slice(-4).toUpperCase()}-${Date.now()}-${i}`;

        const member = await Member.create({
            tenantId,
            branchId,
            firstName,
            lastName,
            email:            `${membershipNumber.toLowerCase()}@demo.local`,
            mobile:           `900000000${i}`,
            membershipNumber,
            planId:           plan._id,
            membershipStart:  now,
            membershipExpiry: expiry,
            status:           'active',
            statusHistory: [{
                status:    'active',
                changedAt: now,
                changedBy: new mongoose.Types.ObjectId(userId),
                reason:    'Demo seed',
            }],
            personalInfo: {
                dateOfBirth: new Date('1990-01-01'),
                gender:      'male',
            },
            healthInfo: {
                medicalConditions: [],
                allergies:         [],
                medications:       [],
                injuries:          [],
                doctorClearance:   false,
            },
            measurements:          [],
            transformationGallery: [],
            documents:             [],
            goals:                 ['fitness'],
            tags:                  ['demo'],
            notes:                 'Demo member — created by seed',
            walletBalance:         0,
            metadata:              { isDemo: true },
        } as any);

        createdMembers.push(member);
    }

    // 3. Create 10 attendance records spread across members
    for (let i = 0; i < 10; i++) {
        const member       = createdMembers[i % createdMembers.length];
        const checkInTime  = new Date(now.getTime() - i * 24 * 60 * 60 * 1000); // one per past day
        const checkOutTime = new Date(checkInTime.getTime() + 60 * 60 * 1000);  // +1 hour

        await Attendance.create({
            tenantId,
            branchId,
            memberId:      member._id,
            checkInTime,
            checkOutTime,
            duration:      60,
            method:        'manual',
            isOverstay:    false,
            isFraudulent:  false,
            notes:         'Demo attendance',
            metadata:      { isDemo: true },
        } as any);
    }

    // 4. Create 5 payment records (one per demo member)
    for (let i = 0; i < createdMembers.length; i++) {
        const member        = createdMembers[i];
        const invoiceNumber = `INV-DEMO-${tenantId.slice(-4).toUpperCase()}-${Date.now()}-${i}`;

        await Payment.create({
            tenantId,
            branchId,
            memberId:    member._id,
            invoiceNumber,
            type:        'subscription',
            paymentType: 'subscription',
            method:      'cash',
            status:      'completed',
            paidAt:      now,
            amount: {
                subtotal:       999,
                taxAmount:      179,
                discountAmount: 0,
                total:          1178,
            },
            taxDetails: {
                taxType: 'GST',
                taxRate: 18,
            },
            invoice: {
                generated: false,
                emailSent: false,
            },
            metadata: {
                isDemo:      true,
                description: 'Demo payment',
                items:       [{ name: 'Demo Basic Plan', quantity: 1, price: 999, total: 999 }],
            },
            notes: 'Demo payment — created by seed',
        } as any);
    }

    return { members: createdMembers.length, attendance: 10, payments: 5 };
}

async function deleteExistingDemoData(tenantId: string) {
    await Promise.all([
        Member.deleteMany({ tenantId, 'metadata.isDemo': true } as any),
        Attendance.deleteMany({ tenantId, 'metadata.isDemo': true } as any),
        Payment.deleteMany({ tenantId, 'metadata.isDemo': true } as any),
        MembershipPlan.deleteMany({ tenantId, 'metadata.isDemo': true } as any),
    ]);
}

export class DemoController {
    // GET /status
    async getStatus(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const status = seedStatus[tenantId] || { seeded: false, lastSeeded: null };

            res.status(200).json({ success: true, data: status });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to get demo status' });
        }
    }

    // POST /seed
    async seedDemo(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const branchId = req.branchId || req.body.branchId;
            if (!branchId) {
                res.status(400).json({ success: false, message: 'Branch context required for demo seed' });
                return;
            }

            if (seedStatus[tenantId]?.seeded) {
                res.status(400).json({
                    success: false,
                    message: 'Demo data already seeded. Use /refresh to re-seed.',
                });
                return;
            }

            const result = await performSeed(tenantId, branchId, req.user._id.toString());
            const now    = new Date();
            seedStatus[tenantId] = { seeded: true, lastSeeded: now };

            res.status(201).json({
                success: true,
                message: 'Demo data seeded successfully',
                data:    { ...result, seededAt: now },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to seed demo data' });
        }
    }

    // POST /refresh
    async refreshDemo(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const branchId = req.branchId || req.body.branchId;
            if (!branchId) {
                res.status(400).json({ success: false, message: 'Branch context required for demo refresh' });
                return;
            }

            // Delete existing demo data
            await deleteExistingDemoData(tenantId);

            // Re-seed
            const result = await performSeed(tenantId, branchId, req.user._id.toString());
            const now    = new Date();
            seedStatus[tenantId] = { seeded: true, lastSeeded: now };

            res.status(200).json({
                success: true,
                message: 'Demo data refreshed successfully',
                data:    { ...result, refreshedAt: now },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to refresh demo data' });
        }
    }
}

export default new DemoController();
