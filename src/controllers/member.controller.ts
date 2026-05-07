import { Request, Response } from 'express';
import memberService from '../services/member.service';
import Branch from '../models/Branch.model';
import Member from '../models/Member.model';
import Attendance from '../models/Attendance.model';
import { z } from 'zod';
import { MemberStatus } from '../models/Member.model';

const publicSignupSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    mobile: z.string().min(1),
    branchCode: z.string().min(1),
    personalInfo: z.object({
        dateOfBirth: z.string().optional(),
        gender: z.enum(['male', 'female', 'other']).optional(),
    }).optional(),
});

// Validation schemas
const createMemberSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    mobile: z.string().min(10).max(15),
    personalInfo: z.object({
        dateOfBirth: z.string().transform(val => new Date(val)),
        gender: z.enum(['male', 'female', 'other']),
        bloodGroup: z.string().optional(),
        emergencyContact: z.object({
            name: z.string().optional(),
            relationship: z.string().optional(),
            phone: z.string().optional(),
        }).optional(),
    }),
    address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        country: z.string(),
        zipCode: z.string(),
    }).optional(),
    goals: z.array(z.string()).optional(),
    referredBy: z.string().optional(),
});

const updateMemberSchema = createMemberSchema.partial();

const addMeasurementSchema = z.object({
    weight: z.number().positive(),
    height: z.number().positive(),
    bodyFat: z.number().optional(),
    muscleMass: z.number().optional(),
    circumferences: z.object({
        chest: z.number().optional(),
        waist: z.number().optional(),
        hips: z.number().optional(),
        biceps: z.number().optional(),
        thighs: z.number().optional(),
    }).optional(),
    notes: z.string().optional(),
});

const changeStatusSchema = z.object({
    status: z.enum(['lead', 'trial', 'active', 'paused', 'frozen', 'expired', 'cancelled', 'archived']),
    reason: z.string().min(1),
});

const freezeMemberSchema = z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().min(1),
});

const transferMemberSchema = z.object({
    newBranchId: z.string().min(1),
    reason: z.string().min(1),
});

export class MemberController {
    // Create new member
    async createMember(req: Request, res: Response): Promise<void> {
        try {
            const tenantId = req.tenantId || (req.user?.role === 'super_admin' ? req.body.tenantId : undefined);
            const branchId = req.branchId || (req.user?.role === 'super_admin' ? req.body.branchId : undefined);

            if (!tenantId || !branchId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant and branch context required',
                });
                return;
            }

            const validatedData = createMemberSchema.parse(req.body);

            const member = await memberService.createMember({
                ...validatedData,
                tenantId,
                branchId,
            });

            res.status(201).json({
                status: 'success',
                message: 'Member created successfully',
                data: member,
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to create member',
            });
        }
    }

    // Get current member profile
    async getProfile(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user || !req.tenantId) {
                res.status(401).json({
                    status: 'error',
                    message: 'Not authenticated',
                });
                return;
            }

            const member = await memberService.getMemberByUserId(req.user._id.toString(), req.tenantId);

            if (!member) {
                res.status(404).json({
                    status: 'error',
                    message: 'Member profile not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                data: member,
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to get member profile',
            });
        }
    }

    // Get member by ID
    async getMember(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;

            if (req.user?.role !== 'super_admin' && !req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context required',
                });
                return;
            }

            const member = await memberService.getMemberById(memberId, req.tenantId);

            if (!member) {
                res.status(404).json({
                    status: 'error',
                    message: 'Member not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                data: member,
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to get member',
            });
        }
    }

    // Update member
    async updateMember(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;

            if (req.user?.role !== 'super_admin' && !req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context required',
                });
                return;
            }

            const validatedData = updateMemberSchema.parse(req.body);

            const member = await memberService.updateMember(memberId, req.tenantId!, validatedData);

            if (!member) {
                res.status(404).json({
                    status: 'error',
                    message: 'Member not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Member updated successfully',
                data: member,
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to update member',
            });
        }
    }

    // Change member status
    async changeStatus(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;

            if (req.user?.role !== 'super_admin' && !req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context required',
                });
                return;
            }

            const { status, reason } = changeStatusSchema.parse(req.body);

            const member = await memberService.changeMemberStatus(
                memberId,
                req.tenantId!,
                status as MemberStatus,
                reason
            );

            if (!member) {
                res.status(404).json({
                    status: 'error',
                    message: 'Member not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Member status updated successfully',
                data: { member },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to change member status',
            });
        }
    }

    // Add measurement
    async addMeasurement(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;

            if (req.user?.role !== 'super_admin' && !req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context required',
                });
                return;
            }

            const validatedData = addMeasurementSchema.parse(req.body);

            const member = await memberService.addMeasurement(memberId, req.tenantId!, validatedData);

            if (!member) {
                res.status(404).json({
                    status: 'error',
                    message: 'Member not found',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Measurement added successfully',
                data: { member },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to add measurement',
            });
        }
    }

    // Get all members
    async getMembers(req: Request, res: Response): Promise<void> {
        try {
            if (req.user?.role !== 'super_admin' && !req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context required',
                });
                return;
            }

            const page = parseInt(req.query.page as string) || 1;
            const limit = parseInt(req.query.limit as string) || 20;
            const status = req.query.status as MemberStatus | undefined;
            const search = req.query.search as string | undefined;

            const result = await memberService.getMembers(
                req.tenantId,
                req.branchId,
                status,
                page,
                limit,
                search
            );

            res.status(200).json({
                status: 'success',
                data: {
                    members: result.members,
                    pagination: {
                        page,
                        limit,
                        total: result.total,
                        pages: Math.ceil(result.total / limit),
                    },
                },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to get members',
            });
        }
    }

    // Get member statistics
    async getMemberStats(req: Request, res: Response): Promise<void> {
        try {
            if (req.user?.role !== 'super_admin' && !req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context required',
                });
                return;
            }

            const stats = await memberService.getMemberStats(req.tenantId, req.branchId);

            res.status(200).json({
                status: 'success',
                data: { stats },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to get member statistics',
            });
        }
    }

    // Freeze member
    async freezeMember(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;
            const { startDate, endDate, reason } = freezeMemberSchema.parse(req.body);

            if (!req.tenantId) {
                res.status(400).json({ status: 'error', message: 'Tenant context required' });
                return;
            }

            const member = await memberService.freezeMember(memberId, req.tenantId, startDate, endDate, reason);

            if (!member) {
                res.status(404).json({ status: 'error', message: 'Member not found' });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Membership frozen successfully',
                data: { member }
            });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Failed to freeze member' });
        }
    }

    // Reactivate member
    async reactivateMember(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;
            const { reason } = req.body;

            if (!req.tenantId) {
                res.status(400).json({ status: 'error', message: 'Tenant context required' });
                return;
            }

            const member = await memberService.reactivateMember(memberId, req.tenantId, reason);

            if (!member) {
                res.status(404).json({ status: 'error', message: 'Member not found' });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Membership reactivated successfully',
                data: { member }
            });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Failed to reactivate member' });
        }
    }

    // Transfer member
    async transferMember(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;
            const { newBranchId, reason } = transferMemberSchema.parse(req.body);

            if (!req.tenantId) {
                res.status(400).json({ status: 'error', message: 'Tenant context required' });
                return;
            }

            const member = await memberService.transferMember(memberId, req.tenantId, newBranchId, reason);

            if (!member) {
                res.status(404).json({ status: 'error', message: 'Member not found' });
                return;
            }

            res.status(200).json({
                status: 'success',
                message: 'Member transferred successfully',
                data: { member }
            });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Failed to transfer member' });
        }
    }

    // Upload profile picture (URL provided by Cloudinary from frontend)
    async uploadProfilePicture(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;
            const { imageUrl } = req.body;

            if (!imageUrl) {
                res.status(400).json({ status: 'error', message: 'imageUrl is required' });
                return;
            }

            const member = await Member.findOneAndUpdate(
                { _id: memberId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) },
                { 'personalInfo.profilePicture': imageUrl },
                { new: true }
            );

            if (!member) {
                res.status(404).json({ status: 'error', message: 'Member not found' });
                return;
            }

            res.status(200).json({ status: 'success', message: 'Profile picture updated', data: { profilePicture: imageUrl } });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Failed to update profile picture' });
        }
    }

    // Add transformation photo
    async addTransformationPhoto(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;
            const { images, weight, description, date } = req.body;

            if (!images || !Array.isArray(images) || images.length === 0) {
                res.status(400).json({ status: 'error', message: 'images array is required' });
                return;
            }

            const member = await Member.findOneAndUpdate(
                { _id: memberId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) },
                {
                    $push: {
                        transformationGallery: {
                            date: date ? new Date(date) : new Date(),
                            images,
                            weight: weight || 0,
                            description,
                        },
                    },
                },
                { new: true }
            );

            if (!member) {
                res.status(404).json({ status: 'error', message: 'Member not found' });
                return;
            }

            res.status(200).json({ status: 'success', message: 'Transformation photo added', data: member.transformationGallery });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Failed to add transformation photo' });
        }
    }

    // Get expiry alerts — members whose membership expires in the next N days
    async getExpiryAlerts(req: Request, res: Response): Promise<void> {
        try {
            if (!req.tenantId) {
                res.status(400).json({ status: 'error', message: 'Tenant context required' });
                return;
            }

            const days = parseInt(req.query.days as string) || 7;
            const now = new Date();
            const future = new Date();
            future.setDate(future.getDate() + days);

            const expiring = await Member.find({
                tenantId: req.tenantId,
                membershipExpiry: { $gte: now, $lte: future },
                status: 'active',
            })
                .select('firstName lastName email mobile membershipExpiry membershipNumber planId')
                .populate('planId', 'name')
                .limit(100)
                .lean();

            const expired = await Member.find({
                tenantId: req.tenantId,
                membershipExpiry: { $lt: now },
                status: { $in: ['active', 'expired'] },
            })
                .select('firstName lastName email mobile membershipExpiry membershipNumber planId')
                .populate('planId', 'name')
                .limit(50)
                .lean();

            res.status(200).json({
                status: 'success',
                data: {
                    expiringSoon: expiring,
                    alreadyExpired: expired,
                    totalExpiring: expiring.length,
                    totalExpired: expired.length,
                },
            });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Failed to get expiry alerts' });
        }
    }

    // Get member timeline (activity history: status changes + attendance)
    async getMemberTimeline(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;

            const member = await Member.findOne({
                _id: memberId,
                ...(req.tenantId ? { tenantId: req.tenantId } : {}),
            })
                .select('statusHistory measurements documents createdAt')
                .lean();

            if (!member) {
                res.status(404).json({ status: 'error', message: 'Member not found' });
                return;
            }

            // Recent attendance entries
            const recentAttendance = await Attendance.find({ memberId, ...(req.tenantId ? { tenantId: req.tenantId } : {}) })
                .sort({ checkInTime: -1 })
                .limit(20)
                .lean();

            const timeline: { date: Date; type: string; title: string; detail?: string }[] = [];

            // Status history events
            (member.statusHistory || []).forEach((s: any) => {
                timeline.push({
                    date: s.changedAt,
                    type: 'status',
                    title: `Status changed to ${s.status}`,
                    detail: s.reason,
                });
            });

            // Measurement events
            (member.measurements || []).forEach((m: any) => {
                timeline.push({
                    date: m.date,
                    type: 'measurement',
                    title: 'Body measurement recorded',
                    detail: `Weight: ${m.weight}kg, Height: ${m.height}cm`,
                });
            });

            // Attendance events
            recentAttendance.forEach((a: any) => {
                timeline.push({
                    date: a.checkInTime,
                    type: 'attendance',
                    title: 'Gym visit',
                    detail: a.checkOutTime ? `Duration: ${Math.round((new Date(a.checkOutTime).getTime() - new Date(a.checkInTime).getTime()) / 60000)} min` : 'Still checked in',
                });
            });

            // Joined event
            timeline.push({
                date: (member as any).createdAt,
                type: 'join',
                title: 'Member joined',
            });

            timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            res.status(200).json({ status: 'success', data: { timeline: timeline.slice(0, 50) } });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Failed to get member timeline' });
        }
    }

    async changeMemberPlan(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params as Record<string, string>;
            const { planId } = req.body;
            if (!planId) { res.status(400).json({ status: 'error', message: 'planId is required' }); return; }
            const tenantId = req.tenantId!;
            const Subscription = (await import('../models/Subscription.model')).default;
            const updated = await Subscription.findOneAndUpdate(
                { memberId, tenantId, status: 'active' },
                { planId, updatedAt: new Date() },
                { new: true }
            );
            if (!updated) { res.status(404).json({ status: 'error', message: 'Active subscription not found' }); return; }
            res.status(200).json({ status: 'success', data: updated });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Failed to change plan' });
        }
    }

    // Public signup
    async publicSignup(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = publicSignupSchema.parse(req.body);

            // 1. Find branch and tenant
            const branch = await Branch.findOne({ code: validatedData.branchCode });
            if (!branch) {
                res.status(404).json({ status: 'error', message: 'Invalid referral code or gym link' });
                return;
            }

            // 2. Create member
            const member = await memberService.createMember({
                firstName: validatedData.firstName,
                lastName: validatedData.lastName,
                email: validatedData.email,
                mobile: validatedData.mobile,
                tenantId: branch.tenantId.toString(),
                branchId: branch._id.toString(),
                status: 'lead'
            });

            res.status(201).json({
                status: 'success',
                message: 'Welcome to our community! Registration complete.',
                data: member
            });
        } catch (error: any) {
            res.status(400).json({ status: 'error', message: error.message || 'Signup failed' });
        }
    }
}

export default new MemberController();

