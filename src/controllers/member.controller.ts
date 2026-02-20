import { Request, Response } from 'express';
import memberService from '../services/member.service';
import Branch from '../models/Branch.model';
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
            const { memberId } = req.params;

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
            const { memberId } = req.params;

            if (req.user?.role !== 'super_admin' && !req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context required',
                });
                return;
            }

            const validatedData = updateMemberSchema.parse(req.body);

            const member = await memberService.updateMember(memberId, req.tenantId, validatedData);

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
            const { memberId } = req.params;

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
                req.tenantId,
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
            const { memberId } = req.params;

            if (req.user?.role !== 'super_admin' && !req.tenantId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant context required',
                });
                return;
            }

            const validatedData = addMeasurementSchema.parse(req.body);

            const member = await memberService.addMeasurement(memberId, req.tenantId, validatedData);

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
            const { memberId } = req.params;
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
            const { memberId } = req.params;
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
            const { memberId } = req.params;
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
