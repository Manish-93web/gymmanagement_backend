import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '../models/User.model';
import Tenant from '../models/Tenant.model';
import Branch from '../models/Branch.model';
import Member from '../models/Member.model';
import MembershipPlan from '../models/MembershipPlan.model';
import Payment from '../models/Payment.model';
import Attendance from '../models/Attendance.model';
import Trainer from '../models/Trainer.model';
import Subscription from '../models/Subscription.model';
import Lead from '../models/Lead.model';
import Announcement from '../models/Announcement.model';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-management';

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d; }
function monthsAgo(n: number) { const d = new Date(); d.setMonth(d.getMonth() - n); return d; }

const seedDemoData = async () => {
    try {
        console.log('🌱 Starting Demo Data seeding for saanvi@gmail.com...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // ─── 1. CLEAN UP ─────────────────────────────────────────────────────
        console.log('🗑️  Cleaning up any existing demo data...');
        const demoEmails = [
            'saanvi@gmail.com',
            'arjun.singh@demo.com', 'neha.patel@demo.com',
            'rohit.kumar@demo.com', 'anjali.mehta@demo.com',
            'rahul.trainer@demo.com', 'priya.trainer@demo.com',
        ];
        const existingTenant = await Tenant.findOne({ slug: 'saanvi-fitness' });
        if (existingTenant) {
            const tid = existingTenant._id;
            await Promise.all([
                Attendance.deleteMany({ tenantId: tid }),
                Payment.deleteMany({ tenantId: tid }),
                Subscription.deleteMany({ tenantId: tid }),
                Lead.deleteMany({ tenantId: tid }),
                Announcement.deleteMany({ tenantId: tid }),
                Trainer.deleteMany({ tenantId: tid }),
                Member.deleteMany({ tenantId: tid }),
                MembershipPlan.deleteMany({ tenantId: tid }),
                Branch.deleteMany({ tenantId: tid }),
                Tenant.deleteOne({ _id: tid }),
            ]);
        }
        await User.deleteMany({ email: { $in: demoEmails } });

        // ─── 2. TENANT ───────────────────────────────────────────────────────
        const tenant = await Tenant.create({
            name: 'Saanvi Fitness Studio',
            slug: 'saanvi-fitness',
            isActive: true,
            subscription: {
                plan: 'pro', status: 'active', startDate: monthsAgo(6),
                maxBranches: 3, maxMembers: 500, maxTrainers: 20,
            },
            features: {
                aiEnabled: true, onlineClasses: true, pos: true,
                whatsappIntegration: false, smsNotifications: true,
                emailNotifications: true, customDomain: false, multiCurrency: false,
            },
            contactInfo: { email: 'info@saanvifitness.com', phone: '9876543210' },
        });
        console.log('✅ Tenant created:', tenant.name);

        // ─── 3. BRANCH ───────────────────────────────────────────────────────
        const branch = await Branch.create({
            tenantId: tenant._id,
            name: 'Main Branch', code: 'SFS-MAIN', isActive: true,
            contactInfo: {
                address: '42, Fitness Avenue, Andheri West',
                city: 'Mumbai', state: 'Maharashtra', country: 'India', zipCode: '400053',
                phone: '9876543210', email: 'main@saanvifitness.com',
            },
            operatingHours: [
                { day: 'monday',    openTime: '06:00', closeTime: '22:00', isClosed: false },
                { day: 'tuesday',   openTime: '06:00', closeTime: '22:00', isClosed: false },
                { day: 'wednesday', openTime: '06:00', closeTime: '22:00', isClosed: false },
                { day: 'thursday',  openTime: '06:00', closeTime: '22:00', isClosed: false },
                { day: 'friday',    openTime: '06:00', closeTime: '22:00', isClosed: false },
                { day: 'saturday',  openTime: '07:00', closeTime: '20:00', isClosed: false },
                { day: 'sunday',    openTime: '08:00', closeTime: '14:00', isClosed: false },
            ],
            capacity: { maxMembers: 200, currentMembers: 4 },
            amenities: ['Parking', 'Locker Room', 'Showers', 'Cafeteria', 'WiFi', 'AC'],
        });
        console.log('✅ Branch created:', branch.name);

        // ─── 4. GYM OWNER ────────────────────────────────────────────────────
        const ownerUser = new User({
            firstName: 'Saanvi', lastName: 'Sharma',
            email: 'saanvi@gmail.com', mobile: '9000000001',
            password: 'Test@123', role: 'gym_owner',
            tenantId: tenant._id, branchId: branch._id,
            isActive: true, isEmailVerified: true, isMobileVerified: true,
        });
        await ownerUser.save();
        console.log('✅ Gym Owner: saanvi@gmail.com / Test@123');

        // ─── 5. MEMBERSHIP PLANS ─────────────────────────────────────────────
        const planMonthly = await MembershipPlan.create({
            tenantId: tenant._id, branchId: branch._id,
            name: 'Monthly Basic', description: 'Full gym access for one month',
            type: 'time_based', duration: 'monthly', durationValue: 1,
            pricing: { basePrice: 1500, taxRate: 18, discountPercent: 0, finalPrice: 1770 },
            features: {
                gymAccess: true, groupClasses: false, personalTraining: false,
                onlineClasses: false, dietPlan: false, lockerFacility: true,
                freezeAllowed: true, maxFreezes: 1, freezeDuration: 7,
                branchTransferAllowed: false,
            },
            isActive: true, currentMembers: 2,
        });

        const planQuarterly = await MembershipPlan.create({
            tenantId: tenant._id, branchId: branch._id,
            name: 'Quarterly Premium', description: 'Gym + Group classes for 3 months',
            type: 'time_based', duration: 'quarterly', durationValue: 3,
            pricing: { basePrice: 4000, taxRate: 18, discountPercent: 5, finalPrice: 4484 },
            features: {
                gymAccess: true, groupClasses: true, personalTraining: false,
                onlineClasses: true, dietPlan: true, lockerFacility: true,
                freezeAllowed: true, maxFreezes: 2, freezeDuration: 14,
                branchTransferAllowed: true,
            },
            isActive: true, currentMembers: 1,
        });

        const planAnnual = await MembershipPlan.create({
            tenantId: tenant._id, branchId: branch._id,
            name: 'Annual Elite', description: 'All-inclusive yearly membership',
            type: 'time_based', duration: 'yearly', durationValue: 1,
            pricing: { basePrice: 12000, taxRate: 18, discountPercent: 10, finalPrice: 12744 },
            features: {
                gymAccess: true, groupClasses: true, personalTraining: true,
                onlineClasses: true, dietPlan: true, lockerFacility: true,
                freezeAllowed: true, maxFreezes: 3, freezeDuration: 30,
                branchTransferAllowed: true,
            },
            isActive: true, currentMembers: 1,
        });
        console.log('✅ 3 Membership Plans created');

        // ─── 6. TRAINERS ─────────────────────────────────────────────────────
        const trainerUser1 = new User({
            firstName: 'Rahul', lastName: 'Sharma',
            email: 'rahul.trainer@demo.com', mobile: '9000000002',
            password: 'Trainer@123', role: 'trainer',
            tenantId: tenant._id, branchId: branch._id,
            isActive: true, isEmailVerified: true, isMobileVerified: true,
        });
        await trainerUser1.save();

        const trainerUser2 = new User({
            firstName: 'Priya', lastName: 'Verma',
            email: 'priya.trainer@demo.com', mobile: '9000000003',
            password: 'Trainer@123', role: 'trainer',
            tenantId: tenant._id, branchId: branch._id,
            isActive: true, isEmailVerified: true, isMobileVerified: true,
        });
        await trainerUser2.save();

        const slotMorning = [{ startTime: '07:00', endTime: '10:00', isBooked: false }];
        const slotEvening = [{ startTime: '17:00', endTime: '20:00', isBooked: false }];
        const bothSlots   = [...slotMorning, ...slotEvening];

        await Trainer.create({
            tenantId: tenant._id, branchId: branch._id, userId: trainerUser1._id,
            specializations: ['Strength Training', 'Conditioning', 'Weight Loss'],
            certifications: [
                { name: 'ACE Certified Personal Trainer', issuedBy: 'ACE', issuedDate: daysAgo(730) },
                { name: 'Nutrition Coach', issuedBy: 'ISSA', issuedDate: daysAgo(365) },
            ],
            experience: { years: 5, previousGyms: ["Gold's Gym Mumbai", 'Cult.fit'], achievements: ['Best Trainer 2023'] },
            availability: [
                { day: 'monday',    isAvailable: true,  slots: bothSlots },
                { day: 'tuesday',   isAvailable: true,  slots: bothSlots },
                { day: 'wednesday', isAvailable: true,  slots: slotMorning },
                { day: 'thursday',  isAvailable: true,  slots: bothSlots },
                { day: 'friday',    isAvailable: true,  slots: slotEvening },
                { day: 'saturday',  isAvailable: true,  slots: [{ startTime: '08:00', endTime: '12:00', isBooked: false }] },
                { day: 'sunday',    isAvailable: false, slots: [] },
            ],
            pricing: {
                hourlyRate: 800,
                sessionPackages: [
                    { sessions: 8, price: 5500, validityDays: 30 },
                    { sessions: 20, price: 12000, validityDays: 60 },
                ],
            },
            revenueSharing: { enabled: true, percentage: 30, minimumSessions: 10 },
            ratings: { average: 4.7, totalReviews: 18, reviews: [] },
            kpis: { totalClients: 18, activeClients: 3, totalSessions: 142, totalRevenue: 85000, averageRating: 4.7, retentionRate: 88 },
            isActive: true,
        });

        await Trainer.create({
            tenantId: tenant._id, branchId: branch._id, userId: trainerUser2._id,
            specializations: ['Yoga', 'Pilates', 'Flexibility', 'Meditation'],
            certifications: [{ name: 'RYT 500 Yoga Teacher', issuedBy: 'Yoga Alliance', issuedDate: daysAgo(540) }],
            experience: { years: 7, previousGyms: ['Ananda Yoga Studio', 'The Yoga House'], achievements: ['Wellness Coach of the Year 2022'] },
            availability: [
                { day: 'monday',    isAvailable: true,  slots: [{ startTime: '06:00', endTime: '09:00', isBooked: false }, { startTime: '18:00', endTime: '20:00', isBooked: false }] },
                { day: 'tuesday',   isAvailable: true,  slots: [{ startTime: '06:00', endTime: '09:00', isBooked: false }] },
                { day: 'wednesday', isAvailable: true,  slots: [{ startTime: '06:00', endTime: '09:00', isBooked: false }, { startTime: '18:00', endTime: '20:00', isBooked: false }] },
                { day: 'thursday',  isAvailable: true,  slots: [{ startTime: '06:00', endTime: '09:00', isBooked: false }] },
                { day: 'friday',    isAvailable: true,  slots: [{ startTime: '06:00', endTime: '09:00', isBooked: false }, { startTime: '18:00', endTime: '20:00', isBooked: false }] },
                { day: 'saturday',  isAvailable: true,  slots: [{ startTime: '07:00', endTime: '11:00', isBooked: false }] },
                { day: 'sunday',    isAvailable: true,  slots: [{ startTime: '07:00', endTime: '11:00', isBooked: false }] },
            ],
            pricing: {
                hourlyRate: 700,
                sessionPackages: [
                    { sessions: 8, price: 4800, validityDays: 30 },
                    { sessions: 20, price: 11000, validityDays: 60 },
                ],
            },
            revenueSharing: { enabled: true, percentage: 25, minimumSessions: 8 },
            ratings: { average: 4.9, totalReviews: 31, reviews: [] },
            kpis: { totalClients: 22, activeClients: 4, totalSessions: 198, totalRevenue: 95000, averageRating: 4.9, retentionRate: 92 },
            isActive: true,
        });
        console.log('✅ 2 Trainers created (Rahul Sharma, Priya Verma)');

        // ─── 7. MEMBER USERS ─────────────────────────────────────────────────
        const memberUsersData = [
            { firstName: 'Arjun',  lastName: 'Singh',  email: 'arjun.singh@demo.com',  mobile: '9000000010' },
            { firstName: 'Neha',   lastName: 'Patel',  email: 'neha.patel@demo.com',   mobile: '9000000011' },
            { firstName: 'Rohit',  lastName: 'Kumar',  email: 'rohit.kumar@demo.com',  mobile: '9000000012' },
            { firstName: 'Anjali', lastName: 'Mehta',  email: 'anjali.mehta@demo.com', mobile: '9000000013' },
        ];
        const memberUsers: any[] = [];
        for (const u of memberUsersData) {
            const user = new User({
                ...u, password: 'Member@123', role: 'member',
                tenantId: tenant._id, branchId: branch._id,
                isActive: true, isEmailVerified: true, isMobileVerified: true,
            });
            await user.save();
            memberUsers.push(user);
        }
        console.log('✅ 4 Member users created');

        // ─── 8. MEMBER RECORDS ───────────────────────────────────────────────
        const membersData = [
            {
                userId: memberUsers[0]._id,
                firstName: 'Arjun', lastName: 'Singh',
                email: 'arjun.singh@demo.com', mobile: '9000000010',
                membershipNumber: 'SFS-2024-001',
                planId: planMonthly._id,
                membershipStart: monthsAgo(3), membershipExpiry: daysFromNow(10),
                status: 'active',
                personalInfo: { dateOfBirth: new Date('1994-05-15'), gender: 'male', bloodGroup: 'O+', fitnessLevel: 'intermediate', emergencyContact: { name: 'Sunita Singh', relationship: 'Mother', phone: '9900000010' } },
                healthInfo: { medicalConditions: [], allergies: [], medications: [], injuries: [], doctorClearance: true, doctorClearanceDate: monthsAgo(3) },
                measurements: [
                    { date: monthsAgo(3), weight: 82, height: 175, bodyFat: 22, muscleMass: 38, bmi: 26.8, chest: 96, waist: 88, hips: 94, biceps: 32, thighs: 52, recordedBy: ownerUser._id },
                    { date: monthsAgo(2), weight: 80, height: 175, bodyFat: 21, muscleMass: 39, bmi: 26.1, chest: 95, waist: 86, hips: 93, biceps: 33, thighs: 51, recordedBy: ownerUser._id },
                    { date: monthsAgo(1), weight: 78, height: 175, bodyFat: 19, muscleMass: 40, bmi: 25.5, chest: 94, waist: 84, hips: 92, biceps: 34, thighs: 50, recordedBy: ownerUser._id },
                ],
                gamification: { currentStreak: 7, longestStreak: 14, totalPoints: 850, level: 3, badges: [] },
                walletBalance: 0, referralCode: 'SFS-ARJ-001',
            },
            {
                userId: memberUsers[1]._id,
                firstName: 'Neha', lastName: 'Patel',
                email: 'neha.patel@demo.com', mobile: '9000000011',
                membershipNumber: 'SFS-2024-002',
                planId: planQuarterly._id,
                membershipStart: monthsAgo(2), membershipExpiry: daysFromNow(28),
                status: 'active',
                personalInfo: { dateOfBirth: new Date('1998-09-22'), gender: 'female', bloodGroup: 'A+', fitnessLevel: 'beginner', emergencyContact: { name: 'Deepak Patel', relationship: 'Father', phone: '9900000011' } },
                healthInfo: { medicalConditions: [], allergies: ['Lactose'], medications: [], injuries: [], doctorClearance: true, dietaryRestrictions: ['Vegetarian'] },
                measurements: [
                    { date: monthsAgo(2), weight: 65, height: 162, bodyFat: 28, muscleMass: 28, bmi: 24.8, chest: 86, waist: 72, hips: 92, biceps: 26, thighs: 54, recordedBy: ownerUser._id },
                    { date: monthsAgo(1), weight: 63, height: 162, bodyFat: 26, muscleMass: 29, bmi: 24.0, chest: 85, waist: 70, hips: 91, biceps: 26, thighs: 53, recordedBy: ownerUser._id },
                ],
                gamification: { currentStreak: 12, longestStreak: 12, totalPoints: 1200, level: 4, badges: [] },
                walletBalance: 500, referralCode: 'SFS-NEH-002',
            },
            {
                userId: memberUsers[2]._id,
                firstName: 'Rohit', lastName: 'Kumar',
                email: 'rohit.kumar@demo.com', mobile: '9000000012',
                membershipNumber: 'SFS-2024-003',
                planId: planAnnual._id,
                membershipStart: monthsAgo(4), membershipExpiry: daysFromNow(240),
                status: 'active',
                personalInfo: { dateOfBirth: new Date('1990-03-08'), gender: 'male', bloodGroup: 'B+', fitnessLevel: 'advanced', emergencyContact: { name: 'Kavita Kumar', relationship: 'Wife', phone: '9900000012' } },
                healthInfo: { medicalConditions: ['Mild Hypertension'], allergies: [], medications: ['BP Medication'], injuries: ['Old knee injury - right'], doctorClearance: true, doctorClearanceDate: monthsAgo(4) },
                measurements: [
                    { date: monthsAgo(4), weight: 90, height: 178, bodyFat: 25, muscleMass: 42, bmi: 28.4, chest: 100, waist: 94, hips: 98, biceps: 35, thighs: 56, recordedBy: ownerUser._id },
                    { date: monthsAgo(3), weight: 88, height: 178, bodyFat: 23, muscleMass: 43, bmi: 27.8, chest: 99, waist: 92, hips: 97, biceps: 36, thighs: 55, recordedBy: ownerUser._id },
                    { date: monthsAgo(2), weight: 86, height: 178, bodyFat: 21, muscleMass: 44, bmi: 27.1, chest: 98, waist: 90, hips: 96, biceps: 37, thighs: 54, recordedBy: ownerUser._id },
                    { date: monthsAgo(1), weight: 84, height: 178, bodyFat: 19, muscleMass: 45, bmi: 26.5, chest: 97, waist: 88, hips: 95, biceps: 38, thighs: 53, recordedBy: ownerUser._id },
                ],
                gamification: { currentStreak: 21, longestStreak: 30, totalPoints: 3200, level: 7, badges: [] },
                walletBalance: 0, referralCode: 'SFS-ROH-003',
            },
            {
                userId: memberUsers[3]._id,
                firstName: 'Anjali', lastName: 'Mehta',
                email: 'anjali.mehta@demo.com', mobile: '9000000013',
                membershipNumber: 'SFS-2024-004',
                planId: planMonthly._id,
                membershipStart: daysAgo(15), membershipExpiry: daysFromNow(15),
                status: 'active',
                personalInfo: { dateOfBirth: new Date('2001-11-30'), gender: 'female', bloodGroup: 'O-', fitnessLevel: 'beginner', emergencyContact: { name: 'Rajesh Mehta', relationship: 'Father', phone: '9900000013' } },
                healthInfo: { medicalConditions: [], allergies: [], medications: [], injuries: [], doctorClearance: false },
                measurements: [{ date: daysAgo(15), weight: 58, height: 158, bodyFat: 30, muscleMass: 24, bmi: 23.2, chest: 82, waist: 68, hips: 90, biceps: 24, thighs: 50, recordedBy: ownerUser._id }],
                gamification: { currentStreak: 5, longestStreak: 5, totalPoints: 200, level: 1, badges: [] },
                walletBalance: 0, referralCode: 'SFS-ANJ-004',
            },
        ];

        const members: any[] = [];
        for (const m of membersData) {
            const member = await Member.create({ tenantId: tenant._id, branchId: branch._id, ...m } as any);
            members.push(member);
        }
        console.log('✅ 4 Members created (Arjun, Neha, Rohit, Anjali)');

        // ─── 9. SUBSCRIPTIONS ────────────────────────────────────────────────
        const subConfigs = [
            { member: members[0], plan: planMonthly,   start: monthsAgo(3), end: daysFromNow(10),  price: 1500, tax: 270, total: 1770 },
            { member: members[1], plan: planQuarterly, start: monthsAgo(2), end: daysFromNow(28),  price: 4000, tax: 484, total: 4484 },
            { member: members[2], plan: planAnnual,    start: monthsAgo(4), end: daysFromNow(240), price: 12000, tax: 744, total: 12744 },
            { member: members[3], plan: planMonthly,   start: daysAgo(15),  end: daysFromNow(15),  price: 1500, tax: 270, total: 1770 },
        ];
        for (const cfg of subConfigs) {
            await Subscription.create({
                tenantId: tenant._id, branchId: branch._id,
                memberId: cfg.member._id, planId: cfg.plan._id,
                status: 'active', startDate: cfg.start, endDate: cfg.end, autoRenew: true,
                pricing: { basePrice: cfg.price, taxAmount: cfg.tax, discountAmount: 0, addOnsTotal: 0, totalAmount: cfg.total },
                addOns: [], freezeHistory: [], renewalHistory: [], notes: '',
            });
        }
        console.log('✅ 4 Subscriptions created');

        // ─── 10. PAYMENTS ────────────────────────────────────────────────────
        let inv = 1001;
        const paymentRecords = [
            { memberId: members[0]._id, planId: planMonthly._id,   amount: 1770,  paidAt: monthsAgo(3), method: 'upi',         type: 'subscription' },
            { memberId: members[0]._id, planId: planMonthly._id,   amount: 1770,  paidAt: monthsAgo(2), method: 'upi',         type: 'renewal' },
            { memberId: members[0]._id, planId: planMonthly._id,   amount: 1770,  paidAt: monthsAgo(1), method: 'cash',        type: 'renewal' },
            { memberId: members[1]._id, planId: planQuarterly._id, amount: 4484,  paidAt: monthsAgo(2), method: 'card',        type: 'subscription' },
            { memberId: members[2]._id, planId: planAnnual._id,    amount: 12744, paidAt: monthsAgo(4), method: 'net_banking', type: 'subscription' },
            { memberId: members[2]._id, planId: planAnnual._id,    amount: 5500,  paidAt: monthsAgo(3), method: 'upi',         type: 'addon' },
            { memberId: members[2]._id, planId: planAnnual._id,    amount: 5500,  paidAt: monthsAgo(2), method: 'upi',         type: 'addon' },
            { memberId: members[2]._id, planId: planAnnual._id,    amount: 5500,  paidAt: monthsAgo(1), method: 'card',        type: 'addon' },
            { memberId: members[3]._id, planId: planMonthly._id,   amount: 1770,  paidAt: daysAgo(15),  method: 'cash',        type: 'subscription' },
        ];
        for (const p of paymentRecords) {
            await Payment.create({
                tenantId: tenant._id, branchId: branch._id,
                memberId: p.memberId, planId: p.planId,
                invoiceNumber: `SFS-INV-${inv++}`,
                paymentType: p.type as any, type: p.type as any, method: p.method as any, status: 'completed',
                amount: { subtotal: Math.round(p.amount / 1.18), taxAmount: Math.round(p.amount - p.amount / 1.18), discountAmount: 0, total: p.amount },
                taxDetails: { taxType: 'GST', taxRate: 18 },
                paidAt: p.paidAt, collectedBy: ownerUser._id,
                invoice: { generated: true, generatedAt: p.paidAt, emailSent: true, emailSentAt: p.paidAt },
            });
        }
        console.log('✅ 9 Payment records created');

        // ─── 11. ATTENDANCE ──────────────────────────────────────────────────
        const attendanceRecords: any[] = [];
        const now = new Date();

        function generateAttendance(memberId: mongoose.Types.ObjectId, daysBack: number, visitsPerWeek: number) {
            for (let offset = daysBack; offset >= 0; offset--) {
                if (Math.random() < visitsPerWeek / 7) {
                    const checkIn = new Date(now);
                    checkIn.setDate(checkIn.getDate() - offset);
                    const hour = 6 + Math.floor(Math.random() * 3);
                    const min  = Math.floor(Math.random() * 60);
                    checkIn.setHours(hour, min, 0, 0);
                    const duration  = 45 + Math.floor(Math.random() * 60);
                    const checkOut  = new Date(checkIn.getTime() + duration * 60000);
                    attendanceRecords.push({
                        tenantId: tenant._id, branchId: branch._id, memberId,
                        checkInTime: checkIn, checkOutTime: checkOut, duration,
                        method: ['manual','qr','mobile_app'][Math.floor(Math.random() * 3)],
                        isOverstay: false, isFraudulent: false, recordedBy: ownerUser._id,
                    });
                }
            }
        }

        generateAttendance(members[0]._id, 90, 4);
        generateAttendance(members[1]._id, 60, 5);
        generateAttendance(members[2]._id, 120, 6);
        generateAttendance(members[3]._id, 15, 3);

        await Attendance.insertMany(attendanceRecords, { ordered: false });
        console.log(`✅ ~${attendanceRecords.length} attendance records created`);

        // ─── 12. LEADS ───────────────────────────────────────────────────────
        const leadsData = [
            { firstName: 'Rahul', lastName: 'Nair', mobile: '9111111111', email: 'rahul.nair@example.com', status: 'new', source: 'instagram' },
            { firstName: 'Kavya', lastName: 'Iyer', mobile: '9222222222', email: 'kavya.iyer@example.com', status: 'contacted', source: 'referral' },
            { firstName: 'Amit',  lastName: 'Shah', mobile: '9333333333', email: 'amit.shah@example.com',  status: 'qualified', source: 'walk_in' },
        ];
        await Lead.insertMany(leadsData.map(l => ({ tenantId: tenant._id, branchId: branch._id, ...l })));
        console.log('✅ 3 Leads created');

        console.log('\n🎉 Demo seeding complete for Saanvi Fitness Studio!');
        console.log('   Login:      saanvi@gmail.com / Test@123');
        console.log('   Members:    Member@123');
        console.log('   Trainers:   Trainer@123');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding demo data:', error);
        process.exit(1);
    }
};

seedDemoData();
