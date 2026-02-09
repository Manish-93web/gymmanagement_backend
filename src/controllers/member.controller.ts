import { Request, Response } from 'express';
import memberService from '../services/member.service';
import { z } from 'zod';
import { MemberStatus } from '../models/Member.model';

// Validation schemas
const createMemberSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    mobile: z.string().min(10).max(15),
    dateOfBirth: z.string().optional().transform(val => val ? new Date(val) : undefined),
    gender: z.enum(['male', 'female', 'other']).optional(),
    bloodGroup: z.string().optional(),
    address: z.object({
        street: z.string(),
        city: z.string(),
        state: z.string(),
        country: z.string(),
        zipCode: z.string(),
    }).optional(),
    emergencyContact: z.object({
        name: z.string(),
        relationship: z.string(),
        mobile: z.string(),
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
    status: z.enum(['lead', 'trial', 'active', 'paused', 'expired', 'cancelled', 'archived']),
    reason: z.string().min(1),
});

export class MemberController {
    // Create new member
    async createMember(req: Request, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.branchId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Tenant and branch context required',
                });
                return;
            }

            const validatedData = createMemberSchema.parse(req.body);

            const member = await memberService.createMember({
                ...validatedData,
                tenantId: req.tenantId,
                branchId: req.branchId,
            });

            res.status(201).json({
                status: 'success',
                message: 'Member created successfully',
                data: { member },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to create member',
            });
        }
    }

    // Get member by ID
    async getMember(req: Request, res: Response): Promise<void> {
        try {
            const { memberId } = req.params;

            if (!req.tenantId) {
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
                data: { member },
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

            if (!req.tenantId) {
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
                data: { member },
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

            if (!req.tenantId) {
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

            if (!req.tenantId) {
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
            if (!req.tenantId) {
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
            if (!req.tenantId) {
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
}

export default new MemberController();
