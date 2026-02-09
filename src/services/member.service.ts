import Member, { IMember, MemberStatus } from '../models/Member.model';
import { generateMembershipNumber, generateReferralCode } from '../utils/helpers.utils';
import mongoose from 'mongoose';

export interface CreateMemberDTO {
    tenantId: string;
    branchId: string;
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    dateOfBirth?: Date;
    gender?: 'male' | 'female' | 'other';
    bloodGroup?: string;
    address?: {
        street: string;
        city: string;
        state: string;
        country: string;
        zipCode: string;
    };
    emergencyContact?: {
        name: string;
        relationship: string;
        mobile: string;
    };
    goals?: string[];
    referredBy?: string;
}

export interface UpdateMemberDTO {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    dateOfBirth?: Date;
    gender?: 'male' | 'female' | 'other';
    bloodGroup?: string;
    address?: any;
    emergencyContact?: any;
    healthInfo?: any;
    goals?: string[];
    preferences?: any;
}

export interface AddMeasurementDTO {
    weight: number;
    height: number;
    bodyFat?: number;
    muscleMass?: number;
    circumferences?: {
        chest?: number;
        waist?: number;
        hips?: number;
        biceps?: number;
        thighs?: number;
    };
    notes?: string;
}

export class MemberService {
    // Create new member
    async createMember(data: CreateMemberDTO): Promise<IMember> {
        // Check if member already exists
        const existingMember = await Member.findOne({
            tenantId: data.tenantId,
            $or: [{ email: data.email }, { mobile: data.mobile }],
        });

        if (existingMember) {
            throw new Error('Member already exists with this email or mobile');
        }

        // Generate membership number and referral code
        const membershipNumber = generateMembershipNumber(data.tenantId, data.branchId);
        const referralCode = generateReferralCode(membershipNumber);

        // Create member
        const member = await Member.create({
            ...data,
            membershipNumber,
            status: 'lead',
            statusHistory: [{
                status: 'lead',
                changedAt: new Date(),
                reason: 'Initial registration',
            }],
            referral: {
                code: referralCode,
                referredBy: data.referredBy,
            },
        });

        return member;
    }

    // Get member by ID
    async getMemberById(memberId: string, tenantId: string): Promise<IMember | null> {
        return await Member.findOne({ _id: memberId, tenantId });
    }

    // Get member by membership number
    async getMemberByNumber(membershipNumber: string, tenantId: string): Promise<IMember | null> {
        return await Member.findOne({ membershipNumber, tenantId });
    }

    // Update member
    async updateMember(memberId: string, tenantId: string, data: UpdateMemberDTO): Promise<IMember | null> {
        return await Member.findOneAndUpdate(
            { _id: memberId, tenantId },
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    // Change member status
    async changeMemberStatus(
        memberId: string,
        tenantId: string,
        newStatus: MemberStatus,
        reason: string
    ): Promise<IMember | null> {
        return await Member.findOneAndUpdate(
            { _id: memberId, tenantId },
            {
                $set: { status: newStatus },
                $push: {
                    statusHistory: {
                        status: newStatus,
                        changedAt: new Date(),
                        reason,
                    },
                },
            },
            { new: true }
        );
    }

    // Add body measurement
    async addMeasurement(
        memberId: string,
        tenantId: string,
        data: AddMeasurementDTO
    ): Promise<IMember | null> {
        const { weight, height, ...rest } = data;

        // Calculate BMI
        const heightInMeters = height / 100;
        const bmi = parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(2));

        return await Member.findOneAndUpdate(
            { _id: memberId, tenantId },
            {
                $push: {
                    measurements: {
                        date: new Date(),
                        weight,
                        height,
                        bmi,
                        ...rest,
                    },
                },
            },
            { new: true }
        );
    }

    // Add transformation photo
    async addTransformationPhoto(
        memberId: string,
        tenantId: string,
        photoUrl: string,
        type: 'before' | 'progress' | 'after',
        notes?: string
    ): Promise<IMember | null> {
        return await Member.findOneAndUpdate(
            { _id: memberId, tenantId },
            {
                $push: {
                    transformationGallery: {
                        date: new Date(),
                        photoUrl,
                        type,
                        notes,
                    },
                },
            },
            { new: true }
        );
    }

    // Upload document
    async uploadDocument(
        memberId: string,
        tenantId: string,
        documentType: string,
        documentUrl: string
    ): Promise<IMember | null> {
        return await Member.findOneAndUpdate(
            { _id: memberId, tenantId },
            {
                $push: {
                    documents: {
                        type: documentType,
                        url: documentUrl,
                        uploadedAt: new Date(),
                    },
                },
            },
            { new: true }
        );
    }

    // Get all members with filters
    async getMembers(
        tenantId: string,
        branchId?: string,
        status?: MemberStatus,
        page: number = 1,
        limit: number = 20,
        search?: string
    ): Promise<{ members: IMember[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;
        if (status) filter.status = status;
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
                { membershipNumber: { $regex: search, $options: 'i' } },
            ];
        }

        const [members, total] = await Promise.all([
            Member.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
            Member.countDocuments(filter),
        ]);

        return { members, total };
    }

    // Get member statistics
    async getMemberStats(tenantId: string, branchId?: string): Promise<any> {
        const filter: any = { tenantId };
        if (branchId) filter.branchId = branchId;

        const stats = await Member.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const total = await Member.countDocuments(filter);

        return {
            total,
            byStatus: stats.reduce((acc: any, curr: any) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {}),
        };
    }

    // Track referral
    async trackReferral(referralCode: string, tenantId: string): Promise<IMember | null> {
        return await Member.findOneAndUpdate(
            { 'referral.code': referralCode, tenantId },
            { $inc: { 'referral.successfulReferrals': 1 } },
            { new: true }
        );
    }
}

export default new MemberService();
