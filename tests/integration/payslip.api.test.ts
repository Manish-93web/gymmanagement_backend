import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

jest.mock('../../src/middleware/auth.middleware', () => ({
    authenticate: (req: any, res: any, next: any) => {
        const user = (global as any).__testUsers?.[String(req.headers['x-test-user'])];
        if (!user) return res.status(401).json({ success: false, message: 'unauthenticated' });
        req.user = user;
        req.tenantId = String(user.tenantId);
        next();
    },
}));
jest.mock('../../src/middleware/tenant.middleware', () => ({
    tenantContext: (req: any, _res: any, next: any) => next(),
}));

import staffRoutes from '../../src/routes/staff.routes';
import trainerRoutes from '../../src/routes/trainer.routes';
import publicRoutes from '../../src/routes/public.routes';
import biometricRoutes from '../../src/routes/biometric.routes';
import BiometricAttendanceService from '../../src/services/biometric-attendance.service';
import PayslipService from '../../src/services/payslip.service';
import User from '../../src/models/User.model';
import Trainer from '../../src/models/Trainer.model';
import Tenant from '../../src/models/Tenant.model';
import StaffAttendance from '../../src/models/StaffAttendance.model';
import { rupeesInWords } from '../../src/utils/amount-words';

const app = express();
app.use(express.json());
app.use('/api/staff', staffRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/public', publicRoutes);

const tenantId = new mongoose.Types.ObjectId();
const branchId = new mongoose.Types.ObjectId();
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);
const asOwner = { 'x-test-user': 'owner' };
const asTrainer = { 'x-test-user': 'trainer' };
const asOtherGym = { 'x-test-user': 'otherOwner' };

let seq = 0;
const contact = () => { seq += 1; return { email: `p${seq}@test.gym`, mobile: `92000${String(seq).padStart(5, '0')}` }; };
let trainerUserId: mongoose.Types.ObjectId;
let trainerDocId: mongoose.Types.ObjectId;

beforeEach(async () => {
    await StaffAttendance.deleteMany({});
    await Tenant.collection.deleteMany({ _id: tenantId });
    await Tenant.collection.insertOne({ _id: tenantId, name: 'Iron Temple Fitness', contactInfo: { phone: '9800000000', email: 'hello@iron.test', address: '12 MG Road', city: 'Pune' } });
    trainerUserId = new mongoose.Types.ObjectId();
    trainerDocId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: trainerUserId, tenantId, branchId, role: 'trainer', firstName: 'Ravi', lastName: 'Kumar', isActive: true, email: 'ravi@test.gym', mobile: 'no-mobile-abc' });
    await Trainer.collection.insertOne({ _id: trainerDocId, tenantId, branchId, userId: trainerUserId, salary: { base: 26000, type: 'fixed' } });
    (global as any).__testUsers = {
        owner: { _id: new mongoose.Types.ObjectId(), tenantId, role: 'gym_owner' },
        trainer: { _id: trainerUserId, tenantId, role: 'trainer' },
        otherOwner: { _id: new mongoose.Types.ObjectId(), tenantId: new mongoose.Types.ObjectId(), role: 'gym_owner' },
    };
    await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(trainerUserId), biometricUserId: '901' });
    await BiometricAttendanceService.processPushPunch({ tenantId: String(tenantId), branchId: String(branchId), biometricUserId: '901', punchTime: ist('2026-10-05', '09:00') } as any);
    await BiometricAttendanceService.processPushPunch({ tenantId: String(tenantId), branchId: String(branchId), biometricUserId: '901', punchTime: ist('2026-10-05', '15:00') } as any);
});

describe('Amount in words', () => {
    it('uses Indian grouping', () => {
        expect(rupeesInWords(0)).toBe('Rupees Zero Only');
        expect(rupeesInWords(750)).toBe('Rupees Seven Hundred Fifty Only');
        expect(rupeesInWords(12500)).toBe('Rupees Twelve Thousand Five Hundred Only');
        expect(rupeesInWords(125000)).toBe('Rupees One Lakh Twenty Five Thousand Only');
        expect(rupeesInWords(12345678)).toBe('Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only');
        expect(rupeesInWords(10.5)).toBe('Rupees Ten and Fifty Paise Only');
    });
});

describe('Salary slip PDF', () => {
    it('the owner gets a PDF named after the person and month', async () => {
        const res = await request(app).get(`/api/staff/${trainerUserId}/payslip.pdf?month=10&year=2026`).set(asOwner).buffer(true).parse((r, cb) => {
            const chunks: Buffer[] = [];
            r.on('data', (c: Buffer) => chunks.push(c));
            r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/pdf/);
        expect(res.headers['content-disposition']).toContain('Salary_Slip_Ravi_Kumar_October_2026.pdf');
        expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
        expect((res.body as Buffer).length).toBeGreaterThan(2000);
    });

    it('is owner-only and never crosses gyms', async () => {
        await request(app).get(`/api/staff/${trainerUserId}/payslip.pdf?month=10&year=2026`).set(asTrainer).expect(403);
        await request(app).get(`/api/staff/${trainerUserId}/payslip.pdf?month=10&year=2026`).set(asOtherGym).expect(404);
        await request(app).get(`/api/staff/${trainerUserId}/payslip.pdf?month=13&year=2026`).set(asOwner).expect(400);
    });
});

describe('Sending the slip on WhatsApp', () => {
    const share = () => request(app).post(`/api/staff/${trainerUserId}/payslip/share`).set(asOwner).send({ month: 10, year: 2026 });

    it('asks for a phone number first when there is none', async () => {
        const res = await share();
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('NO_PHONE');
    });

    it('with a number, gives a WhatsApp link whose slip opens without logging in', async () => {
        await request(app).put(`/api/trainers/${trainerDocId}`).set(asOwner).send({ mobile: '+91 98765-43210' }).expect(200);

        const res = await share();
        expect(res.status).toBe(200);
        expect(res.body.data.phone).toBe('9876543210');
        expect(res.body.data.whatsapp).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
        const message = decodeURIComponent(res.body.data.whatsapp.split('?text=')[1]);
        expect(message).toContain('Hi Ravi');
        expect(message).toContain('Iron Temple Fitness');
        expect(message).toContain(res.body.data.url);

        const path = new URL(res.body.data.url).pathname;
        const open = await request(app).get(path);                       // no login header
        expect(open.status).toBe(200);
        expect(open.headers['content-type']).toMatch(/application\/pdf/);
    });

    it('a changed or expired link is refused', async () => {
        const token = PayslipService.shareToken(String(tenantId), String(trainerUserId), 10, 2026);
        await request(app).get(`/api/public/payslips/${token}x`).expect(404);
        await request(app).get('/api/public/payslips/not-a-token').expect(404);
        expect(PayslipService.readShareToken(token)).toMatchObject({ s: String(trainerUserId), m: 10, y: 2026 });
    });
});

describe('Phone number when onboarding', () => {
    beforeEach(async () => {
        await mongoose.connection.collection('branches').deleteMany({ tenantId });
        await mongoose.connection.collection('branches').insertOne({ _id: branchId, tenantId, name: 'Main' });
    });
    const onboard = (body: any) => request(app).post('/api/trainers').set(asOwner).send({ role: 'trainer', ...body });

    it('is saved as a clean 10-digit number', async () => {
        const res = await onboard({ firstName: 'Meena', mobile: '+91 91234 56789' });
        expect(res.status).toBe(201);
        const u: any = await User.collection.findOne({ _id: new mongoose.Types.ObjectId(String(res.body.data.userId)) });
        expect(u.mobile).toBe('9123456789');
    });

    it('stays optional, rejects a malformed one, and refuses a number another account has', async () => {
        expect((await onboard({ firstName: 'NoPhone' })).status).toBe(201);
        expect((await onboard({ firstName: 'Bad', mobile: '12345' })).status).toBe(400);
        await onboard({ firstName: 'First', mobile: '9000011111' }).then(r => expect(r.status).toBe(201));
        const dup = await onboard({ firstName: 'Second', mobile: '9000011111' });
        expect(dup.status).toBe(409);
    });
});
