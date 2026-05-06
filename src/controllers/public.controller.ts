import { Request, Response } from 'express';
import Tenant from '../models/Tenant.model';
import Lead from '../models/Lead.model';
import Member from '../models/Member.model';
import mongoose from 'mongoose';

export class PublicController {

    async getGyms(req: Request, res: Response) {
        try {
            const gyms = await Tenant.find({ isActive: true }, 'name slug address phone email logoUrl website')
                .sort({ name: 1 }).limit(50);
            return res.json({ success: true, data: gyms });
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
            const lead = await Lead.create({
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
            const { tenantSlug } = req.query;
            let tenantId: any;
            if (tenantSlug) {
                const tenant = await Tenant.findOne({ slug: tenantSlug }, '_id');
                if (!tenant) return res.status(404).json({ success: false, message: 'Gym not found' });
                tenantId = tenant._id;
            }
            const query = tenantId ? { tenantId, status: 'active' } : { status: 'active' };
            const memberCount = await Member.countDocuments(query);
            return res.json({ success: true, data: { activeMembers: memberCount } });
        } catch (error) {
            return res.status(500).json({ success: false, message: 'Error fetching stats' });
        }
    }

    async getPublicPdf(req: Request, res: Response) {
        try {
            const { slug } = req.params;
            // WhatsApp PDF links stored in AuditLog details
            const AuditLog = (await import('../models/AuditLog.model')).default;
            const record = await AuditLog.findOne({ action: 'pdf_link_created', 'details.slug': slug });
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
