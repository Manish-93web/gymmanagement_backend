import { Request, Response } from 'express';
import Tenant from '../models/Tenant.model';
import Lead from '../models/Lead.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import mongoose from 'mongoose';

export class PublicController {

    async getGyms(req: Request, res: Response) {
        try {
            const tenants = await Tenant.find({ isActive: true }, 'name slug subscription')
                .sort({ name: 1 }).limit(50);
            const gyms = tenants.map(t => ({
                id: (t as any)._id.toString(),
                name: t.name,
                plan: (t as any).subscription?.plan || 'basic',
            }));
            return res.json({ success: true, gyms });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error fetching gyms' });
        }
    }

    async submitLead(req: Request, res: Response) {
        try {
            const { tenantSlug, tenantId, firstName, lastName, mobile, email, source, interestedIn, notes } = req.body;
            if (!firstName || !mobile) {
                return res.status(400).json({ success: false, message: 'firstName and mobile are required' });
            }
            let resolvedTenantId: any = tenantId;
            if (!resolvedTenantId && tenantSlug) {
                const tenant = await Tenant.findOne({ slug: tenantSlug, isActive: true }, '_id');
                if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
                resolvedTenantId = tenant._id;
            }
            if (!resolvedTenantId) return res.status(400).json({ success: false, message: 'tenantSlug or tenantId required' });

            const existing = await Lead.findOne({ tenantId: resolvedTenantId, mobile });
            if (existing) {
                return res.json({ success: true, message: 'Already registered', data: existing });
            }
            const lead = await (Lead as any).create({
                tenantId: resolvedTenantId,
                firstName, lastName, mobile, email,
                source: source || 'website',
                interestedIn: Array.isArray(interestedIn) ? interestedIn : (interestedIn ? [interestedIn] : []),
                notes,
                status: 'new'
            });
            return res.status(201).json({ success: true, message: 'Registered successfully', data: lead });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error submitting lead' });
        }
    }

    async getPublicStats(req: Request, res: Response) {
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);

            const [gymCount, totalMemberCount, activeMemberCount, todayCheckIns] = await Promise.all([
                Tenant.countDocuments({ isActive: true }),
                (Member as any).countDocuments({}),
                (Member as any).countDocuments({ status: 'active' }),
                (Attendance as any).countDocuments({ checkInTime: { $gte: todayStart, $lte: todayEnd } }),
            ]);

            const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

            return res.json({
                success: true,
                formatted: {
                    gyms: fmt(gymCount),
                    totalMembers: fmt(totalMemberCount),
                    activeMembers: fmt(activeMemberCount),
                    checkIns: fmt(todayCheckIns),
                },
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error fetching stats' });
        }
    }

    async getPublicPdf(req: Request, res: Response) {
        try {
            const { slug } = req.params;
            // WhatsApp PDF links stored in AuditLog details
            const AuditLog = (await import('../models/AuditLog.model')).default;
            const record = await (AuditLog as any).findOne({ action: 'pdf_link_created', 'details.slug': slug });
            if (!record) return res.status(404).json({ success: false, message: 'PDF not found or expired' });
            return res.json({ success: true, data: (record as any).details });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error fetching PDF' });
        }
    }

    async getGymProfile(req: Request, res: Response) {
        try {
            const { slug } = req.params;
            const gym = await Tenant.findOne({ slug, isActive: true }, 'name slug address phone email logoUrl website description amenities');
            if (!gym) return res.status(404).json({ success: false, message: 'Gym not found' });
            return res.json({ success: true, data: gym });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error fetching gym' });
        }
    }
}

export default new PublicController();
