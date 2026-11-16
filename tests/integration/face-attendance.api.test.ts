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
import User from '../../src/models/User.model';
import Tenant from '../../src/models/Tenant.model';
import StaffFace from '../../src/models/StaffFace.model';
import StaffAttendance from '../../src/models/StaffAttendance.model';
import StaffShift from '../../src/models/StaffShift.model';
import Trainer from '../../src/models/Trainer.model';

const app = express();
app.use(express.json());
app.use('/api/staff', staffRoutes);
app.use('/api/trainers', trainerRoutes);

const tenantId = new mongoose.Types.ObjectId();
const branchId = new mongoose.Types.ObjectId();
const asOwner = { 'x-test-user': 'owner' };
const asTrainer = { 'x-test-user': 'trainer' };

// A made-up "face": 128 numbers. The same person is the same numbers plus a little noise; another person is unrelated.
const seeded = (seed: number) => {
    let x = seed;
    return () => { x = (x * 1664525 + 1013904223) % 4294967296; return (x / 4294967296 - 0.5) * 0.4; };
};
const faceOf = (seed: number) => { const r = seeded(seed); return Array.from({ length: 128 }, () => r()); };
const noisy = (face: number[], seed: number, amount = 0.01) => { const r = seeded(seed * 7919); return face.map(v => v + r() * amount); };
const captures = (face: number[], n = 4) => Array.from({ length: n }, (_, i) => noisy(face, i + 1));

let seq = 0;
const contact = () => { seq += 1; return { email: `f${seq}@test.gym`, mobile: `93000${String(seq).padStart(5, '0')}` }; };
let ravi: mongoose.Types.ObjectId;
let anu: mongoose.Types.ObjectId;
const RAVI_FACE = faceOf(11);
const ANU_FACE = faceOf(222);

const enroll = (staffId: any, descriptors: any) => request(app).post('/api/staff/face/enroll').set(asOwner).send({ staffId: String(staffId), descriptors });
const punch = (staffId: any, action: string, descriptor: any) => request(app).post('/api/staff/face/punch').set(asOwner).send({ staffId: String(staffId), action, descriptor });

beforeEach(async () => {
    await Promise.all([StaffFace.deleteMany({}), StaffAttendance.deleteMany({})]);
    await Tenant.collection.deleteMany({ _id: tenantId });
    await Tenant.collection.insertOne({ _id: tenantId, name: 'Iron Temple Fitness' });
    ravi = new mongoose.Types.ObjectId();
    anu = new mongoose.Types.ObjectId();
    await User.collection.insertMany([
        { _id: ravi, tenantId, branchId, role: 'trainer', firstName: 'Ravi', lastName: 'Kumar', isActive: true, ...contact() },
        { _id: anu, tenantId, branchId, role: 'staff', firstName: 'Anu', lastName: 'Sharma', isActive: true, ...contact() },
    ]);
    (global as any).__testUsers = {
        owner: { _id: new mongoose.Types.ObjectId(), tenantId, role: 'gym_owner' },
        trainer: { _id: ravi, tenantId, role: 'trainer' },
    };
});

describe('Registering a face', () => {
    it('saves 3 to 8 clear captures, and the roster shows who is registered', async () => {
        expect((await enroll(ravi, captures(RAVI_FACE))).status).toBe(200);

        const roster = await request(app).get('/api/staff/face/roster').set(asOwner);
        expect(roster.body.data.gymName).toBe('Iron Temple Fitness');
        const byName = new Map(roster.body.data.people.map((p: any) => [p.name, p]));
        expect(byName.get('Ravi Kumar')).toMatchObject({ faceEnrolled: true, state: 'not_in' });
        expect(byName.get('Anu Sharma')).toMatchObject({ faceEnrolled: false });
    });

    it('refuses too few, malformed, or mixed-up captures', async () => {
        expect((await enroll(ravi, captures(RAVI_FACE, 2))).status).toBe(400);                                  // too few
        expect((await enroll(ravi, [...captures(RAVI_FACE, 3), [1, 2, 3]])).status).toBe(400);                  // wrong size
        expect((await enroll(ravi, [...captures(RAVI_FACE, 2), ...captures(ANU_FACE, 2)])).body.code).toBe('NOT_SAME_PERSON');
        expect((await enroll(ravi, [...captures(RAVI_FACE, 3), Array(128).fill(NaN)])).status).toBe(400);
        expect(await StaffFace.countDocuments()).toBe(0);
    });

    it('will not register one face for two people', async () => {
        await enroll(ravi, captures(RAVI_FACE)).then(r => expect(r.status).toBe(200));
        const again = await enroll(anu, captures(RAVI_FACE));
        expect(again.status).toBe(409);
        expect(again.body.code).toBe('DUPLICATE_FACE');
        expect(again.body.message).toContain('Ravi Kumar');
        expect((await enroll(anu, captures(ANU_FACE))).status).toBe(200);
    });

    it('can be replaced and removed; only owners may do either', async () => {
        await enroll(ravi, captures(RAVI_FACE));
        expect((await enroll(ravi, captures(faceOf(33)))).status).toBe(200);                                      // re-register
        await request(app).post('/api/staff/face/enroll').set(asTrainer).send({ staffId: String(ravi), descriptors: captures(RAVI_FACE) }).expect(403);
        await request(app).delete(`/api/staff/face/${ravi}`).set(asTrainer).expect(403);
        await request(app).delete(`/api/staff/face/${ravi}`).set(asOwner).expect(200);
        await request(app).delete(`/api/staff/face/${ravi}`).set(asOwner).expect(404);
    });
});

describe('Checking in and out with a face', () => {
    beforeEach(async () => { await enroll(ravi, captures(RAVI_FACE)); });

    it('a matching face checks in and out, and the record is marked as a face check-in', async () => {
        const inRes = await punch(ravi, 'check_in', noisy(RAVI_FACE, 50, 0.02));
        expect(inRes.status).toBe(200);
        expect(inRes.body.data).toMatchObject({ name: 'Ravi Kumar', action: 'check_in' });

        const board = await request(app).get('/api/staff/attendance/today').set(asOwner);
        expect(board.body.data.find((b: any) => b.staffId === String(ravi))).toMatchObject({ state: 'checked_in', source: 'face' });

        const outRes = await punch(ravi, 'check_out', noisy(RAVI_FACE, 51, 0.02));
        expect(outRes.status).toBe(200);
        expect(outRes.body.data.action).toBe('check_out');

        const day = new Date().toISOString().slice(0, 10);
        const list = await request(app).get(`/api/staff/attendance?startDate=${day}&endDate=${day}`).set(asOwner);
        const rec = list.body.data.records.find((r: any) => String(r.staffId._id) === String(ravi));
        expect(rec).toMatchObject({ source: 'face' });
        expect(rec.clockOut).toBeTruthy();
    });

    it('the usual attendance rules still apply: no double check-in, no check-out before a check-in', async () => {
        const early = await punch(ravi, 'check_out', noisy(RAVI_FACE, 60));
        expect(early.status).toBe(409);

        await punch(ravi, 'check_in', noisy(RAVI_FACE, 61)).then(r => expect(r.status).toBe(200));
        const twice = await punch(ravi, 'check_in', noisy(RAVI_FACE, 62));
        expect(twice.status).toBe(400);
        expect(twice.body.message).toMatch(/already clocked in/i);
    });

    it("someone else's face is refused, and the attempts are counted", async () => {
        const wrong = await punch(ravi, 'check_in', ANU_FACE);
        expect(wrong.status).toBe(401);
        expect(wrong.body.code).toBe('NO_MATCH');
        expect(await StaffAttendance.countDocuments()).toBe(0);
    });

    it('five wrong tries in a row pause face check-in for that person until the owner unlocks it', async () => {
        for (let i = 0; i < 5; i++) await punch(ravi, 'check_in', ANU_FACE);
        const locked = await punch(ravi, 'check_in', noisy(RAVI_FACE, 70));                                       // even the right face waits
        expect(locked.status).toBe(429);
        expect(locked.body.code).toBe('LOCKED');

        const roster = await request(app).get('/api/staff/face/roster').set(asOwner);
        expect(roster.body.data.people.find((p: any) => p.name === 'Ravi Kumar').faceLocked).toBe(true);

        await request(app).post(`/api/staff/face/${ravi}/unlock`).set(asOwner).expect(200);
        expect((await punch(ravi, 'check_in', noisy(RAVI_FACE, 71))).status).toBe(200);
    });

    it('a right face in between resets the wrong-attempt count', async () => {
        for (let i = 0; i < 4; i++) await punch(ravi, 'check_in', ANU_FACE);
        await punch(ravi, 'check_in', noisy(RAVI_FACE, 80)).then(r => expect(r.status).toBe(200));
        await punch(ravi, 'check_out', ANU_FACE);                                                                   // 1 wrong, not 5
        expect((await punch(ravi, 'check_out', noisy(RAVI_FACE, 81))).status).toBe(200);
    });

    it('needs a registered face, a real descriptor, and a valid choice', async () => {
        expect((await punch(anu, 'check_in', noisy(ANU_FACE, 1))).body.code).toBe('NOT_ENROLLED');
        expect((await punch(ravi, 'check_in', [1, 2, 3])).status).toBe(400);
        expect((await punch(ravi, 'wave', noisy(RAVI_FACE, 90))).status).toBe(400);
        await request(app).post('/api/staff/face/punch').set(asTrainer).send({ staffId: String(ravi), action: 'check_in', descriptor: noisy(RAVI_FACE, 91) }).expect(403);
    });
});

describe('Onboarding other staff', () => {
    beforeEach(async () => {
        await mongoose.connection.collection('branches').deleteMany({ tenantId });
        await mongoose.connection.collection('branches').insertOne({ _id: branchId, tenantId, name: 'Main' });
        await StaffShift.deleteMany({});
    });
    const add = (body: any) => request(app).post('/api/staff').set(asOwner).send({ role: 'staff', ...body });

    it('needs only a first name; email and phone are optional and stand-ins are never shown', async () => {
        const a = await add({ firstName: 'Kiran' });
        const b = await add({ firstName: 'Lata' });                       // a second one with no phone used to clash
        expect(a.status).toBe(201);
        expect(b.status).toBe(201);
        expect(a.body.data).toMatchObject({ email: '', mobile: '', role: 'staff' });
        expect(a.body.data.password).toBeUndefined();

        const list = await request(app).get('/api/staff?limit=50').set(asOwner);
        const kiran = list.body.data.staff.find((u: any) => u.firstName === 'Kiran');
        expect(kiran).toMatchObject({ email: '', mobile: '' });
        expect((await add({ lastName: 'NoName' })).status).toBe(400);
    });

    it('keeps a clean phone number, a salary and a shift, and refuses bad or repeated numbers', async () => {
        const shift = await StaffShift.create({ tenantId, name: 'Front desk', segments: [{ startTime: '09:00', endTime: '17:00' }] });
        const res = await add({ firstName: 'Mohan', mobile: '+91 90000-12345', salary: 18000, shiftId: String(shift._id), role: 'accountant' });
        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({ mobile: '9000012345', salary: 18000, role: 'accountant' });

        const rows = await request(app).get('/api/staff/shifts/assignments').set(asOwner);
        expect(rows.body.data.find((r: any) => r.staffId === String(res.body.data._id))).toMatchObject({ shiftName: 'Front desk' });

        expect((await add({ firstName: 'Bad', mobile: '12345' })).status).toBe(400);
        expect((await add({ firstName: 'Twin', mobile: '9000012345' })).status).toBe(409);
        expect((await add({ firstName: 'Nope', shiftId: String(new mongoose.Types.ObjectId()) })).status).toBe(400);
        expect((await add({ firstName: 'Bad role', role: 'gym_owner' })).status).toBe(400);
    });

    it('their face can be registered straight afterwards and works at the gym phone', async () => {
        const res = await add({ firstName: 'Neha', mobile: '9000099999' });
        const id = res.body.data._id;
        expect((await enroll(id, captures(faceOf(444)))).status).toBe(200);
        expect((await punch(id, 'check_in', noisy(faceOf(444), 3))).status).toBe(200);
    });
});

describe('Face data goes with the person', () => {
    beforeEach(async () => {
        await enroll(ravi, captures(RAVI_FACE));
        await enroll(anu, captures(ANU_FACE));
    });

    it('removing a staff member deletes their face and takes them off the gym phone', async () => {
        await request(app).delete(`/api/staff/${anu}`).set(asOwner).expect(200);
        expect(await StaffFace.countDocuments({ staffId: anu })).toBe(0);
        expect(await StaffFace.countDocuments({ staffId: ravi })).toBe(1);

        const roster = await request(app).get('/api/staff/face/roster').set(asOwner);
        expect(roster.body.data.people.map((p: any) => p.name)).toEqual(['Ravi Kumar']);
    });

    it('making someone inactive deletes their face too', async () => {
        await request(app).patch(`/api/staff/${anu}/status`).set(asOwner).send({ status: 'inactive' }).expect(200);
        expect(await StaffFace.countDocuments({ staffId: anu })).toBe(0);
    });

    it('removing a trainer deletes their face and takes them off the gym phone', async () => {
        const trainerDoc = new mongoose.Types.ObjectId();
        await Trainer.collection.insertOne({ _id: trainerDoc, tenantId, branchId, userId: ravi, isActive: true });
        await request(app).delete(`/api/trainers/${trainerDoc}`).set(asOwner).expect(200);
        expect(await StaffFace.countDocuments({ staffId: ravi })).toBe(0);

        const roster = await request(app).get('/api/staff/face/roster').set(asOwner);
        expect(roster.body.data.people.map((p: any) => p.name)).toEqual(['Anu Sharma']);
    });
});
