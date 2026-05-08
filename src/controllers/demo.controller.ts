import { Request, Response } from 'express';
import Member from '../models/Member.model';
import Lead from '../models/Lead.model';
import Attendance from '../models/Attendance.model';
import MembershipPlan from '../models/MembershipPlan.model';
import Subscription from '../models/Subscription.model';
import Payment from '../models/Payment.model';
import Trainer from '../models/Trainer.model';
import User from '../models/User.model';
import Class from '../models/Class.model';
import POSProduct from '../models/Product.model';
import Sale from '../models/Sale.model';
import Workout from '../models/Workout.model';
import mongoose from 'mongoose';

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randFrom = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };

const DEMO_PLANS = [
    { name: 'Basic Monthly', durationMonths: 1, price: 999, description: 'Access to gym equipment', isActive: true },
    { name: 'Premium Quarterly', durationMonths: 3, price: 2499, description: 'Gym + group classes', isActive: true },
    { name: 'Elite Annual', durationMonths: 12, price: 7999, description: 'Full access + personal trainer', isActive: true },
    { name: 'Student Monthly', durationMonths: 1, price: 599, description: 'Student discount plan', isActive: true },
    { name: 'Couple Quarterly', durationMonths: 3, price: 3999, description: 'For couples', isActive: true },
];

const DEMO_MEMBERS = [
    { firstName: 'Rahul', lastName: 'Sharma', mobile: '9876543210', email: 'rahul@demo.com', status: 'active', gender: 'male' },
    { firstName: 'Priya', lastName: 'Patel', mobile: '9876543211', email: 'priya@demo.com', status: 'active', gender: 'female' },
    { firstName: 'Amit', lastName: 'Kumar', mobile: '9876543212', email: 'amit@demo.com', status: 'active', gender: 'male' },
    { firstName: 'Sneha', lastName: 'Singh', mobile: '9876543213', email: 'sneha@demo.com', status: 'frozen', gender: 'female' },
    { firstName: 'Vijay', lastName: 'Mehta', mobile: '9876543214', email: 'vijay@demo.com', status: 'expired', gender: 'male' },
    { firstName: 'Deepika', lastName: 'Gupta', mobile: '9876543215', email: 'deepika@demo.com', status: 'active', gender: 'female' },
    { firstName: 'Rohan', lastName: 'Verma', mobile: '9876543216', email: 'rohan@demo.com', status: 'active', gender: 'male' },
    { firstName: 'Anita', lastName: 'Mishra', mobile: '9876543217', email: 'anita@demo.com', status: 'active', gender: 'female' },
    { firstName: 'Karan', lastName: 'Kapoor', mobile: '9876543218', email: 'karan@demo.com', status: 'active', gender: 'male' },
    { firstName: 'Pooja', lastName: 'Agarwal', mobile: '9876543219', email: 'pooja@demo.com', status: 'active', gender: 'female' },
    { firstName: 'Suresh', lastName: 'Nair', mobile: '9876543220', email: 'suresh@demo.com', status: 'expired', gender: 'male' },
    { firstName: 'Meera', lastName: 'Pillai', mobile: '9876543221', email: 'meera@demo.com', status: 'active', gender: 'female' },
    { firstName: 'Tarun', lastName: 'Joshi', mobile: '9876543222', email: 'tarun@demo.com', status: 'active', gender: 'male' },
    { firstName: 'Nisha', lastName: 'Reddy', mobile: '9876543223', email: 'nisha@demo.com', status: 'active', gender: 'female' },
    { firstName: 'Arjun', lastName: 'Rao', mobile: '9876543224', email: 'arjun@demo.com', status: 'active', gender: 'male' },
];

const DEMO_LEADS = [
    { firstName: 'Kabir', lastName: 'Verma', mobile: '9000000001', source: 'walk_in', status: 'new' },
    { firstName: 'Kavya', lastName: 'Nair', mobile: '9000000002', source: 'referral', status: 'contacted' },
    { firstName: 'Rohit', lastName: 'Joshi', mobile: '9000000003', source: 'website', status: 'interested' },
    { firstName: 'Ananya', lastName: 'Reddy', mobile: '9000000004', source: 'instagram', status: 'follow_up' },
    { firstName: 'Dev', lastName: 'Sharma', mobile: '9000000005', source: 'google_ads', status: 'new' },
    { firstName: 'Isha', lastName: 'Patel', mobile: '9000000006', source: 'walk_in', status: 'visited' },
    { firstName: 'Manav', lastName: 'Singh', mobile: '9000000007', source: 'referral', status: 'proposal_sent' },
    { firstName: 'Zara', lastName: 'Khan', mobile: '9000000008', source: 'facebook', status: 'interested' },
];

const DEMO_POS_PRODUCTS = [
    { name: 'Protein Shake (Chocolate)', category: 'Supplements', price: 150, stock: 50, unit: 'bottle' },
    { name: 'Protein Shake (Vanilla)', category: 'Supplements', price: 150, stock: 40, unit: 'bottle' },
    { name: 'Energy Bar', category: 'Snacks', price: 60, stock: 100, unit: 'piece' },
    { name: 'Water Bottle (1L)', category: 'Accessories', price: 30, stock: 200, unit: 'bottle' },
    { name: 'Gym Gloves', category: 'Equipment', price: 350, stock: 20, unit: 'pair' },
    { name: 'Resistance Band', category: 'Equipment', price: 250, stock: 15, unit: 'piece' },
    { name: 'Towel', category: 'Accessories', price: 120, stock: 30, unit: 'piece' },
    { name: 'BCAA Powder (500g)', category: 'Supplements', price: 899, stock: 25, unit: 'pack' },
];

const DEMO_CLASSES = [
    { name: 'Morning Yoga', instructor: 'Priya Trainer', capacity: 20, duration: 60, type: 'yoga', daysOfWeek: [1, 3, 5], startTime: '07:00', price: 0 },
    { name: 'HIIT Blast', instructor: 'Rahul Trainer', capacity: 15, duration: 45, type: 'hiit', daysOfWeek: [2, 4, 6], startTime: '06:30', price: 200 },
    { name: 'Zumba Dance', instructor: 'Sneha Trainer', capacity: 25, duration: 60, type: 'dance', daysOfWeek: [1, 2, 3, 4, 5], startTime: '18:00', price: 150 },
    { name: 'Power Lifting', instructor: 'Amit Trainer', capacity: 10, duration: 90, type: 'strength', daysOfWeek: [1, 3, 5], startTime: '08:00', price: 300 },
    { name: 'Spinning Cycle', instructor: 'Vijay Trainer', capacity: 12, duration: 45, type: 'cardio', daysOfWeek: [2, 4, 6], startTime: '07:00', price: 250 },
];

const DEMO_TRAINERS = [
    { firstName: 'Priya', lastName: 'Sharma', mobile: '9111000001', email: 'priya.trainer@demo.com', specializations: ['yoga', 'pilates'], experience: 5, rating: 4.8 },
    { firstName: 'Rahul', lastName: 'Singh', mobile: '9111000002', email: 'rahul.trainer@demo.com', specializations: ['hiit', 'strength'], experience: 7, rating: 4.9 },
    { firstName: 'Sneha', lastName: 'Patel', mobile: '9111000003', email: 'sneha.trainer@demo.com', specializations: ['dance', 'zumba'], experience: 4, rating: 4.7 },
];

const DEMO_WORKOUTS = [
    { name: 'Full Body Blast', category: 'strength', difficulty: 'intermediate', durationMinutes: 45, exercises: ['Squats', 'Push-ups', 'Deadlifts', 'Pull-ups'] },
    { name: 'Morning Cardio', category: 'cardio', difficulty: 'beginner', durationMinutes: 30, exercises: ['Treadmill Run', 'Jumping Jacks', 'High Knees', 'Burpees'] },
    { name: 'Core Crusher', category: 'core', difficulty: 'intermediate', durationMinutes: 25, exercises: ['Plank', 'Crunches', 'Russian Twists', 'Leg Raises'] },
    { name: 'Upper Body Power', category: 'strength', difficulty: 'advanced', durationMinutes: 60, exercises: ['Bench Press', 'Shoulder Press', 'Bicep Curls', 'Tricep Dips'] },
];

export class DemoController {
    async seedDemo(req: Request, res: Response) {
        try {
            const tenantId = req.user!.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant required' });
            const branchId = req.user!.branchId;

            // 1. Seed membership plans
            const planDocs: any[] = [];
            for (const plan of DEMO_PLANS) {
                const p = await MembershipPlan.findOneAndUpdate(
                    { tenantId, name: plan.name },
                    { ...plan, tenantId },
                    { upsert: true, new: true }
                );
                planDocs.push(p);
            }

            // 2. Seed POS products
            for (const product of DEMO_POS_PRODUCTS) {
                await (POSProduct as any).findOneAndUpdate(
                    { tenantId, name: product.name },
                    { ...product, tenantId, ...(branchId ? { branchId } : {}) },
                    { upsert: true, new: true }
                );
            }

            // 3. Seed members
            const memberDocs: any[] = [];
            for (const member of DEMO_MEMBERS) {
                const membershipNumber = `DM${Date.now().toString(36).toUpperCase().slice(-6)}`;
                const joiningDate = daysAgo(rand(30, 365));
                const plan = planDocs[rand(0, planDocs.length - 1)];
                const expiryDate = new Date(joiningDate);
                expiryDate.setMonth(expiryDate.getMonth() + plan.durationMonths);

                const m = await (Member as any).findOneAndUpdate(
                    { tenantId, mobile: member.mobile },
                    {
                        firstName: member.firstName,
                        lastName: member.lastName,
                        mobile: member.mobile,
                        email: member.email,
                        status: member.status,
                        tenantId,
                        branchId,
                        membershipNumber,
                        joinDate: joiningDate,
                        expiryDate,
                        membershipPlanId: plan._id,
                        personalInfo: {
                            gender: member.gender,
                            dateOfBirth: new Date(1990 + rand(0, 15), rand(0, 11), rand(1, 28)),
                        },
                        healthInfo: {
                            medicalConditions: [],
                            allergies: [],
                            medications: [],
                            injuries: [],
                            doctorClearance: false,
                        },
                        emergencyContact: {
                            name: `${member.firstName} Family`,
                            phone: `98${rand(10000000, 99999999)}`,
                            relation: 'family',
                        },
                    },
                    { upsert: true, new: true }
                );
                memberDocs.push(m);
            }

            // 4. Seed subscriptions
            for (let i = 0; i < memberDocs.length; i++) {
                const member = memberDocs[i];
                const plan = planDocs[i % planDocs.length];
                const startDate = member.joinDate || daysAgo(rand(30, 180));
                const endDate = new Date(startDate);
                endDate.setMonth(endDate.getMonth() + plan.durationMonths);
                await (Subscription as any).findOneAndUpdate(
                    { tenantId, memberId: member._id },
                    {
                        tenantId,
                        memberId: member._id,
                        planId: plan._id,
                        branchId,
                        status: member.status === 'active' ? 'active' : member.status === 'frozen' ? 'frozen' : 'expired',
                        startDate,
                        endDate,
                        amount: plan.price,
                        autoRenew: member.status === 'active',
                    },
                    { upsert: true, new: true }
                );
            }

            // 5. Seed payments (last 90 days)
            const paymentMethods = ['cash', 'upi', 'card', 'online'];
            for (let i = 0; i < 30; i++) {
                const member = randFrom(memberDocs);
                const plan = planDocs[rand(0, planDocs.length - 1)];
                const paymentDate = daysAgo(rand(0, 90));
                await (Payment as any).findOneAndUpdate(
                    { tenantId, memberId: member._id, createdAt: paymentDate },
                    {
                        tenantId,
                        memberId: member._id,
                        branchId,
                        amount: plan.price,
                        paidAmount: plan.price,
                        discount: 0,
                        paymentMethod: randFrom(paymentMethods),
                        status: 'paid',
                        type: 'membership',
                        description: `${plan.name} - ${member.firstName} ${member.lastName}`,
                        paymentDate,
                        createdAt: paymentDate,
                    },
                    { upsert: true, new: true }
                );
            }

            // 6. Seed attendance (last 60 days for active members)
            const activeMembers = memberDocs.filter(m => m.status === 'active');
            for (const member of activeMembers.slice(0, 10)) {
                const visits = rand(15, 45);
                for (let i = 1; i <= visits; i++) {
                    const date = daysAgo(i);
                    if (Math.random() > 0.3) { // ~70% attendance rate
                        const checkInTime = new Date(date);
                        checkInTime.setHours(rand(6, 10), rand(0, 59));
                        const checkOutTime = new Date(checkInTime);
                        checkOutTime.setHours(checkOutTime.getHours() + rand(1, 2), rand(0, 59));
                        const duration = Math.round((checkOutTime.getTime() - checkInTime.getTime()) / 60000);
                        await (Attendance as any).findOneAndUpdate(
                            { tenantId, memberId: member._id, checkInTime: { $gte: new Date(date.toDateString()) } },
                            { tenantId, memberId: member._id, branchId, checkInTime, checkOutTime, duration, method: 'manual', status: 'checked_out' },
                            { upsert: true, new: true }
                        );
                    }
                }
            }

            // 7. Seed leads
            for (const lead of DEMO_LEADS) {
                await (Lead as any).findOneAndUpdate(
                    { tenantId, mobile: lead.mobile },
                    {
                        ...lead,
                        tenantId,
                        ...(branchId ? { branchId } : {}),
                        createdAt: daysAgo(rand(1, 30)),
                        nextFollowUp: daysAgo(-rand(1, 7)),
                    },
                    { upsert: true, new: true }
                );
            }

            // 8. Seed classes
            for (const cls of DEMO_CLASSES) {
                await (Class as any).findOneAndUpdate(
                    { tenantId, name: cls.name },
                    { ...cls, tenantId, ...(branchId ? { branchId } : {}), isActive: true },
                    { upsert: true, new: true }
                );
            }

            // 9. Seed POS sales (last 30 days)
            const products: any[] = await (POSProduct as any).find({ tenantId }).lean();
            if (products.length > 0) {
                for (let i = 0; i < 20; i++) {
                    const product = randFrom(products);
                    const qty = rand(1, 3);
                    const saleDate = daysAgo(rand(0, 30));
                    await (Sale as any).create({
                        tenantId,
                        branchId,
                        items: [{ productId: product._id, name: product.name, quantity: qty, unitPrice: product.price, total: product.price * qty }],
                        total: product.price * qty,
                        paymentMethod: randFrom(['cash', 'upi', 'card']),
                        status: 'completed',
                        soldAt: saleDate,
                    });
                }
            }

            // 10. Seed trainers
            for (const trainer of DEMO_TRAINERS) {
                await (Trainer as any).findOneAndUpdate(
                    { tenantId, mobile: trainer.mobile },
                    { ...trainer, tenantId, ...(branchId ? { branchId } : {}), isActive: true, status: 'active' },
                    { upsert: true, new: true }
                );
            }

            // 11. Seed workouts
            for (const workout of DEMO_WORKOUTS) {
                await (Workout as any).findOneAndUpdate(
                    { tenantId, name: workout.name },
                    {
                        ...workout,
                        tenantId,
                        exercises: workout.exercises.map((name, idx) => ({
                            name,
                            sets: 3,
                            reps: 12,
                            restSeconds: 60,
                            order: idx + 1,
                        })),
                        isActive: true,
                    },
                    { upsert: true, new: true }
                );
            }

            return res.json({
                success: true,
                message: 'Demo data seeded successfully',
                isDemo: true,
                seeded: true,
                data: {
                    plans: DEMO_PLANS.length,
                    members: DEMO_MEMBERS.length,
                    leads: DEMO_LEADS.length,
                    classes: DEMO_CLASSES.length,
                    posProducts: DEMO_POS_PRODUCTS.length,
                    trainers: DEMO_TRAINERS.length,
                    workouts: DEMO_WORKOUTS.length,
                    attendance: '~450 records',
                    payments: 30,
                },
            });
        } catch (error: any) {
            console.error('Demo seed error:', error);
            return res.status(500).json({ success: false, message: 'Error seeding demo data', error: error.message });
        }
    }

    async getStatus(req: Request, res: Response) {
        try {
            const tenantId = req.user!.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant required' });

            const [memberCount, leadCount, planCount] = await Promise.all([
                Member.countDocuments({ tenantId }),
                Lead.countDocuments({ tenantId }),
                MembershipPlan.countDocuments({ tenantId }),
            ]);

            const seeded = memberCount >= 5;
            return res.json({
                success: true,
                isDemo: true,
                seeded,
                data: {
                    hasData: memberCount > 0 || leadCount > 0,
                    memberCount,
                    leadCount,
                    planCount,
                },
            });
        } catch (error: any) {
            return res.status(500).json({ success: false, message: 'Error getting demo status', error: error.message });
        }
    }

    async refreshDemo(req: Request, res: Response) {
        try {
            const tenantId = req.user!.tenantId;
            if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant required' });

            // Delete existing demo data by mobile pattern
            await Promise.all([
                (Member as any).deleteMany({ tenantId, mobile: { $in: DEMO_MEMBERS.map(m => m.mobile) } }),
                (Lead as any).deleteMany({ tenantId, mobile: { $regex: /^9000000/ } }),
                (Attendance as any).deleteMany({ tenantId }),
            ]);

            // Re-seed
            return this.seedDemo(req, res);
        } catch (error: any) {
            return res.status(500).json({ success: false, message: 'Error refreshing demo', error: error.message });
        }
    }
}

export default new DemoController();
