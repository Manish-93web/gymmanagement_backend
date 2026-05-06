import { Request, Response, NextFunction } from 'express';
import Lead from '../models/Lead.model';
import Member from '../models/Member.model';
import User from '../models/User.model';
import mongoose from 'mongoose';

// Map inquiry sources to valid Lead source enum values
const mapSource = (source?: string): string => {
    const validSources = ['website', 'walk_in', 'referral', 'social_media', 'advertisement', 'event', 'other'];
    if (source && validSources.includes(source)) return source;
    // Map kiosk/inquiry/reception to walk_in as nearest equivalent
    if (source === 'kiosk' || source === 'reception') return 'walk_in';
    if (source === 'inquiry') return 'other';
    return 'walk_in';
};

// Generate a unique membership number
const generateMembershipNumber = (): string => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `MEM-${timestamp}-${random}`;
};

export class InquiryController {
    async getInquiries(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const { status, page = 1, limit = 20 } = req.query;
            // Filter for walk-in / reception type inquiries (non-digital sources)
            const query: any = {
                tenantId,
                source: { $in: ['walk_in', 'other', 'event'] }
            };
            if (status) query.status = status;
            const skip = (Number(page) - 1) * Number(limit);
            const [inquiries, total] = await Promise.all([
                Lead.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
                Lead.countDocuments(query)
            ]);
            return res.json({ success: true, data: { inquiries, total } });
        } catch (error) { return next(error); }
    }

    async createInquiry(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user?.tenantId || req.body.tenantId;
            const branchId = req.user?.branchId || req.body.branchId;
            const { firstName, lastName, name, email, mobile, interestedIn, visitDate, notes, source } = req.body;

            // Support both firstName/lastName and a single name field
            const resolvedFirstName = firstName || (name ? name.split(' ')[0] : undefined);
            const resolvedLastName = lastName || (name ? name.split(' ').slice(1).join(' ') : '');

            if (!resolvedFirstName || !mobile) {
                return res.status(400).json({ success: false, message: 'name (or firstName) and mobile are required' });
            }
            if (!tenantId) {
                return res.status(400).json({ success: false, message: 'tenantId is required' });
            }
            if (!branchId) {
                return res.status(400).json({ success: false, message: 'branchId is required' });
            }

            const inquiry = await Lead.create({
                firstName: resolvedFirstName,
                lastName: resolvedLastName,
                email: email || `inquiry_${Date.now()}@noemail.local`,
                mobile,
                source: mapSource(source),
                status: 'new',
                interests: interestedIn ? [interestedIn] : [],
                notes: notes || '',
                tenantId,
                branchId
            });
            return res.status(201).json({ success: true, data: inquiry });
        } catch (error) { return next(error); }
    }

    async updateInquiry(req: Request, res: Response, next: NextFunction) {
        try {
            const inquiry = await Lead.findOneAndUpdate(
                { _id: req.params.id, tenantId: req.user!.tenantId },
                req.body, { new: true }
            );
            if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });
            return res.json({ success: true, data: inquiry });
        } catch (error) { return next(error); }
    }

    async convertToMember(req: Request, res: Response, next: NextFunction) {
        try {
            const lead = await Lead.findOne({ _id: req.params.id, tenantId: req.user!.tenantId });
            if (!lead) return res.status(404).json({ success: false, message: 'Inquiry not found' });
            if (lead.status === 'converted') {
                return res.status(400).json({ success: false, message: 'Inquiry already converted' });
            }

            // Create a placeholder User account for the member
            const tempPassword = Math.random().toString(36).substring(2, 12);
            const user = await User.create({
                firstName: lead.firstName,
                lastName: lead.lastName,
                email: lead.email,
                mobile: lead.mobile,
                password: tempPassword,
                role: 'member',
                tenantId: lead.tenantId,
                branchId: lead.branchId,
                isActive: true,
                isEmailVerified: false,
                isMobileVerified: false
            });

            const member = await Member.create({
                firstName: lead.firstName,
                lastName: lead.lastName,
                email: lead.email,
                mobile: lead.mobile,
                status: 'lead',
                tenantId: lead.tenantId,
                branchId: lead.branchId,
                userId: user._id,
                membershipNumber: generateMembershipNumber(),
                personalInfo: {
                    dateOfBirth: req.body.dateOfBirth || new Date('2000-01-01'),
                    gender: req.body.gender || 'other'
                },
                healthInfo: {
                    medicalConditions: [],
                    allergies: [],
                    medications: [],
                    injuries: [],
                    doctorClearance: false
                }
            });

            await Lead.findByIdAndUpdate(req.params.id, {
                status: 'converted',
                conversion: {
                    convertedAt: new Date(),
                    convertedBy: req.user!._id,
                    memberId: member._id
                }
            });
            return res.status(201).json({ success: true, data: member });
        } catch (error) { return next(error); }
    }

    async getInquiryStats(req: Request, res: Response, next: NextFunction) {
        try {
            const tenantId = req.user!.tenantId;
            const query: any = {
                tenantId,
                source: { $in: ['walk_in', 'other', 'event'] }
            };
            const [total, converted, newCount] = await Promise.all([
                Lead.countDocuments(query),
                Lead.countDocuments({ ...query, status: 'converted' }),
                Lead.countDocuments({ ...query, status: 'new' })
            ]);
            return res.json({
                success: true,
                data: {
                    total,
                    converted,
                    new: newCount,
                    conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0
                }
            });
        } catch (error) { return next(error); }
    }
}

export default new InquiryController();
