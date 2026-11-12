import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import PlatformLead from '../models/PlatformLead.model';
import EmailService from '../services/email.service';

const STATUSES = ['new', 'contacted', 'demo_scheduled', 'won', 'lost'];

/** Accepts "98765 43210", "+91 98765-43210", "09876543210"; returns the 10-digit Indian mobile or null. */
export function normalizeIndianMobile(input: unknown): string | null {
    let d = String(input ?? '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : null;
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Best-effort alert to the team inbox (LEAD_NOTIFY_EMAIL). Never blocks or fails the visitor's submission. */
function notifyTeam(lead: { gymName: string; ownerName: string; mobile: string }) {
    const to = process.env.LEAD_NOTIFY_EMAIL;
    if (!to) return;
    const html = `<p>New website lead on GymBodyFlow:</p><ul><li>Gym: <b>${escapeHtml(lead.gymName)}</b></li><li>Owner: ${escapeHtml(lead.ownerName)}</li><li>Phone: +91 ${lead.mobile}</li></ul><p><a href="https://wa.me/91${lead.mobile}">Open WhatsApp</a></p>`;
    Promise.resolve(EmailService.sendEmail(to, `New lead: ${lead.gymName}`, html)).catch(() => { /* alert only */ });
}

class PlatformLeadController {
    /** POST /api/public/platform-leads — public. Gym name, owner name and mobile from the website. */
    async submit(req: Request, res: Response, next: NextFunction) {
        try {
            const body = req.body || {};

            // Honeypot: real visitors never see or fill this field. Pretend success so bots learn nothing.
            if (clean(body.website, 200)) { res.status(201).json({ success: true }); return; }

            const gymName = clean(body.gymName, 100);
            const ownerName = clean(body.ownerName, 80);
            const mobile = normalizeIndianMobile(body.mobile);

            if (gymName.length < 2) { res.status(400).json({ success: false, message: 'Please enter your gym name.' }); return; }
            if (ownerName.length < 2) { res.status(400).json({ success: false, message: 'Please enter the gym owner name.' }); return; }
            if (!mobile) { res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number.' }); return; }

            const utm = body.utm && typeof body.utm === 'object'
                ? { source: clean(body.utm.source, 100), medium: clean(body.utm.medium, 100), campaign: clean(body.utm.campaign, 100) }
                : undefined;

            // Same number again while the earlier request is still open: update it, do not create a duplicate.
            const open = await PlatformLead.findOne({ mobile, status: { $in: ['new', 'contacted', 'demo_scheduled'] } });
            if (open) {
                open.submissionCount += 1;
                open.lastSubmittedAt = new Date();
                open.gymName = gymName;
                open.ownerName = ownerName;
                await open.save();
            } else {
                notifyTeam({ gymName, ownerName, mobile });
                await PlatformLead.create({
                    gymName, ownerName, mobile,
                    source: clean(body.source, 40) || 'website',
                    pageUrl: clean(body.pageUrl, 300) || undefined,
                    referrer: clean(body.referrer, 300) || undefined,
                    utm,
                });
            }
            res.status(201).json({ success: true, message: 'Thank you! Our team will connect with you within 24 hours.' });
        } catch (error) { next(error); }
    }

    /** GET /api/platform/leads?status=&q=&page=&limit= — super admin. */
    async list(req: Request, res: Response, next: NextFunction) {
        try {
            const { status, q } = req.query;
            const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
            const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10)));

            const filter: any = {};
            if (status && STATUSES.includes(String(status))) filter.status = String(status);
            if (q) {
                const re = new RegExp(escapeRegex(String(q)), 'i');
                filter.$or = [{ gymName: re }, { ownerName: re }, { mobile: re }];
            }

            const [leads, total, byStatus] = await Promise.all([
                PlatformLead.find(filter).sort({ lastSubmittedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
                PlatformLead.countDocuments(filter),
                PlatformLead.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
            ]);
            const counts: Record<string, number> = { new: 0, contacted: 0, demo_scheduled: 0, won: 0, lost: 0 };
            let all = 0;
            for (const r of byStatus) { counts[r._id] = r.n; all += r.n; }

            res.json({ success: true, data: { leads, total, page, pages: Math.ceil(total / limit), counts: { ...counts, all } } });
        } catch (error) { next(error); }
    }

    /** PATCH /api/platform/leads/:id { status?, notes? } — super admin. */
    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const id = String(req.params.id);
            if (!mongoose.isValidObjectId(id)) { res.status(400).json({ success: false, message: 'Invalid id' }); return; }

            const existing = await PlatformLead.findById(id).select('contactedAt').lean();
            if (!existing) { res.status(404).json({ success: false, message: 'Lead not found' }); return; }

            const { status, notes } = req.body || {};
            const set: any = {};
            if (status !== undefined) {
                if (!STATUSES.includes(String(status))) { res.status(400).json({ success: false, message: 'Invalid status' }); return; }
                set.status = String(status);
                // Record who first got in touch and when; later status changes keep that.
                if (status !== 'new' && !existing.contactedAt) {
                    set.contactedAt = new Date();
                    set.contactedBy = (req as any).user?._id;
                }
            }
            if (notes !== undefined) set.notes = clean(notes, 2000);

            const lead = await PlatformLead.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
            res.json({ success: true, data: lead });
        } catch (error) { next(error); }
    }

    /** DELETE /api/platform/leads/:id — super admin removes junk or test entries. */
    async remove(req: Request, res: Response, next: NextFunction) {
        try {
            const id = String(req.params.id);
            if (!mongoose.isValidObjectId(id)) { res.status(400).json({ success: false, message: 'Invalid id' }); return; }
            const r = await PlatformLead.deleteOne({ _id: id });
            if (!r.deletedCount) { res.status(404).json({ success: false, message: 'Lead not found' }); return; }
            res.json({ success: true });
        } catch (error) { next(error); }
    }
}

export default new PlatformLeadController();
