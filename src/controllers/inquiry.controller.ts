import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Inquiry from '../models/Inquiry.model';
import Member from '../models/Member.model';

const NO_TENANT = (res: Response) =>
    res.status(400).json({ success: false, message: 'Tenant context required' });

export class InquiryController {
    // GET / — paginated list with optional status filter
    async getInquiries(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const page   = parseInt((req.query.page   as string) || '1',  10);
            const limit  = parseInt((req.query.limit  as string) || '20', 10);
            const skip   = (page - 1) * limit;
            const status = req.query.status as string | undefined;

            const filter: Record<string, any> = { tenantId };
            if (status) filter.status = status;

            const [inquiries, total] = await Promise.all([
                Inquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
                Inquiry.countDocuments(filter),
            ]);

            res.status(200).json({
                success: true,
                data: inquiries,
                pagination: { total, page, limit, pages: Math.ceil(total / limit) },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch inquiries' });
        }
    }

    // POST / — create inquiry (optionalAuth — public form supported)
    async createInquiry(req: Request, res: Response): Promise<void> {
        try {
            // Resolve tenantId: from auth middleware → query param → request body
            const tenantId =
                req.tenantId ||
                (req.query.tenantId as string | undefined) ||
                (req.body.tenantId as string | undefined);

            const { name, phone, email, source, interestedPlan, budget, goals, assignTo, notes, branchId } = req.body;

            if (!name || !phone) {
                res.status(400).json({ success: false, message: 'Name and phone are required' });
                return;
            }

            if (!tenantId) {
                // Still persist with whatever is available — caller may pass tenantId in body
                if (!req.body.tenantId) {
                    res.status(400).json({ success: false, message: 'Tenant context required' });
                    return;
                }
            }

            const inquiry = await Inquiry.create({
                tenantId,
                branchId:       branchId || undefined,
                name:           name.trim(),
                phone:          phone.trim(),
                email:          email || undefined,
                source:         source || undefined,
                interestedPlan: interestedPlan || undefined,
                budget:         budget || undefined,
                goals:          goals || undefined,
                assignTo:       assignTo || undefined,
                notes:          notes || '',
                status:         'new',
            });

            res.status(201).json({
                success: true,
                message: 'Inquiry submitted successfully',
                data: inquiry,
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to create inquiry' });
        }
    }

    // GET /stats — count by status
    async getInquiryStats(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const stats = await Inquiry.aggregate([
                { $match: { tenantId: new mongoose.Types.ObjectId(tenantId) } },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]);

            const formatted: Record<string, number> = {
                new: 0,
                contacted: 0,
                converted: 0,
                not_interested: 0,
            };

            for (const s of stats) {
                formatted[s._id] = s.count;
            }

            const total = Object.values(formatted).reduce((a, b) => a + b, 0);

            res.status(200).json({ success: true, data: { ...formatted, total } });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch inquiry stats' });
        }
    }

    // GET /:id — fetch a single inquiry
    async getInquiryById(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const inquiry = await Inquiry.findOne({ _id: id, tenantId });

            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            res.status(200).json({ success: true, data: inquiry });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch inquiry' });
        }
    }

    // PUT /:id — update status / notes
    async updateInquiry(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const { name, phone, email, source, interestedPlan, budget, goals, assignTo, status, notes } = req.body;
            const update: Record<string, any> = {};
            if (name           !== undefined) update.name           = name;
            if (phone          !== undefined) update.phone          = phone;
            if (email          !== undefined) update.email          = email;
            if (source         !== undefined) update.source         = source;
            if (interestedPlan !== undefined) update.interestedPlan = interestedPlan;
            if (budget         !== undefined) update.budget         = budget;
            if (goals          !== undefined) update.goals          = goals;
            if (assignTo       !== undefined) update.assignTo       = assignTo;
            if (status         !== undefined) update.status         = status;
            if (notes          !== undefined) update.notes          = notes;

            const inquiry = await Inquiry.findOneAndUpdate(
                { _id: id, tenantId },
                { $set: update },
                { new: true, runValidators: true }
            );

            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            res.status(200).json({
                success: true,
                message: 'Inquiry updated successfully',
                data: inquiry,
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to update inquiry' });
        }
    }

    // DELETE /:id
    async deleteInquiry(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const inquiry = await Inquiry.findOneAndDelete({ _id: id, tenantId });
            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            res.status(200).json({ success: true, message: 'Inquiry deleted' });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to delete inquiry' });
        }
    }

    // POST /:id/convert — convert inquiry to member
    async convertToMember(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }

            const id = req.params.id as string;

            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const inquiry = await Inquiry.findOne({ _id: id, tenantId });

            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            if (inquiry.status === 'converted') {
                res.status(400).json({ success: false, message: 'Inquiry has already been converted' });
                return;
            }

            // Split name into first/last (best effort)
            const nameParts  = inquiry.name.trim().split(/\s+/);
            const firstName  = nameParts[0] || inquiry.name;
            const lastName   = nameParts.slice(1).join(' ') || '';

            // Build a unique membership number
            const membershipNumber = `MBR-${Date.now()}`;

            // Additional fields from request body (optional overrides)
            const {
                email,
                branchId,
                planId,
                membershipStart,
                membershipExpiry,
            } = req.body;

            const effectiveBranchId = branchId || inquiry.branchId || req.branchId;

            if (!effectiveBranchId) {
                res.status(400).json({ success: false, message: 'Branch ID is required to create a member' });
                return;
            }

            const member = await Member.create({
                tenantId,
                branchId: effectiveBranchId,
                firstName,
                lastName,
                email:            email     || `${membershipNumber.toLowerCase()}@placeholder.local`,
                mobile:           inquiry.phone,
                membershipNumber,
                status:           'lead',
                planId:           planId           || undefined,
                membershipStart:  membershipStart  ? new Date(membershipStart)  : undefined,
                membershipExpiry: membershipExpiry ? new Date(membershipExpiry) : undefined,
                goals:            [],
                tags:             ['converted-inquiry'],
                notes:            inquiry.notes || '',
                walletBalance:    0,
                statusHistory: [{
                    status:    'lead',
                    changedAt: new Date(),
                    changedBy: req.user._id,
                    reason:    'Converted from inquiry',
                }],
            });

            // Mark inquiry as converted
            inquiry.status = 'converted';
            await inquiry.save();

            res.status(201).json({
                success: true,
                message: 'Inquiry converted to member successfully',
                data: { member, inquiry },
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to convert inquiry' });
        }
    }

    // GET /:id/follow-ups — list follow-up history for an inquiry
    async getFollowUps(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const inquiry = await Inquiry.findOne({ _id: id, tenantId });
            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            res.status(200).json({ success: true, data: inquiry.followUps });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch follow-ups' });
        }
    }

    // POST /:id/follow-ups — record a new follow-up
    async addFollowUp(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const { date, time, type, notes, outcome } = req.body;
            if (!date || !type) {
                res.status(400).json({ success: false, message: 'Date and type are required' });
                return;
            }

            const inquiry = await Inquiry.findOne({ _id: id, tenantId });
            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            inquiry.followUps.push({ date, time, type, notes, outcome, completed: false } as any);
            await inquiry.save();

            res.status(201).json({
                success: true,
                message: 'Follow-up recorded',
                data: inquiry.followUps[inquiry.followUps.length - 1],
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to record follow-up' });
        }
    }

    // PATCH /:id/follow-ups/:followUpId — update a follow-up (e.g. mark completed)
    async updateFollowUp(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;
            const followUpId = req.params.followUpId as string;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const inquiry = await Inquiry.findOne({ _id: id, tenantId });
            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            const followUp = (inquiry.followUps as any).id(followUpId);
            if (!followUp) {
                res.status(404).json({ success: false, message: 'Follow-up not found' });
                return;
            }

            const { completed, notes, outcome } = req.body;
            if (completed !== undefined) followUp.completed = completed;
            if (notes     !== undefined) followUp.notes     = notes;
            if (outcome   !== undefined) followUp.outcome   = outcome;

            await inquiry.save();

            res.status(200).json({ success: true, message: 'Follow-up updated', data: followUp });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to update follow-up' });
        }
    }

    // GET /:id/notes — list note entries for an inquiry
    async getNotes(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const inquiry = await Inquiry.findOne({ _id: id, tenantId });
            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            res.status(200).json({ success: true, data: inquiry.noteEntries });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to fetch notes' });
        }
    }

    // POST /:id/notes — add a note entry
    async addNote(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId;
            if (!tenantId) { NO_TENANT(res); return; }

            const id = req.params.id as string;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                res.status(400).json({ success: false, message: 'Invalid inquiry ID' });
                return;
            }

            const { note } = req.body;
            if (!note || !String(note).trim()) {
                res.status(400).json({ success: false, message: 'Note text is required' });
                return;
            }

            const inquiry = await Inquiry.findOne({ _id: id, tenantId });
            if (!inquiry) {
                res.status(404).json({ success: false, message: 'Inquiry not found' });
                return;
            }

            const staffName = req.user ? `${req.user.firstName} ${req.user.lastName}`.trim() : undefined;

            inquiry.noteEntries.push({ note: String(note).trim(), staffName } as any);
            await inquiry.save();

            res.status(201).json({
                success: true,
                message: 'Note added',
                data: inquiry.noteEntries[inquiry.noteEntries.length - 1],
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message || 'Failed to add note' });
        }
    }
}

export default new InquiryController();
