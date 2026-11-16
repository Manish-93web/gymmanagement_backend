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
import BiometricAttendanceService from '../../src/services/biometric-attendance.service';
import User from '../../src/models/User.model';
import Trainer from '../../src/models/Trainer.model';
import StaffShift from '../../src/models/StaffShift.model';
import StaffShiftAssignment from '../../src/models/StaffShiftAssignment.model';
import StaffAttendance from '../../src/models/StaffAttendance.model';

const app = express();
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
const contact = () => { seq += 1; return { email: `s${seq}@test.gym`, mobile: `91000${String(seq).padStart(5, '0')}` }; };

let trainerUserId: mongoose.Types.ObjectId;

beforeEach(async () => {
    await Promise.all([StaffShift.deleteMany({}), StaffShiftAssignment.deleteMany({}), StaffAttendance.deleteMany({})]);
    trainerUserId = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id: trainerUserId, tenantId, branchId, role: 'trainer', firstName: 'Ravi', lastName: 'Kumar', isActive: true, ...contact() });
    await Trainer.collection.insertOne({ _id: new mongoose.Types.ObjectId(), tenantId, branchId, userId: trainerUserId, salary: { base: 26000, type: 'fixed' } });
    (global as any).__testUsers = {
        owner: { _id: new mongoose.Types.ObjectId(), tenantId, role: 'gym_owner' },
        trainer: { _id: trainerUserId, tenantId, role: 'trainer' },
    };
    await request(app).post('/api/biometric/staff').set(asOwner).send({ userId: String(trainerUserId), biometricUserId: '901' });
});

const punch = (at: Date) =>
    BiometricAttendanceService.processPushPunch({
        tenantId: String(tenantId), branchId: String(branchId), deviceId: String(deviceId), biometricUserId: '901', punchTime: at,
    });

const makeShift = async (name: string, segments: [string, string][]) => {
    const res = await request(app).post('/api/staff/shifts').set(asOwner)
        .send({ name, segments: segments.map(([startTime, endTime]) => ({ startTime, endTime })) });
    expect(res.status).toBe(201);
    return res.body.data._id as string;
};
const assign = (body: any) => request(app).put('/api/staff/shifts/assignments').set(asOwner).send(body);
const record = async (day: string) => (await request(app).get(`/api/staff/attendance?startDate=${day}&endDate=${day}`).set(asOwner)).body.data.records[0];
const pay = async () => (await request(app).get(`/api/staff/${trainerUserId}/payroll-summary?month=10&year=2026`).set(asOwner)).body.data;

describe('Shift library', () => {
    it('creates, lists and renames shifts, including a split shift', async () => {
        await makeShift('Morning', [['06:00', '14:00']]);
        const splitId = await makeShift('Split', [['06:00', '10:00'], ['17:00', '21:00']]);

        const list = await request(app).get('/api/staff/shifts').set(asOwner);
        expect(list.body.data.map((s: any) => s.name)).toEqual(['Morning', 'Split']);
        expect(list.body.data[1].segments).toHaveLength(2);

        const renamed = await request(app).put(`/api/staff/shifts/${splitId}`).set(asOwner).send({ name: 'Split A' });
        expect(renamed.body.data.name).toBe('Split A');
    });

    it('rejects bad windows and duplicate names', async () => {
        const bad = (segments: any, name = 'X') => request(app).post('/api/staff/shifts').set(asOwner).send({ name, segments });
        expect((await bad([])).status).toBe(400);
        expect((await bad([{ startTime: '6am', endTime: '14:00' }])).status).toBe(400);
        expect((await bad([{ startTime: '10:00', endTime: '10:10' }])).status).toBe(400);                       // under 30 minutes
        expect((await bad([{ startTime: '10:00', endTime: '09:00' }])).status).toBe(400);                       // ends before it starts
        expect((await bad([{ startTime: '06:00', endTime: '12:00' }, { startTime: '11:00', endTime: '15:00' }])).status).toBe(400); // overlap
        expect((await bad([{ startTime: '06:00', endTime: '06:40' }])).status).toBe(400);                       // under 1 hour in total
        expect((await bad([{ startTime: '01:00', endTime: '02:00' }, { startTime: '03:00', endTime: '04:00' }, { startTime: '05:00', endTime: '06:00' }, { startTime: '07:00', endTime: '08:00' }])).status).toBe(400); // 4 windows

        await makeShift('Morning', [['06:00', '14:00']]);
        const dup = await bad([{ startTime: '07:00', endTime: '15:00' }], 'Morning');
        expect(dup.status).toBe(409);
    });

    it('is closed to trainers', async () => {
        await request(app).get('/api/staff/shifts').set(asTrainer).expect(403);
        await request(app).post('/api/staff/shifts').set(asTrainer).send({ name: 'A', segments: [{ startTime: '06:00', endTime: '14:00' }] }).expect(403);
        await assign({ staffIds: [String(trainerUserId)], shiftId: null }).then(r => expect(r.status).toBe(200));
        await request(app).put('/api/staff/shifts/assignments').set(asTrainer).send({ staffIds: [String(trainerUserId)], shiftId: null }).expect(403);
    });

    it('a shift that is or was assigned cannot be deleted; an unused one can', async () => {
        const used = await makeShift('Morning', [['06:00', '14:00']]);
        const unused = await makeShift('Evening', [['14:00', '22:00']]);
        await assign({ staffIds: [String(trainerUserId)], shiftId: used, effectiveFrom: '2026-10-01' }).then(r => expect(r.status).toBe(200));

        const blocked = await request(app).delete(`/api/staff/shifts/${used}`).set(asOwner);
        expect(blocked.status).toBe(409);
        await request(app).delete(`/api/staff/shifts/${unused}`).set(asOwner).expect(200);
    });
});

describe('Assigning shifts', () => {
    it('lists each staff member with their current shift and weekly off', async () => {
        const evening = await makeShift('Evening', [['14:00', '22:00']]);
        await assign({ staffIds: [String(trainerUserId)], shiftId: evening, weeklyOff: [0], effectiveFrom: '2026-01-01' }).then(r => expect(r.status).toBe(200));

        const res = await request(app).get('/api/staff/shifts/assignments').set(asOwner);
        const row = res.body.data.find((r: any) => r.staffId === String(trainerUserId));
        expect(row).toMatchObject({ shiftName: 'Evening', weeklyOff: [0], effectiveFrom: '2026-01-01' });

        const shifts = await request(app).get('/api/staff/shifts').set(asOwner);
        expect(shifts.body.data[0].staffCount).toBe(1);
    });

    it('several people at once; weekly off carries over when not resent; strangers are refused', async () => {
        const second = new mongoose.Types.ObjectId();
        await User.collection.insertOne({ _id: second, tenantId, branchId, role: 'staff', firstName: 'Anu', isActive: true, ...contact() });
        const morning = await makeShift('Morning', [['06:00', '14:00']]);
        const evening = await makeShift('Evening', [['14:00', '22:00']]);

        await assign({ staffIds: [String(trainerUserId), String(second)], shiftId: morning, weeklyOff: [0], effectiveFrom: '2026-01-01' }).then(r => expect(r.body.data.updated).toBe(2));
        await assign({ staffIds: [String(trainerUserId)], shiftId: evening, effectiveFrom: '2026-02-01' }).then(r => expect(r.status).toBe(200));
        const kept: any = await StaffShiftAssignment.findOne({ staffId: trainerUserId, effectiveFrom: '2026-02-01' }).lean();
        expect(kept.weeklyOff).toEqual([0]);

        const outsider = new mongoose.Types.ObjectId();
        await User.collection.insertOne({ _id: outsider, tenantId: new mongoose.Types.ObjectId(), role: 'trainer', firstName: 'Other', isActive: true, ...contact() });
        expect((await assign({ staffIds: [String(outsider)], shiftId: morning })).status).toBe(404);
    });

    it('validates the request', async () => {
        const id = String(trainerUserId);
        expect((await assign({ staffIds: [], shiftId: null })).status).toBe(400);
        expect((await assign({ staffIds: [id] })).status).toBe(400);                                         // no shift chosen
        expect((await assign({ staffIds: [id], shiftId: null, weeklyOff: [7] })).status).toBe(400);
        expect((await assign({ staffIds: [id], shiftId: null, weeklyOff: [0, 1, 2, 3, 4, 5, 6] })).status).toBe(400);
        expect((await assign({ staffIds: [id], shiftId: null, effectiveFrom: '1 Nov' })).status).toBe(400);
        expect((await assign({ staffIds: [id], shiftId: String(new mongoose.Types.ObjectId()) })).status).toBe(404);
    });
});

describe('Shifts decide lateness and pay', () => {
    it('an evening shift is judged against 14:00, not the gym-wide morning default', async () => {
        const evening = await makeShift('Evening', [['14:00', '22:00']]);
        await assign({ staffIds: [String(trainerUserId)], shiftId: evening, effectiveFrom: '2026-10-01' });

        await punch(ist('2026-10-05', '14:05'));
        await punch(ist('2026-10-05', '22:00'));
        const r = await record('2026-10-05');
        expect(r).toMatchObject({ status: 'present', hoursWorked: 7.92, earlyDeparture: false });

        await punch(ist('2026-10-06', '14:30'));                        // later than 14:00 + 10 minutes grace
        expect((await record('2026-10-06')).status).toBe('late');
    });

    it('a split shift does not pay the gap between its windows', async () => {
        const split = await makeShift('Split', [['06:00', '10:00'], ['17:00', '21:00']]);
        await assign({ staffIds: [String(trainerUserId)], shiftId: split, effectiveFrom: '2026-10-01' });

        await punch(ist('2026-10-05', '06:00'));
        await punch(ist('2026-10-05', '21:00'));
        const r = await record('2026-10-05');
        expect(r.hoursWorked).toBe(8);                                  // 15 hours between punches, minus the 7-hour gap
        expect(r.overtime).toBe(0);
        expect(r.status).toBe('present');

        const p = await pay();
        expect(p.shiftHours).toBe(8);
        expect(p.shortfallHours).toBe(0);
        expect(p.netPay).toBe(1000);
    });

    it('missing one window of a split shift is deducted', async () => {
        const split = await makeShift('Split', [['06:00', '10:00'], ['17:00', '21:00']]);
        await assign({ staffIds: [String(trainerUserId)], shiftId: split, effectiveFrom: '2026-10-01' });

        await punch(ist('2026-10-05', '06:00'));
        await punch(ist('2026-10-05', '10:00'));                        // only the morning window
        const p = await pay();
        expect(p.shortfallHours).toBe(4);
        expect(p.netPay).toBe(500);                                     // 1000 for the day, minus 4 h at 125
        expect((await record('2026-10-05')).earlyDeparture).toBe(true);
    });

    it('a weekly off has no lateness or shortfall, and every hour is overtime', async () => {
        await assign({ staffIds: [String(trainerUserId)], shiftId: null, weeklyOff: [0], effectiveFrom: '2026-10-01' });

        await punch(ist('2026-10-04', '11:00'));                        // a Sunday, well after the 09:30 default
        await punch(ist('2026-10-04', '15:00'));
        const r = await record('2026-10-04');
        expect(r).toMatchObject({ status: 'present', hoursWorked: 4, overtime: 4, earlyDeparture: false });

        const p = await pay();
        expect(p.basePay).toBe(0);                                      // no extra day's pay for a day off
        expect(p.shortfallHours).toBe(0);
        expect(p.overtimePay).toBe(750);                                // 4 h x 125 x 1.5
        expect(p.netPay).toBe(750);
    });

    it('changing the shift from a date leaves earlier days judged by the old one', async () => {
        const morning = await makeShift('Morning', [['06:00', '14:00']]);
        const evening = await makeShift('Evening', [['14:00', '22:00']]);
        await assign({ staffIds: [String(trainerUserId)], shiftId: morning, effectiveFrom: '2026-10-01' });
        await assign({ staffIds: [String(trainerUserId)], shiftId: evening, effectiveFrom: '2026-10-10' });

        await punch(ist('2026-10-05', '06:05'));
        await punch(ist('2026-10-05', '14:00'));
        await punch(ist('2026-10-12', '14:05'));
        await punch(ist('2026-10-12', '22:00'));

        expect((await record('2026-10-05')).status).toBe('present');
        expect((await record('2026-10-12')).status).toBe('present');

        const p = await pay();
        expect(p.workingDays).toBe(2);
        expect(p.lateCount).toBe(0);
        expect(p.shortfallHours).toBe(0);
    });

    it('a trainer with only the older single shift on their profile is still judged by it', async () => {
        await Trainer.collection.updateOne({ userId: trainerUserId }, { $set: { shift: { startTime: '06:00', endTime: '14:00' } } });
        await punch(ist('2026-10-05', '06:30'));                        // 30 minutes after a 06:00 start
        expect((await record('2026-10-05')).status).toBe('late');

        // assigning "gym default" overrides the older shift
        await assign({ staffIds: [String(trainerUserId)], shiftId: null, effectiveFrom: '2026-10-01' });
        await punch(ist('2026-10-06', '06:30'));
        expect((await record('2026-10-06')).status).toBe('present');   // before the 09:30 default
    });

    it("today's team board and the trainer's own view show the shift", async () => {
        const evening = await makeShift('Evening', [['14:00', '22:00']]);
        await assign({ staffIds: [String(trainerUserId)], shiftId: evening });

        const board = await request(app).get('/api/staff/attendance/today').set(asOwner);
        const mine = board.body.data.find((b: any) => b.staffId === String(trainerUserId));
        expect(mine).toMatchObject({ shiftName: 'Evening', shiftTime: '14:00-22:00', offDay: false });

        const me = await request(app).get('/api/staff/me/attendance').set(asTrainer);
        expect(me.body.data.shift).toMatchObject({ name: 'Evening', time: '14:00-22:00', hours: 8 });
    });
});

describe('Onboarding a trainer', () => {
    beforeEach(async () => {
        await mongoose.connection.collection('branches').deleteMany({ tenantId });
        await mongoose.connection.collection('branches').insertOne({ _id: branchId, tenantId, name: 'Main' });
    });

    const onboard = (body: any) => request(app).post('/api/trainers').set(asOwner).send({ role: 'trainer', ...body });
    const listed = async (name: string) =>
        (await request(app).get('/api/trainers?limit=100').set(asOwner)).body.data.trainers?.find((t: any) => t.firstName === name)
        ?? (await request(app).get('/api/trainers?limit=100').set(asOwner)).body.data?.find?.((t: any) => t.firstName === name);

    it('works without an email, repeatedly, and shows no made-up email', async () => {
        const a = await onboard({ firstName: 'Anil', lastName: 'Singh' });
        const b = await onboard({ firstName: 'Bina' });
        expect(a.status).toBe(201);
        expect(b.status).toBe(201);                                     // a second one used to clash on the shared stand-in mobile

        const anil = await listed('Anil');
        expect(anil.email).toBe('');
        expect(anil.phone).toBe('');
        expect(anil.userId.email).toBe('');
    });

    it('still takes a real email, and still needs a first name', async () => {
        const ok = await onboard({ firstName: 'Cara', email: 'Cara@Gym.com' });
        expect(ok.status).toBe(201);
        expect((await listed('Cara')).email).toBe('cara@gym.com');
        expect((await onboard({ lastName: 'NoName' })).status).toBe(400);
    });

    it('gives the new trainer their shift from today', async () => {
        const evening = await makeShift('Evening', [['14:00', '22:00']]);
        const res = await onboard({ firstName: 'Dev', shiftId: evening });
        expect(res.status).toBe(201);

        const userId = String(res.body.data.userId);
        const rows = await request(app).get('/api/staff/shifts/assignments').set(asOwner);
        expect(rows.body.data.find((r: any) => r.staffId === userId)).toMatchObject({ shiftName: 'Evening' });
    });

    it('a shift that does not exist is refused and nothing is created', async () => {
        const before = await User.countDocuments({ tenantId });
        const res = await onboard({ firstName: 'Esha', shiftId: String(new mongoose.Types.ObjectId()) });
        expect(res.status).toBe(400);
        expect(await User.countDocuments({ tenantId })).toBe(before);
    });
});

describe('Setting monthly salary', () => {
    it('a non-trainer staff member and a trainer both get paid from the salary the owner sets', async () => {
        const staffUser = new mongoose.Types.ObjectId();
        await User.collection.insertOne({ _id: staffUser, tenantId, branchId, role: 'staff', firstName: 'Anu', isActive: true, ...contact() });

        const set = await request(app).put(`/api/staff/${staffUser}`).set(asOwner).send({ salary: 20000 });
        expect(set.status).toBe(200);
        const trainerDoc: any = await Trainer.collection.findOne({ userId: trainerUserId });
        const t = await request(app).put(`/api/trainers/${trainerDoc._id}`).set(asOwner).send({ salary: { base: 30000, type: 'fixed' }, revenueSharing: { enabled: false, percentage: 0 } });
        expect(t.status).toBe(200);

        const payroll = await request(app).get('/api/staff/payroll?month=10&year=2026').set(asOwner);
        const byId = new Map(payroll.body.data.map((r: any) => [r.staffId, r]));
        expect((byId.get(String(staffUser)) as any).monthlySalary).toBe(20000);
        expect((byId.get(String(trainerUserId)) as any).monthlySalary).toBe(30000);
    });
});

describe('Shifts that run past midnight', () => {
    it('can be created, with limits on what may wrap', async () => {
        const make = (segments: [string, string][]) =>
            request(app).post('/api/staff/shifts').set(asOwner).send({ name: `N${Math.random()}`, segments: segments.map(([startTime, endTime]) => ({ startTime, endTime })) });
        expect((await make([['16:00', '01:00']])).status).toBe(201);
        expect((await make([['10:00', '14:00'], ['22:00', '02:00']])).status).toBe(201);
        expect((await make([['22:00', '02:00'], ['03:00', '05:00']])).status).toBe(400);   // only the last window may wrap
        expect((await make([['06:00', '10:00'], ['22:00', '08:00']])).status).toBe(400);   // runs into the next morning's first window
        expect((await make([['10:00', '10:00']])).status).toBe(400);                       // a full 24 hours
    });

    const night = async () => {
        const id = await makeShift('Night', [['16:00', '01:00']]);
        await assign({ staffIds: [String(trainerUserId)], shiftId: id, effectiveFrom: '2026-10-01' });
    };
    const recordsOn = async (from: string, to: string) =>
        (await request(app).get(`/api/staff/attendance?startDate=${from}&endDate=${to}`).set(asOwner)).body.data.records;

    it('a punch after midnight closes the shift that started the evening before', async () => {
        await night();
        await punch(ist('2026-10-05', '16:05'));
        await punch(ist('2026-10-06', '01:00'));

        const records = await recordsOn('2026-10-05', '2026-10-06');
        expect(records).toHaveLength(1);                                // one shift, on the day it started
        expect(records[0]).toMatchObject({ status: 'present', hoursWorked: 8.92, earlyDeparture: false });

        await punch(ist('2026-10-06', '01:20'));                        // a later punch moves the check-out
        expect((await recordsOn('2026-10-05', '2026-10-05'))[0]).toMatchObject({ hoursWorked: 9.25, overtime: 0.25 });

        await punch(ist('2026-10-06', '16:00'));                        // the next evening starts a new record
        expect(await recordsOn('2026-10-05', '2026-10-06')).toHaveLength(2);

        const p = await pay();
        expect(p.shiftHours).toBe(9);
        expect(p.lateCount).toBe(0);
    });

    it('leaving before the shift ends is early, and the missing time is deducted', async () => {
        await night();
        await punch(ist('2026-10-07', '16:00'));
        await punch(ist('2026-10-08', '00:00'));                        // 8 of 9 hours

        const r = (await recordsOn('2026-10-07', '2026-10-07'))[0];
        expect(r).toMatchObject({ hoursWorked: 8, earlyDeparture: true });
        const p = await pay();
        expect(p.shortfallHours).toBe(1);
        expect(p.netPay).toBeCloseTo(1000 - 1000 / 9, 1);
    });

    it('the owner can fix a check-out with just the time; it lands on the next day', async () => {
        await night();
        await punch(ist('2026-10-05', '16:00'));
        const id = (await recordsOn('2026-10-05', '2026-10-05'))[0]._id;

        const fixed = await request(app).patch(`/api/staff/attendance/${id}`).set(asOwner).send({ clockOut: '00:30' });
        expect(fixed.status).toBe(200);
        expect(fixed.body.data.hoursWorked).toBe(8.5);
    });

    it('the board and the clock-in button treat someone on a late shift as still in after midnight', async () => {
        await night();
        // checked with fixed instants, not the wall clock
        await punch(ist('2026-10-05', '16:00'));
        const StaffAttendanceService = require('../../src/services/staff-attendance.service').default;
        const cont = await StaffAttendanceService.overnightRecordFor(tenantId, trainerUserId, ist('2026-10-06', '00:40'));
        expect(cont?.record?.clockOut).toBeUndefined();
        expect(cont?.rules.overnight).toBe(true);
        expect(await StaffAttendanceService.overnightRecordFor(tenantId, trainerUserId, ist('2026-10-06', '06:00'))).toBeNull();   // too long after the shift ended
    });
});
