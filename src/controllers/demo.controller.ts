import { Request, Response } from 'express';
import Member from '../models/Member.model';
import Lead from '../models/Lead.model';
import Attendance from '../models/Attendance.model';
import MembershipPlan from '../models/MembershipPlan.model';
import mongoose from 'mongoose';

const DEMO_PLANS = [
    { name: 'Basic Monthly', durationMonths: 1, price: 999, description: 'Access to gym equipment', isActive: true },
    { name: 'Premium Quarterly', durationMonths: 3, price: 2499, description: 'Gym + group classes', isActive: true },
    { name: 'Elite Annual', durationMonths: 12, price: 7999, description: 'Full access + personal trainer', isActive: true },
];

const DEMO_MEMBERS = [
    { firstName: 'Rahul', lastName: 'Sharma', mobile: '9876543210', email: 'rahul@demo.com', status: 'active' },
    { firstName: 'Priya', lastName: 'Patel', mobile: '9876543211', email: 'priya@demo.com', status: 'active' },
    { firstName: 'Amit', lastName: 'Kumar', mobile: '9876543212', email: 'amit@demo.com', status: 'active' },
    { firstName: 'Sneha', lastName: 'Singh', mobile: '9876543213', email: 'sneha@demo.com', status: 'frozen' },
    { firstName: 'Vijay', lastName: 'Mehta', mobile: '9876543214', email: 'vijay@demo.com', status: 'expired' },
];

const DEMO_LEADS = [
    { firstName: 'Arjun', lastName: 'Verma', mobile: '9000000001', source: 'walk_in', status: 'new' },
    { firstName: 'Kavya', lastName: 'Nair', mobile: '9000000002', source: 'referral', status: 'contacted' },
    { firstName: 'Rohit', lastName: 'Joshi', mobile: '9000000003', source: 'website', status: 'interested' },
    { firstName: 'Ananya', lastName: 'Reddy', mobile: '9000000004', source: 'instagram', status: 'follow_up' },
];

export class DemoController {

    async seedDemo(req: Request, res: Response) {
        try {
            const tenantId = req.user!.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant required' });

            // Seed plans
            for (const plan of DEMO_PLANS) {
                await MembershipPlan.findOneAndUpdate(
                    { tenantId, name: plan.name },
                    { ...plan, tenantId },
                    { upsert: true, new: true }
                );
            }

            // Seed members — use user's branchId, fall back to any branch for this tenant
            const branchId = req.user!.branchId;
            const memberIds: mongoose.Types.ObjectId[] = [];
            for (const member of DEMO_MEMBERS) {
                const membershipNumber = `DEMO-${(member as any).mobile.slice(-4)}-${Date.now().toString(36).toUpperCase()}`;
                const m = await Member.findOneAndUpdate(
                    { tenantId, mobile: (member as any).mobile },
                    {
                        ...member,
                        tenantId,
                        branchId,
                        membershipNumber,
                        joinDate: new Date(),
                        personalInfo: { gender: 'male' },
                        healthInfo: { medicalConditions: [], allergies: [], medications: [], injuries: [], doctorClearance: false },
                    },
                    { upsert: true, new: true }
                );
                memberIds.push(m._id as mongoose.Types.ObjectId);
            }

            // Seed leads
            for (const lead of DEMO_LEADS) {
                await Lead.findOneAndUpdate(
                    { tenantId, mobile: (lead as any).mobile },
                    { ...lead, tenantId, ...(branchId ? { branchId } : {}) },
                    { upsert: true, new: true }
                );
            }

            // Seed attendance for first 3 members (last 30 days)
            for (const memberId of memberIds.slice(0, 3)) {
                for (let i = 1; i <= 20; i++) {
                    const date = new Date();
                    date.setDate(date.getDate() - i);
                    const checkInTime = new Date(date);
                    checkInTime.setHours(7 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60));
                    const checkOutTime = new Date(checkInTime);
                    checkOutTime.setHours(checkOutTime.getHours() + 1 + Math.floor(Math.random() * 2));
                    const duration = Math.round((checkOutTime.getTime() - checkInTime.getTime()) / 60000);
                    await Attendance.findOneAndUpdate(
                        { tenantId, memberId, checkInTime: { $gte: new Date(checkInTime.toDateString()) } },
                        { tenantId, memberId, branchId, checkInTime, checkOutTime, duration, method: 'manual' },
                        { upsert: true, new: true }
                    );
                }
            }

            return res.json({
                success: true,
                message: 'Demo data seeded successfully',
                data: { plans: DEMO_PLANS.length, members: DEMO_MEMBERS.length, leads: DEMO_LEADS.length }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error seeding demo data', error: (error as Error).message });
        }
    }

    async refreshDemo(req: Request, res: Response) {
        try {
            const tenantId = req.user!.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant required' });

            // Delete and re-seed
            await Promise.all([
                Member.deleteMany({ tenantId, memberCode: { $regex: /^DEMO/ } }),
                Lead.deleteMany({ tenantId, mobile: { $regex: /^9000000/ } }),
                Attendance.deleteMany({ tenantId })
            ]);

            // Re-seed via seedDemo
            return this.seedDemo(req, res);
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error refreshing demo', error: (error as Error).message });
        }
    }
}

export default new DemoController();
