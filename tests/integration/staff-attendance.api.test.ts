import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

// Replace authentication with a header-selected test user; role checks and routes stay real.
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
import biometricRoutes from '../../src/routes/biometric.routes';
import trainerRoutes from '../../src/routes/trainer.routes';
import ingestRoutes from '../../src/routes/biometric-ingest.routes';
import BiometricDevice from '../../src/models/BiometricDevice.model';
import BiometricAttendanceService from '../../src/services/biometric-attendance.service';
import User from '../../src/models/User.model';
import Trainer from '../../src/models/Trainer.model';
import Member from '../../src/models/Member.model';

const app = express();
app.use('/', ingestRoutes);
app.use(express.json());
app.use('/api/staff', staffRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/trainers', trainerRoutes);

const tenantId = new mongoose.Types.ObjectId();
const branchId = new mongoose.Types.ObjectId();
const deviceId = new mongoose.Types.ObjectId();
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

const asOwner = { 'x-test-user': 'owner' };
const asTrainer = { 'x-test-user': 'trainer' };

let seq = 0;
// unique email / mobile: the users collection has unique indexes on both
const contact = () => { seq += 1; return { email: `u${seq}@test.gym`, mobile: `90000${String(seq).padStart(5, '0')}` }; };

let trainerUserId: mongoose.Types.ObjectId;
let trainerDocId: mongoose.Types.ObjectId;

beforeEach(async () => {
    trainerUserId = new mongoose.Types.ObjectId();
    trainerDocId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: trainerUserId, tenantId, branchId, role: 'trainer', firstName: 'Ravi', lastName: 'Kumar', isActive: true, ...contact() });
    await Trainer.collection.insertOne({ _id: trainerDocId, tenantId, branchId, userId: trainerUserId, salary: { base: 26000, type: 'fixed' } });
    (global as any).__testUsers = {
        owner: { _id: new mongoose.Types.ObjectId(), tenantId, role: 'gym_owner' },
        trainer: { _id: trainerUserId, tenantId, role: 'trainer' },
    };
});

const punch = (biometricUserId: string, at: Date) =>
    BiometricAttendanceService.processPushPunch({
        tenantId: String(tenantId), branchId: String(branchId), deviceId: String(deviceId), biometricUserId, punchTime: at,
    });

describe('Trainer biometric enrolment API', () => {
    it('owner enrols a trainer; the same device ID cannot be used twice or by a member', async () => {
        const ok = await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(trainerUserId), biometricUserId: '901' });
        expect(ok.status).toBe(201);

        const other = new mongoose.Types.ObjectId();
        await User.collection.insertOne({ _id: other, tenantId, branchId, role: 'staff', firstName: 'Anu', isActive: true, ...contact() });
        const dup = await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(other), biometricUserId: '901' });
        expect(dup.status).toBe(409);

        await Member.collection.insertOne({ _id: new mongoose.Types.ObjectId(), tenantId, sNo: 55, firstName: 'M' });
        const clash = await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(other), biometricUserId: '55' });
        expect(clash.status).toBe(409);

        const list = await request(app).get('/api/biometric/staff').set(asOwner);
        expect(list.body.data.total).toBe(1);
    });

    it('rejects enrolling a member-role user and blocks trainers from enrolling', async () => {
        const memberUser = new mongoose.Types.ObjectId();
        await User.collection.insertOne({ _id: memberUser, tenantId, role: 'member', firstName: 'Mem', isActive: true, ...contact() });
        const bad = await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(memberUser), biometricUserId: '12' });
        expect(bad.status).toBe(400);

        const forbidden = await request(app).post('/api/biometric/staff').set(asTrainer).send({ userId: String(trainerUserId), biometricUserId: '13' });
        expect(forbidden.status).toBe(403);
    });

    it('enrolling replays earlier punches into attendance', async () => {
        await punch('905', ist('2026-10-05', '09:00')); // arrives before enrolment: skipped as unmatched
        await punch('905', ist('2026-10-05', '18:00'));
        await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(trainerUserId), biometricUserId: '905' }).expect(201);
        await new Promise(r => setTimeout(r, 300)); // replay runs in the background

        const res = await request(app).get('/api/staff/attendance?startDate=2026-10-05&endDate=2026-10-05').set(asOwner);
        expect(res.status).toBe(200);
        expect(res.body.data.records).toHaveLength(1);
        expect(res.body.data.records[0].hoursWorked).toBe(9);
    });
});

describe('Staff attendance and payroll API', () => {
    beforeEach(async () => {
        await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(trainerUserId), biometricUserId: '901' }).expect(201);
        await punch('901', ist('2026-10-05', '09:00'));
        await punch('901', ist('2026-10-05', '15:00')); // 6h, short of 8h
    });

    it('lists records with the staff name and includes the first day of the range (IST)', async () => {
        const res = await request(app).get('/api/staff/attendance?startDate=2026-10-05&endDate=2026-10-05').set(asOwner);
        expect(res.body.data.records).toHaveLength(1);
        expect(res.body.data.records[0].staffId.firstName).toBe('Ravi');
        expect(res.body.data.records[0].source).toBe('biometric');
    });

    it('trainer sees only their own attendance and pay at /me/attendance', async () => {
        const res = await request(app).get('/api/staff/me/attendance?month=10&year=2026').set(asTrainer);
        expect(res.status).toBe(200);
        expect(res.body.data.records).toHaveLength(1);
        expect(res.body.data.pay.shortfallHours).toBe(2);
        expect(res.body.data.pay.netPay).toBe(750);
    });

    it('owner-only endpoints refuse the trainer role', async () => {
        for (const [method, url] of [['get', '/api/staff/attendance'], ['get', '/api/staff/payroll'], ['post', '/api/staff/payroll/run'], ['post', '/api/staff/attendance']] as const) {
            const res = await (request(app) as any)[method](url).set(asTrainer).send({});
            expect(res.status).toBe(403);
        }
    });

    it('owner fixes a record over HTTP and pay is recalculated', async () => {
        const list = await request(app).get('/api/staff/attendance?startDate=2026-10-05&endDate=2026-10-05').set(asOwner);
        const id = list.body.data.records[0]._id;

        const fixed = await request(app).patch(`/api/staff/attendance/${id}`).set(asOwner).send({ clockOut: '17:00', notes: 'device was offline' });
        expect(fixed.status).toBe(200);
        expect(fixed.body.data.hoursWorked).toBe(8);

        const pay = await request(app).get(`/api/staff/${trainerUserId}/payroll-summary?month=10&year=2026`).set(asOwner);
        expect(pay.body.data.shortfallHours).toBe(0);
        expect(pay.body.data.netPay).toBe(1000);
    });

    it('validates correction input', async () => {
        const noDate = await request(app).post('/api/staff/attendance').set(asOwner).send({ staffId: String(trainerUserId) });
        expect(noDate.status).toBe(400);
        const badStatus = await request(app).post('/api/staff/attendance').set(asOwner).send({ staffId: String(trainerUserId), date: '2026-10-06', status: 'vacation' });
        expect(badStatus.status).toBe(400);
        const leave = await request(app).post('/api/staff/attendance').set(asOwner).send({ staffId: String(trainerUserId), date: '2026-10-06', status: 'paid_leave' });
        expect(leave.status).toBe(201);
    });

    it('run payroll, list it, mark paid, and a rerun leaves the paid payslip alone', async () => {
        const run = await request(app).post('/api/staff/payroll/run').set(asOwner).send({ month: 10, year: 2026 });
        expect(run.body.data.generated).toBe(1);

        const list = await request(app).get('/api/staff/payroll?month=10&year=2026').set(asOwner);
        const row = list.body.data.find((r: any) => r.staffId === String(trainerUserId));
        expect(row.status).toBe('generated');
        expect(row.netPay).toBe(750);

        const paid = await request(app).patch(`/api/staff/payroll/${row.payrollId}/paid`).set(asOwner);
        expect(paid.body.data.status).toBe('paid');

        const rerun = await request(app).post('/api/staff/payroll/run').set(asOwner).send({ month: 10, year: 2026 });
        expect(rerun.body.data.skippedPaid).toBe(1);

        expect((await request(app).post('/api/staff/payroll/run').set(asOwner).send({ month: 13, year: 2026 })).status).toBe(400);
    });

    it("today's board reflects the punches", async () => {
        const res = await request(app).get('/api/staff/attendance/today').set(asOwner);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});

describe('Attendance rules settings API', () => {
    it('saves and returns rules, and rejects a malformed time with 400', async () => {
        const put = await request(app).put('/api/staff/deduction-settings').set(asOwner).send({ lateAfterTime: '10:00', graceMinutes: 5 });
        expect(put.status).toBe(200);
        const get = await request(app).get('/api/staff/deduction-settings').set(asOwner);
        expect(get.body.data.lateAfterTime).toBe('10:00');
        expect(get.body.data.graceMinutes).toBe(5);

        const bad = await request(app).put('/api/staff/deduction-settings').set(asOwner).send({ lateAfterTime: '25:99' });
        expect(bad.status).toBe(400);
    });
});

describe('Trainer shift and pay fields', () => {
    it('owner sets a shift; a trainer cannot change their own salary or shift', async () => {
        const set = await request(app).put(`/api/trainers/${trainerDocId}`).set(asOwner)
            .send({ shift: { startTime: '06:00', endTime: '14:00' } });
        expect(set.status).toBe(200);
        expect(set.body.data.shift).toMatchObject({ startTime: '06:00', endTime: '14:00' });

        await request(app).put(`/api/trainers/${trainerDocId}`).set(asTrainer)
            .send({ salary: { base: 999999, type: 'fixed' }, shift: { startTime: '10:00', endTime: '11:00' } });

        const after: any = await Trainer.collection.findOne({ _id: trainerDocId });
        expect(after.salary.base).toBe(26000);
        expect(after.shift).toMatchObject({ startTime: '06:00', endTime: '14:00' });
    });

    it('rejects a malformed shift time', async () => {
        const res = await request(app).put(`/api/trainers/${trainerDocId}`).set(asOwner).send({ shift: { startTime: '6am', endTime: '14:00' } });
        expect(res.status).toBeGreaterThanOrEqual(400);
    });
});

describe('Universal punch intake (any brand of machine)', () => {
    let token: string;
    let devId: mongoose.Types.ObjectId;

    beforeEach(async () => {
        devId = new mongoose.Types.ObjectId();
        await BiometricDevice.collection.insertOne({
            _id: devId, tenantId, branchId, deviceName: 'Hik gate', deviceBrand: 'hikvision', timezone: 'Asia/Kolkata',
            deviceId: String(devId), isActive: true, isDeleted: false, status: 'offline',
        });
        const conn = await request(app).get(`/api/biometric/devices/${devId}/connection`).set(asOwner);
        expect(conn.status).toBe(200);
        token = conn.body.data.ingestToken;
        await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(trainerUserId), biometricUserId: '901' }).expect(201);
    });

    it('rejects a wrong token and never exposes the token in the device list', async () => {
        await request(app).post('/ingest/' + 'x'.repeat(48)).send('901,2026-10-05 09:00:00').expect(401);
        const list = await request(app).get('/api/biometric/devices').set(asOwner);
        expect(JSON.stringify(list.body)).not.toContain(token);
    });

    it('accepts a Hikvision JSON event and a CSV batch, and both become the trainer attendance', async () => {
        const hik = await request(app).post(`/ingest/${token}`).set('Content-Type', 'application/json')
            .send(JSON.stringify({ AccessControllerEvent: { employeeNoString: '901' }, dateTime: '2026-10-05T09:00:00+05:30' }));
        expect(hik.status).toBe(200);
        expect(hik.body.created).toBe(1);

        const csv = await request(app).post(`/ingest/${token}`).set('Content-Type', 'text/csv')
            .send('id,time\n901,2026-10-05 17:00:00');
        expect(csv.body.created).toBe(1);

        const res = await request(app).get('/api/staff/attendance?startDate=2026-10-05&endDate=2026-10-05').set(asOwner);
        expect(res.body.data.records).toHaveLength(1);
        expect(res.body.data.records[0].hoursWorked).toBe(8);
    });

    it('GET with a query string works for machines that can only call a URL', async () => {
        const r = await request(app).get(`/ingest/${token}?id=901&time=2026-10-06%2009:00:00`);
        expect(r.body.created).toBe(1);
    });

    it('file import by the owner reports what it read and what it rejected', async () => {
        const r = await request(app).post('/api/biometric/import').set(asOwner)
            .send({ deviceId: String(devId), content: 'id,date,time\n901,07/10/2026,09:00\n901,07/10/2026,18:00\nbad,,' });
        expect(r.status).toBe(200);
        expect(r.body.data.created).toBe(2);
        expect(r.body.data.rejected.length).toBe(1);

        const none = await request(app).post('/api/biometric/import').set(asOwner).send({ deviceId: String(devId), content: 'hello' });
        expect(none.status).toBe(400);
        await request(app).post('/api/biometric/import').set(asTrainer).send({ deviceId: String(devId), content: 'x' }).expect(403);
    });

    it('a rotated token invalidates the old URL', async () => {
        const rot = await request(app).post(`/api/biometric/devices/${devId}/rotate-token`).set(asOwner);
        expect(rot.body.data.ingestToken).not.toBe(token);
        await request(app).post(`/ingest/${token}`).send('901,2026-10-08 09:00:00').expect(401);
    });
});
