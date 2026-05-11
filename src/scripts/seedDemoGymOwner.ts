import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

import User from '../models/User.model';
import Tenant from '../models/Tenant.model';
import Branch from '../models/Branch.model';
import Member from '../models/Member.model';
import MembershipPlan from '../models/MembershipPlan.model';
import Trainer from '../models/Trainer.model';
import Subscription from '../models/Subscription.model';
import Payment from '../models/Payment.model';
import Attendance from '../models/Attendance.model';
import Lead from '../models/Lead.model';
import Class from '../models/Class.model';
import Product from '../models/Product.model';
import Notification from '../models/Notification.model';

import {
    FIRST_NAMES, LAST_NAMES, CITIES, GOALS, BLOOD_GROUPS, TRAINER_DEFS, CLASS_DEFS,
    LEAD_SOURCES, LEAD_STAGES, PRODUCT_DEFS,
    rand, randInt, daysAgo, daysFromNow, monthsAgo, monthsFromNow,
    randomMobile, randomInvoiceNo, randomCheckInTime,
} from './demoDataGenerator';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-management';

const DAY_MAP: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
};

async function insertInBatches<T>(model: mongoose.Model<any>, docs: T[], batchSize = 500): Promise<void> {
    for (let i = 0; i < docs.length; i += batchSize) {
        await model.insertMany(docs.slice(i, i + batchSize), { ordered: false });
    }
}

const seedDemoGymOwner = async () => {
    try {
        console.log('🌱 Starting Demo Gym Owner seeding (Manish Fitness)...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // ─── 1. CLEAN UP ─────────────────────────────────────────────────────
        console.log('🗑️  Cleaning up existing Manish Fitness data...');
        const existingTenant = await Tenant.findOne({ slug: 'manishfitness' });
        if (existingTenant) {
            const tid = existingTenant._id;
            await Promise.all([
                Attendance.deleteMany({ tenantId: tid }),
                Payment.deleteMany({ tenantId: tid }),
                Subscription.deleteMany({ tenantId: tid }),
                Lead.deleteMany({ tenantId: tid }),
                Notification.deleteMany({ tenantId: tid }),
                Class.deleteMany({ tenantId: tid }),
                Product.deleteMany({ tenantId: tid }),
                Trainer.deleteMany({ tenantId: tid }),
                Member.deleteMany({ tenantId: tid }),
                MembershipPlan.deleteMany({ tenantId: tid }),
                Branch.deleteMany({ tenantId: tid }),
                Tenant.deleteOne({ _id: tid }),
            ]);
        }
        await User.deleteMany({
            email: {
                $in: [
                    'mkfitness@gmail.com',
                    ...TRAINER_DEFS.map(t => `${t.firstName.toLowerCase()}.${t.lastName.toLowerCase()}@mkfitness.com`),
                ],
            },
        });
        await User.deleteMany({ email: /^mkf\.member\.\d+@mkfitness\.com$/ });
        console.log('✅ Cleanup complete');

        // ─── 2. TENANT ───────────────────────────────────────────────────────
        const tenant = await Tenant.create({
            name: 'Manish Fitness',
            slug: 'manishfitness',
            isActive: true,
            subscription: {
                plan: 'enterprise', status: 'active', startDate: monthsAgo(12),
                maxBranches: 10, maxMembers: 2000, maxTrainers: 50,
            },
            features: {
                aiEnabled: true, onlineClasses: true, pos: true,
                whatsappIntegration: true, smsNotifications: true,
                emailNotifications: true, customDomain: true, multiCurrency: false,
            },
            contactInfo: { email: 'info@manishfitness.com', phone: '9811000001', website: 'https://manishfitness.com' },
        });
        console.log('✅ Tenant created:', tenant.name);

        // ─── 3. BRANCH ───────────────────────────────────────────────────────
        const branch = await Branch.create({
            tenantId: tenant._id,
            name: 'Main Branch', code: 'MKF-MAIN', isActive: true,
            contactInfo: {
                address: '12, Fitness Street, Connaught Place',
                city: 'Delhi', state: 'Delhi', country: 'India', zipCode: '110001',
                phone: '9811000002', email: 'main@manishfitness.com',
            },
            operatingHours: [
                { day: 'monday',    openTime: '05:30', closeTime: '23:00', isClosed: false },
                { day: 'tuesday',   openTime: '05:30', closeTime: '23:00', isClosed: false },
                { day: 'wednesday', openTime: '05:30', closeTime: '23:00', isClosed: false },
                { day: 'thursday',  openTime: '05:30', closeTime: '23:00', isClosed: false },
                { day: 'friday',    openTime: '05:30', closeTime: '23:00', isClosed: false },
                { day: 'saturday',  openTime: '06:00', closeTime: '22:00', isClosed: false },
                { day: 'sunday',    openTime: '07:00', closeTime: '14:00', isClosed: false },
            ],
            capacity: { maxMembers: 500, currentMembers: 180 },
            amenities: ['Parking', 'Locker Room', 'Showers', 'Cafeteria', 'WiFi', 'AC', 'Steam Room', 'Swimming Pool'],
        });
        console.log('✅ Branch created:', branch.name);

        // ─── 4. GYM OWNER ────────────────────────────────────────────────────
        const ownerUser = new User({
            firstName: 'Manish', lastName: 'Kumar',
            email: 'mkfitness@gmail.com', mobile: '9811000001',
            password: 'Demo@123', role: 'gym_owner',
            tenantId: tenant._id, branchId: branch._id,
            isActive: true, isEmailVerified: true, isMobileVerified: true,
        });
        await ownerUser.save();
        console.log('✅ Gym Owner: mkfitness@gmail.com / Demo@123');

        // ─── 5. MEMBERSHIP PLANS ─────────────────────────────────────────────
        const plans = await MembershipPlan.insertMany([
            {
                tenantId: tenant._id, branchId: branch._id,
                name: 'Basic Monthly', description: 'Full gym access for one month',
                type: 'time_based', duration: 'monthly', durationValue: 1,
                pricing: { basePrice: 1499, taxRate: 18, discountPercent: 0, finalPrice: 1769 },
                features: {
                    gymAccess: true, groupClasses: false, personalTraining: false,
                    onlineClasses: false, dietPlan: false, lockerFacility: true,
                    freezeAllowed: true, maxFreezes: 1, freezeDuration: 7, branchTransferAllowed: false,
                },
                isActive: true, currentMembers: 55,
            },
            {
                tenantId: tenant._id, branchId: branch._id,
                name: 'Pro Quarterly', description: 'Gym + Group classes for 3 months',
                type: 'time_based', duration: 'quarterly', durationValue: 3,
                pricing: { basePrice: 3999, taxRate: 18, discountPercent: 5, finalPrice: 4487 },
                features: {
                    gymAccess: true, groupClasses: true, personalTraining: false,
                    onlineClasses: true, dietPlan: true, lockerFacility: true,
                    freezeAllowed: true, maxFreezes: 2, freezeDuration: 14, branchTransferAllowed: true,
                },
                isActive: true, currentMembers: 50,
            },
            {
                tenantId: tenant._id, branchId: branch._id,
                name: 'Elite Annual', description: 'All-inclusive yearly membership',
                type: 'time_based', duration: 'yearly', durationValue: 1,
                pricing: { basePrice: 11999, taxRate: 18, discountPercent: 10, finalPrice: 12743 },
                features: {
                    gymAccess: true, groupClasses: true, personalTraining: true,
                    onlineClasses: true, dietPlan: true, lockerFacility: true,
                    freezeAllowed: true, maxFreezes: 3, freezeDuration: 30, branchTransferAllowed: true,
                },
                isActive: true, currentMembers: 35,
            },
            {
                tenantId: tenant._id, branchId: branch._id,
                name: 'Half Yearly', description: '6-month gym access + group classes',
                type: 'time_based', duration: 'half_yearly', durationValue: 6,
                pricing: { basePrice: 6999, taxRate: 18, discountPercent: 7, finalPrice: 7681 },
                features: {
                    gymAccess: true, groupClasses: true, personalTraining: false,
                    onlineClasses: true, dietPlan: false, lockerFacility: true,
                    freezeAllowed: true, maxFreezes: 2, freezeDuration: 21, branchTransferAllowed: true,
                },
                isActive: true, currentMembers: 28,
            },
            {
                tenantId: tenant._id, branchId: branch._id,
                name: 'PT Premium', description: 'Personal training sessions pack',
                type: 'session_based', duration: 'monthly', durationValue: 1,
                pricing: { basePrice: 8999, taxRate: 18, discountPercent: 0, finalPrice: 10619 },
                features: {
                    gymAccess: true, groupClasses: true, personalTraining: true,
                    onlineClasses: true, dietPlan: true, lockerFacility: true,
                    freezeAllowed: false, maxFreezes: 0, freezeDuration: 0, branchTransferAllowed: true,
                },
                isActive: true, currentMembers: 12,
            },
        ]);
        console.log('✅ 5 Membership Plans created');

        // ─── 6. TRAINERS ─────────────────────────────────────────────────────
        const trainerUsers: any[] = [];
        for (const def of TRAINER_DEFS) {
            const u = new User({
                firstName: def.firstName, lastName: def.lastName,
                email: `${def.firstName.toLowerCase()}.${def.lastName.toLowerCase()}@mkfitness.com`,
                mobile: def.mobile, password: 'Trainer@123', role: 'trainer',
                tenantId: tenant._id, branchId: branch._id,
                isActive: true, isEmailVerified: true, isMobileVerified: true,
            });
            await u.save();
            trainerUsers.push(u);
        }

        const trainerDocs: any[] = [];
        for (let i = 0; i < TRAINER_DEFS.length; i++) {
            const def = TRAINER_DEFS[i];
            const allDays = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
            trainerDocs.push({
                tenantId: tenant._id, branchId: branch._id, userId: trainerUsers[i]._id,
                specializations: def.specs,
                certifications: [
                    { name: 'Certified Personal Trainer', issuedBy: 'NASM', issuedDate: daysAgo(randInt(365, 1460)) },
                    { name: 'Fitness Nutrition Specialist', issuedBy: 'ISSA', issuedDate: daysAgo(randInt(180, 730)) },
                ],
                experience: {
                    years: def.years,
                    previousGyms: ['Gold\'s Gym', 'Talwalkars'],
                    achievements: [`Best Trainer ${2020 + (i % 4)}`],
                },
                availability: allDays.map(day => ({
                    day,
                    isAvailable: day !== 'sunday',
                    slots: day !== 'sunday'
                        ? [{ startTime: '06:00', endTime: '10:00', isBooked: false }, { startTime: '17:00', endTime: '21:00', isBooked: false }]
                        : [],
                })),
                pricing: {
                    hourlyRate: 700 + i * 50,
                    sessionPackages: [
                        { sessions: 8,  price: 5000 + i * 200, validityDays: 30 },
                        { sessions: 20, price: 11000 + i * 400, validityDays: 60 },
                    ],
                },
                revenueSharing: { enabled: true, percentage: 25 + (i % 3) * 5, minimumSessions: 10 },
                ratings: { average: def.rating, totalReviews: randInt(15, 50), reviews: [] },
                kpis: {
                    totalClients: randInt(20, 40), activeClients: randInt(8, 20),
                    totalSessions: randInt(100, 300), totalRevenue: randInt(60000, 150000),
                    averageRating: def.rating, retentionRate: randInt(82, 96),
                },
                isActive: true,
            });
        }
        const trainers = await Trainer.insertMany(trainerDocs);
        console.log(`✅ ${trainers.length} Trainers created`);

        // ─── 7. MEMBERS (180) ────────────────────────────────────────────────
        console.log('⏳ Creating 180 members...');
        const memberPasswordHash = await bcrypt.hash('Member@123', 10);
        const FITNESS_LEVELS = ['beginner', 'intermediate', 'advanced'];
        const GENDERS = ['male', 'female'];
        const METHODS: any[] = ['manual', 'qr', 'mobile_app', 'rfid'];
        const planWeights = [55, 50, 35, 28, 12]; // matches plan currentMembers

        const memberUserDocs: any[] = [];
        for (let i = 0; i < 180; i++) {
            const fn = rand(FIRST_NAMES);
            const ln = rand(LAST_NAMES);
            memberUserDocs.push({
                firstName: fn, lastName: ln,
                email: `mkf.member.${i + 1}@mkfitness.com`,
                mobile: randomMobile(),
                password: memberPasswordHash,
                role: 'member',
                tenantId: tenant._id, branchId: branch._id,
                isActive: true, isEmailVerified: true, isMobileVerified: true,
            });
        }
        const memberUsers = await User.insertMany(memberUserDocs);
        console.log(`✅ ${memberUsers.length} Member user accounts created`);

        // Build Member documents
        const memberDocs: any[] = [];
        for (let i = 0; i < 180; i++) {
            const u = memberUsers[i];
            // Weighted plan selection
            const planRoll = randInt(0, 179);
            let planIdx = 0;
            let cumulative = 0;
            for (let p = 0; p < planWeights.length; p++) {
                cumulative += planWeights[p];
                if (planRoll < cumulative) { planIdx = p; break; }
            }
            const plan = plans[planIdx];

            const joinedMonthsAgo = randInt(1, 18);
            const durationMonths = [1, 3, 12, 6, 1][planIdx];
            const memberStart = monthsAgo(joinedMonthsAgo);
            const memberEnd   = daysFromNow(randInt(-30, durationMonths * 30 - joinedMonthsAgo * 30 + 60));
            const isActive    = memberEnd > new Date();
            const gender      = rand(GENDERS);
            const weight      = gender === 'male' ? randInt(60, 100) : randInt(48, 82);
            const height      = gender === 'male' ? randInt(162, 188) : randInt(152, 172);

            memberDocs.push({
                tenantId: tenant._id, branchId: branch._id,
                userId: u._id,
                firstName: u.firstName, lastName: u.lastName,
                email: u.email, mobile: u.mobile,
                membershipNumber: `MKF-2024-${String(i + 1).padStart(3, '0')}`,
                planId: plan._id,
                membershipStart: memberStart,
                membershipExpiry: memberEnd,
                status: isActive ? 'active' : 'expired',
                personalInfo: {
                    dateOfBirth: new Date(1990 - randInt(0, 15), randInt(0, 11), randInt(1, 28)),
                    gender,
                    bloodGroup: rand(BLOOD_GROUPS),
                    fitnessLevel: rand(FITNESS_LEVELS),
                    fitnessGoals: [rand(GOALS)],
                    emergencyContact: { name: rand(FIRST_NAMES) + ' ' + rand(LAST_NAMES), relationship: 'Family', phone: randomMobile() },
                },
                healthInfo: {
                    medicalConditions: [], allergies: [], medications: [], injuries: [], doctorClearance: true,
                },
                measurements: [
                    {
                        date: memberStart,
                        weight, height,
                        bodyFat: randInt(12, 35),
                        muscleMass: randInt(20, 50),
                        bmi: parseFloat((weight / ((height / 100) ** 2)).toFixed(1)),
                        chest: randInt(80, 110), waist: randInt(68, 102),
                        hips: randInt(86, 110), biceps: randInt(22, 42), thighs: randInt(44, 64),
                        recordedBy: ownerUser._id,
                    },
                ],
                gamification: {
                    currentStreak: randInt(0, 21),
                    longestStreak: randInt(7, 45),
                    totalPoints: randInt(100, 5000),
                    level: randInt(1, 8),
                    badges: [],
                },
                walletBalance: rand([0, 0, 0, 250, 500, 1000]),
                referralCode: `MKF-${u.firstName.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
                assignedTrainer: trainers[i % trainers.length]._id,
                source: rand(LEAD_SOURCES),
            });
        }

        await insertInBatches(Member, memberDocs);
        const allMembers = await Member.find({ tenantId: tenant._id }).select('_id planId membershipStart membershipExpiry status').lean();
        console.log(`✅ ${allMembers.length} Member records created`);

        // ─── 8. SUBSCRIPTIONS ────────────────────────────────────────────────
        console.log('⏳ Creating subscriptions...');
        const planPriceMap: Record<string, number> = {};
        plans.forEach(p => { planPriceMap[String(p._id)] = p.pricing.finalPrice; });

        const subDocs = allMembers.map(m => {
            const total = planPriceMap[String(m.planId)] || 1770;
            const subtotal = Math.round(total / 1.18);
            return {
                tenantId: tenant._id, branchId: branch._id,
                memberId: m._id, planId: m.planId,
                status: m.status === 'active' ? 'active' : 'expired',
                startDate: m.membershipStart, endDate: m.membershipExpiry,
                autoRenew: true,
                pricing: { basePrice: subtotal, taxAmount: total - subtotal, discountAmount: 0, addOnsTotal: 0, totalAmount: total },
                addOns: [], freezeHistory: [], renewalHistory: [], notes: '',
            };
        });
        await insertInBatches(Subscription, subDocs);
        console.log(`✅ ${subDocs.length} Subscriptions created`);

        // ─── 9. PAYMENTS ─────────────────────────────────────────────────────
        console.log('⏳ Creating payments...');
        const paymentMethods = ['upi', 'cash', 'card', 'net_banking'];
        const paymentDocs = allMembers.map(m => {
            const total = planPriceMap[String(m.planId)] || 1770;
            const subtotal = Math.round(total / 1.18);
            return {
                tenantId: tenant._id, branchId: branch._id,
                memberId: m._id, planId: m.planId,
                invoiceNumber: randomInvoiceNo(),
                paymentType: 'subscription', type: 'subscription',
                method: rand(paymentMethods), status: 'completed',
                amount: { subtotal, taxAmount: total - subtotal, discountAmount: 0, total },
                taxDetails: { taxType: 'GST', taxRate: 18 },
                paidAt: m.membershipStart,
                collectedBy: ownerUser._id,
                invoice: { generated: true, generatedAt: m.membershipStart, emailSent: true, emailSentAt: m.membershipStart },
            };
        });
        await insertInBatches(Payment, paymentDocs);
        console.log(`✅ ${paymentDocs.length} Payment records created`);

        // ─── 10. ATTENDANCE (90 days) ────────────────────────────────────────
        console.log('⏳ Generating 90-day attendance records (this may take a moment)...');
        const attendanceDocs: any[] = [];
        const today = new Date();

        for (const m of allMembers) {
            if (m.status !== 'active') continue;
            const visitsPerWeek = randInt(3, 6);
            const startTs = m.membershipStart ? new Date(m.membershipStart as any).getTime() : today.getTime() - 90 * 86_400_000;
            const daysBack = Math.min(90, Math.round((today.getTime() - startTs) / 86_400_000));

            for (let offset = daysBack; offset >= 0; offset--) {
                if (Math.random() > visitsPerWeek / 7) continue;
                const baseDate = new Date(today);
                baseDate.setDate(baseDate.getDate() - offset);
                const checkIn = randomCheckInTime(baseDate);
                const duration = randInt(45, 120);
                const checkOut = new Date(checkIn.getTime() + duration * 60_000);
                attendanceDocs.push({
                    tenantId: tenant._id, branchId: branch._id,
                    memberId: m._id,
                    checkInTime: checkIn, checkOutTime: checkOut, duration,
                    method: rand(METHODS),
                    isOverstay: false, isFraudulent: false,
                    notes: '',
                    recordedBy: ownerUser._id,
                });
                // Flush in chunks to avoid memory buildup
                if (attendanceDocs.length >= 1000) {
                    await Attendance.insertMany(attendanceDocs.splice(0), { ordered: false });
                }
            }
        }
        if (attendanceDocs.length > 0) {
            await Attendance.insertMany(attendanceDocs, { ordered: false });
        }
        console.log('✅ Attendance records created (90-day history)');

        // ─── 11. LEADS (50) ──────────────────────────────────────────────────
        const leadDocs = Array.from({ length: 50 }, (_, i) => {
            const fn = rand(FIRST_NAMES);
            const ln = rand(LAST_NAMES);
            const stage = rand(LEAD_STAGES);
            const createdDaysAgo = randInt(1, 90);
            return {
                tenantId: tenant._id, branchId: branch._id,
                firstName: fn, lastName: ln,
                mobile: randomMobile(),
                email: `lead.${i + 1}@example.com`,
                source: rand(LEAD_SOURCES),
                status: stage,
                interestedPlan: rand(['Basic Monthly', 'Pro Quarterly', 'Elite Annual', 'PT Premium']),
                notes: '',
                followUpDate: stage !== 'converted' && stage !== 'lost' ? daysFromNow(randInt(1, 7)) : undefined,
                assignedTo: ownerUser._id,
                createdAt: daysAgo(createdDaysAgo),
            };
        });
        await Lead.insertMany(leadDocs);
        console.log('✅ 50 Leads created');

        // ─── 12. CLASSES ─────────────────────────────────────────────────────
        const classDocs = CLASS_DEFS.map((def, i) => ({
            tenantId: tenant._id, branchId: branch._id,
            name: def.name,
            description: `${def.name} - ${def.level} level class`,
            type: 'group',
            trainerId: trainerUsers[i % trainerUsers.length]._id,
            category: def.category,
            level: def.level,
            schedule: {
                startDate: daysAgo(30),
                endDate: daysFromNow(90),
                startTime: def.time,
                endTime: `${String(parseInt(def.time.split(':')[0]) + Math.floor(def.duration / 60)).padStart(2, '0')}:${String(def.duration % 60).padStart(2, '0')}`,
                duration: def.duration,
                recurrence: 'weekly',
                daysOfWeek: def.days.map(d => DAY_MAP[d]).filter(n => n !== undefined),
            },
            capacity: { max: def.capacity, current: randInt(5, def.capacity - 2), waitlist: 0 },
            pricing: { memberFree: true, dropInPrice: 299 },
            online: { isOnline: false },
            cancellationPolicy: { allowCancellation: true, hoursBeforeClass: 2, penaltyAmount: 0 },
            isActive: true, isCancelled: false,
        }));
        await Class.insertMany(classDocs);
        console.log(`✅ ${classDocs.length} Classes created`);

        // ─── 13. PRODUCTS ────────────────────────────────────────────────────
        const productDocs = PRODUCT_DEFS.map((def, i) => ({
            tenantId: tenant._id, branchId: branch._id,
            name: def.name,
            description: `Premium quality ${def.name}`,
            category: def.category,
            sku: `MKF-${def.category.substring(0, 3).toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
            pricing: {
                cost: def.cost, sellingPrice: def.price,
                memberPrice: Math.round(def.price * 0.9),
                taxRate: 18,
            },
            inventory: {
                currentStock: def.stock, minStock: 5, maxStock: def.stock * 3,
                reorderPoint: 10, unit: 'piece',
            },
            isActive: true, images: [],
        }));
        await Product.insertMany(productDocs);
        console.log(`✅ ${productDocs.length} Products created`);

        // ─── 14. NOTIFICATIONS ───────────────────────────────────────────────
        const sampleMembers = allMembers.slice(0, 5);
        const notifDocs = sampleMembers.map((m, i) => ({
            tenantId: tenant._id, branchId: branch._id,
            recipientId: m._id,
            recipientType: 'member',
            type: ['email', 'sms', 'push'][i % 3],
            status: 'sent',
            subject: ['Welcome to Manish Fitness!', 'Membership Expiry Reminder', 'New Class Added', 'Payment Confirmed', 'Weekly Progress Update'][i],
            message: [
                'Welcome! Your membership is now active.',
                'Your membership expires in 7 days. Renew now to continue.',
                'New CrossFit WOD class added on Monday mornings!',
                'Payment of ₹1,769 received successfully.',
                'You\'ve attended 4 sessions this week. Keep it up!',
            ][i],
            metadata: { triggeredBy: 'system', priority: 'normal' },
            delivery: { sentAt: daysAgo(i + 1), retryCount: 0, maxRetries: 3 },
            attempts: [{ attemptedAt: daysAgo(i + 1), success: true }],
        }));
        await Notification.insertMany(notifDocs);
        console.log('✅ 5 Notifications created');

        // ─── SUMMARY ─────────────────────────────────────────────────────────
        console.log('\n🎉 Manish Fitness demo seeding complete!');
        console.log('─────────────────────────────────────────');
        console.log('   Gym Owner:   mkfitness@gmail.com / Demo@123');
        console.log('   Members:     Member@123  (180 members)');
        console.log('   Trainers:    Trainer@123 (6 trainers)');
        console.log('   Plans:       5 (Basic Monthly → PT Premium)');
        console.log('   Tenant:      manishfitness');
        console.log('─────────────────────────────────────────');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding Demo Gym Owner:', error);
        process.exit(1);
    }
};

seedDemoGymOwner();
