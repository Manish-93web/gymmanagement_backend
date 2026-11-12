import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

// Authentication is replaced by a header-selected test user; role checks and routes stay real.
jest.mock('../../src/middleware/auth.middleware', () => ({
    authenticate: (req: any, res: any, next: any) => {
        const user = (global as any).__testUsers?.[String(req.headers['x-test-user'])];
        if (!user) return res.status(401).json({ success: false, message: 'unauthenticated' });
        req.user = user;
        next();
    },
}));

import publicRoutes from '../../src/routes/public.routes';
import platformRoutes from '../../src/routes/platform.routes';
import PlatformLead from '../../src/models/PlatformLead.model';

const app = express();
app.use(express.json());
app.use('/api/public', publicRoutes);
app.use('/api/platform', platformRoutes);

const asAdmin = { 'x-test-user': 'admin' };
const asOwner = { 'x-test-user': 'owner' };

let ip = 0;
// each request gets its own "visitor IP" so the per-IP limiter does not interfere unless a test wants it to
const visitor = () => ({ 'x-forwarded-for': `10.0.0.${++ip}` });

const valid = { gymName: 'Iron Temple Fitness', ownerName: 'Ravi Kumar', mobile: '98765 43210' };

beforeEach(async () => {
    await PlatformLead.deleteMany({});
    (global as any).__testUsers = {
        admin: { _id: new mongoose.Types.ObjectId(), role: 'super_admin' },
        owner: { _id: new mongoose.Types.ObjectId(), role: 'gym_owner' },
    };
});

describe('Public: submit gym details', () => {
    it('stores the lead and tells the visitor the team will connect within 24 hours', async () => {
        const res = await request(app).post('/api/public/platform-leads').set(visitor()).send(valid);
        expect(res.status).toBe(201);
        expect(res.body.message).toMatch(/24 hours/);

        const saved = await PlatformLead.findOne({}).lean();
        expect(saved).toMatchObject({ gymName: 'Iron Temple Fitness', ownerName: 'Ravi Kumar', mobile: '9876543210', status: 'new' });
    });

    it('emails the team when LEAD_NOTIFY_EMAIL is set, and a mail failure never blocks the visitor', async () => {
        const EmailService = require('../../src/services/email.service').default;
        const spy = jest.spyOn(EmailService, 'sendEmail').mockRejectedValue(new Error('smtp down'));
        process.env.LEAD_NOTIFY_EMAIL = 'team@example.com';
        try {
            const res = await request(app).post('/api/public/platform-leads').set(visitor()).send(valid);
            expect(res.status).toBe(201);
            expect(spy).toHaveBeenCalledWith('team@example.com', expect.stringContaining('Iron Temple Fitness'), expect.stringContaining('9876543210'));
            expect(await PlatformLead.countDocuments()).toBe(1);
        } finally {
            delete process.env.LEAD_NOTIFY_EMAIL;
            spy.mockRestore();
        }
    });

    it('accepts +91 / 0 prefixes and stores a clean 10-digit number', async () => {
        await request(app).post('/api/public/platform-leads').set(visitor()).send({ ...valid, mobile: '+91 98765-43210' }).expect(201);
        expect((await PlatformLead.findOne({}).lean())!.mobile).toBe('9876543210');
    });

    it('rejects missing names and invalid numbers', async () => {
        for (const bad of [
            { ...valid, gymName: '' },
            { ...valid, ownerName: ' ' },
            { ...valid, mobile: '12345' },
            { ...valid, mobile: '5876543210' }, // Indian mobiles start 6-9
            { ...valid, mobile: 'abcdefghij' },
        ]) {
            const res = await request(app).post('/api/public/platform-leads').set(visitor()).send(bad);
            expect(res.status).toBe(400);
        }
        expect(await PlatformLead.countDocuments()).toBe(0);
    });

    it('the same number submitting again updates the open lead instead of duplicating it', async () => {
        await request(app).post('/api/public/platform-leads').set(visitor()).send(valid).expect(201);
        await request(app).post('/api/public/platform-leads').set(visitor()).send({ ...valid, gymName: 'Iron Temple Gym' }).expect(201);
        const all = await PlatformLead.find({}).lean();
        expect(all).toHaveLength(1);
        expect(all[0].submissionCount).toBe(2);
        expect(all[0].gymName).toBe('Iron Temple Gym');
    });

    it('a closed (won/lost) lead does not block a fresh request from the same number', async () => {
        await request(app).post('/api/public/platform-leads').set(visitor()).send(valid).expect(201);
        await PlatformLead.updateMany({}, { status: 'lost' });
        await request(app).post('/api/public/platform-leads').set(visitor()).send(valid).expect(201);
        expect(await PlatformLead.countDocuments()).toBe(2);
    });

    it('bots that fill the hidden field get a success reply but nothing is stored', async () => {
        const res = await request(app).post('/api/public/platform-leads').set(visitor()).send({ ...valid, website: 'http://spam.example' });
        expect(res.status).toBe(201);
        expect(await PlatformLead.countDocuments()).toBe(0);
    });

    it('limits one visitor to 5 submissions an hour', async () => {
        const same = { 'x-forwarded-for': '203.0.113.9' };
        const codes: number[] = [];
        for (let i = 0; i < 7; i++) {
            const r = await request(app).post('/api/public/platform-leads').set(same).send({ ...valid, mobile: `98765432${String(10 + i)}` });
            codes.push(r.status);
        }
        expect(codes.slice(0, 5).every(c => c === 201)).toBe(true);
        expect(codes[5]).toBe(429);
    });
});

describe('Super admin: leads', () => {
    beforeEach(async () => {
        await PlatformLead.create([
            { gymName: 'Alpha Gym', ownerName: 'Asha', mobile: '9000000001' },
            { gymName: 'Beta Fitness', ownerName: 'Bala', mobile: '9000000002', status: 'contacted' },
        ]);
    });

    it('lists leads with counts and supports search and status filter', async () => {
        const all = await request(app).get('/api/platform/leads').set(asAdmin);
        expect(all.status).toBe(200);
        expect(all.body.data.leads).toHaveLength(2);
        expect(all.body.data.counts).toMatchObject({ all: 2, new: 1, contacted: 1 });

        const filtered = await request(app).get('/api/platform/leads?status=new').set(asAdmin);
        expect(filtered.body.data.leads.map((l: any) => l.gymName)).toEqual(['Alpha Gym']);

        const search = await request(app).get('/api/platform/leads?q=9000000002').set(asAdmin);
        expect(search.body.data.leads[0].gymName).toBe('Beta Fitness');
    });

    it('marking a lead contacted records who and when, and keeps the first contact time', async () => {
        const lead = (await PlatformLead.findOne({ status: 'new' }).lean())!;
        const res = await request(app).patch(`/api/platform/leads/${lead._id}`).set(asAdmin).send({ status: 'contacted', notes: 'call at 5pm' });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('contacted');
        expect(res.body.data.contactedAt).toBeTruthy();
        const first = res.body.data.contactedAt;

        const again = await request(app).patch(`/api/platform/leads/${lead._id}`).set(asAdmin).send({ status: 'won' });
        expect(again.body.data.contactedAt).toBe(first);
        expect(again.body.data.notes).toBe('call at 5pm');
    });

    it('rejects a bad status or id', async () => {
        const lead = (await PlatformLead.findOne({}).lean())!;
        await request(app).patch(`/api/platform/leads/${lead._id}`).set(asAdmin).send({ status: 'bogus' }).expect(400);
        await request(app).patch('/api/platform/leads/not-an-id').set(asAdmin).send({ status: 'won' }).expect(400);
    });

    it('super admin can delete a junk lead; gym owners cannot', async () => {
        const lead = (await PlatformLead.findOne({ status: 'new' }).lean())!;
        await request(app).delete(`/api/platform/leads/${lead._id}`).set(asOwner).expect(403);
        await request(app).delete(`/api/platform/leads/${lead._id}`).set(asAdmin).expect(200);
        expect(await PlatformLead.countDocuments()).toBe(1);
        await request(app).delete(`/api/platform/leads/${lead._id}`).set(asAdmin).expect(404);
    });

    it('is closed to gym owners and the logged-out', async () => {
        await request(app).get('/api/platform/leads').set(asOwner).expect(403);
        await request(app).get('/api/platform/leads').expect(401);
    });
});
