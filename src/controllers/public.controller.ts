import { Request, Response } from 'express';
import Tenant from '../models/Tenant.model';
import Lead from '../models/Lead.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import Branch from '../models/Branch.model';
import Payment from '../models/Payment.model';
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
            const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
            const yesterdayEnd = new Date(todayEnd.getTime() - 24 * 60 * 60 * 1000);

            const [
                gymCount, totalMemberCount, activeMemberCount, todayCheckIns, cities,
                liveCheckedIn, capacityAgg,
                todayRevenueAgg, yesterdayRevenueAgg,
                newSignupsToday, newSignupsYesterday,
            ] = await Promise.all([
                Tenant.countDocuments({ isActive: true }),
                (Member as any).countDocuments({}),
                (Member as any).countDocuments({ status: 'active' }),
                (Attendance as any).countDocuments({ checkInTime: { $gte: todayStart, $lte: todayEnd } }),
                (Branch as any).distinct('contactInfo.city', { isActive: true }),
                (Attendance as any).countDocuments({ checkInTime: { $gte: todayStart }, checkOutTime: null }),
                (Branch as any).aggregate([
                    { $match: { isActive: true } },
                    { $group: { _id: null, total: { $sum: '$capacity.maxConcurrentAttendance' } } },
                ]),
                (Payment as any).aggregate([
                    { $match: { status: 'completed', createdAt: { $gte: todayStart, $lte: todayEnd } } },
                    { $group: { _id: null, total: { $sum: '$amount.total' } } },
                ]),
                (Payment as any).aggregate([
                    { $match: { status: 'completed', createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } } },
                    { $group: { _id: null, total: { $sum: '$amount.total' } } },
                ]),
                (Member as any).countDocuments({ createdAt: { $gte: todayStart, $lte: todayEnd } }),
                (Member as any).countDocuments({ createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } }),
            ]);

            const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
            const retentionRate = totalMemberCount > 0 ? Math.round((activeMemberCount / totalMemberCount) * 100) : null;

            const totalCapacity = capacityAgg[0]?.total || 0;
            const liveOccupancy = totalCapacity > 0 ? Math.round((liveCheckedIn / totalCapacity) * 100) : null;

            const todayRevenue = todayRevenueAgg[0]?.total || 0;
            const yesterdayRevenue = yesterdayRevenueAgg[0]?.total || 0;
            let revenueChange: string | null = null;
            if (yesterdayRevenue > 0) {
                const pct = Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100);
                revenueChange = `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct)}%`;
            } else if (todayRevenue > 0) {
                revenueChange = '↑ new';
            }

            const signupsChange = newSignupsToday - newSignupsYesterday;

            return res.json({
                success: true,
                formatted: {
                    gyms: fmt(gymCount),
                    totalMembers: fmt(totalMemberCount),
                    activeMembers: fmt(activeMemberCount),
                    checkIns: fmt(todayCheckIns),
                    cities: String(cities.length),
                    retentionRate: retentionRate === null ? null : `${retentionRate}%`,
                    liveOccupancy: liveOccupancy === null ? null : `${liveOccupancy}%`,
                    todayRevenue: todayRevenue > 0 ? `₹${todayRevenue.toLocaleString('en-IN')}` : null,
                    todayRevenueChange: revenueChange,
                    newSignupsToday: String(newSignupsToday),
                    newSignupsChange: signupsChange === 0 ? null : `${signupsChange >= 0 ? '↑' : '↓'} ${Math.abs(signupsChange)}`,
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
