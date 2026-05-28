import Member, { IMember, MemberStatus } from '../models/Member.model';
import Subscription from '../models/Subscription.model';
import Payment from '../models/Payment.model';
import User from '../models/User.model';
import { generateReferralCode, generateMembershipNumber, generateInvoiceNumber } from '../utils/helpers.utils';
import mongoose from 'mongoose';

export interface CreateMemberDTO {
    tenantId: string;
    branchId: string;
    firstName: string;
    lastName?: string;
    email?: string;
    mobile: string;
    aadharNumber?: string;
    personalInfo?: {
        dateOfBirth?: Date;
        gender?: 'male' | 'female' | 'other';
        bloodGroup?: string;
        profilePicture?: string;
        emergencyContact?: {
            name?: string;
            relationship?: string;
            phone?: string;
        };
    };
    address?: {
        street: string;
        city: string;
        state: string;
        country: string;
        zipCode: string;
    };
    goals?: string[];
    referredBy?: string;
    status?: MemberStatus;
    documents?: { type: string; name: string; url: string; uploadedAt: Date }[];
    amount?: number;
    discountType?: 'none' | 'flat' | 'percentage';
    discountAmount?: number;
    discountValue?: number;
    gstAmount?: number;
    gstRate?: number;
    paymentMethod?: string;
    dueAmount?: number;
    dueDate?: Date | string;
    membershipFee?: number;
    membershipDuration?: string;
    membershipStart?: Date | string;
    membershipExpiry?: Date | string;
    planId?: string;
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
    // Helper to repair/populate missing fields from User identity
    private _repairMemberFields(member: any): any {
        if (!member) return null;
        const memberObj = member.toObject ? member.toObject() : member;

        if (memberObj.userId && (typeof memberObj.userId === 'object')) {
            memberObj.firstName = memberObj.firstName || memberObj.userId.firstName;
            memberObj.lastName = memberObj.lastName || memberObj.userId.lastName;
            memberObj.email = memberObj.email || memberObj.userId.email;
            memberObj.mobile = memberObj.mobile || memberObj.userId.mobile;
        }
        return memberObj;
    }

    // Create new member
    async createMember(data: CreateMemberDTO): Promise<IMember> {
        // Check for duplicate mobile (within tenant)
        const orConditions: any[] = [{ mobile: data.mobile }];
        if (data.email) orConditions.push({ email: data.email.toLowerCase() });
        const existingMember = await Member.findOne({
            tenantId: data.tenantId,
            $or: orConditions,
        });
        if (existingMember) {
            throw new Error('A member with this mobile or email is already registered.');
        }

        // Generate membership number and sequential S.No
        const membershipNumber = generateMembershipNumber(data.tenantId, data.branchId);
        const referralCode = generateReferralCode(membershipNumber);
        const sNo = (await Member.countDocuments({ tenantId: new mongoose.Types.ObjectId(data.tenantId) })) + 1;

        // Placeholder email when none provided (avoids cross-tenant collisions)
        const tenantSuffix = data.tenantId.toString().slice(-6);
        const emailForUser = data.email ? data.email.toLowerCase() : `${data.mobile}.${tenantSuffix}@member.local`;

        // 1. Create User account for the member
        let user: any;
        try {
            user = await (User as any).create({
                tenantId: data.tenantId,
                branchId: data.branchId,
                role: 'member',
                email: emailForUser,
                mobile: data.mobile,
                password: 'Welcome@123',
                firstName: data.firstName,
                lastName: data.lastName ?? '',
                isActive: true,
            });
        } catch (err: any) {
            if (err.code === 11000) {
                const field = Object.keys(err.keyPattern || {})[0];
                if (field === 'email') {
                    throw new Error('This email is already registered. Please use a different email or leave it blank.');
                }
                if (field === 'mobile') {
                    const existingUser = await User.findOne({ mobile: data.mobile });
                    if (existingUser && (existingUser as any).role === 'member') {
                        user = existingUser;
                    } else {
                        throw new Error('This mobile number is linked to a staff or owner account.');
                    }
                } else {
                    throw new Error('A member with this email or mobile already exists.');
                }
            } else {
                throw err;
            }
        }

        // 2. Compute membership dates
        const membershipStart = data.membershipStart ? new Date(data.membershipStart as string) : new Date();
        const DURATION_MONTHS: Record<string, number> = {
            '1_month': 1, '2_month': 2, '3_month': 3, '4_month': 4,
            '6_month': 6, '7_month': 7, '8_month': 8, '9_month': 9, '1_year': 12,
        };
        let membershipExpiry: Date | undefined = data.membershipExpiry ? new Date(data.membershipExpiry as string) : undefined;
        if (!membershipExpiry && data.membershipDuration) {
            const months = DURATION_MONTHS[data.membershipDuration] ?? 1;
            membershipExpiry = new Date(membershipStart);
            membershipExpiry.setMonth(membershipExpiry.getMonth() + months);
        }

        // 3. Create member document
        const member = await (Member as any).create({
            tenantId: data.tenantId,
            branchId: data.branchId,
            userId: user._id,
            firstName: data.firstName,
            lastName: data.lastName ?? '',
            email: data.email ? data.email.toLowerCase() : emailForUser,
            mobile: data.mobile,
            ...(data.aadharNumber ? { aadharNumber: data.aadharNumber } : {}),
            membershipNumber,
            sNo,
            status: 'active',
            personalInfo: data.personalInfo,
            address: data.address,
            goals: data.goals,
            referralCode,
            referredBy: data.referredBy ? new mongoose.Types.ObjectId(data.referredBy) : undefined,
            documents: data.documents ?? [],
            membershipFee: data.amount ?? 0,
            discountAmount: data.discountAmount ?? 0,
            discountType: data.discountType ?? 'none',
            discountValue: data.discountValue ?? 0,
            dueAmount: data.dueAmount ?? 0,
            dueDate: data.dueDate ? new Date(data.dueDate as string) : undefined,
            paymentStatus: (data.amount && data.amount > 0 && (data.dueAmount ?? 0) === 0) ? 'paid' : 'unpaid',
            ...(data.membershipDuration ? { membershipDuration: data.membershipDuration } : {}),
            membershipStart,
            ...(membershipExpiry ? { membershipExpiry } : {}),
            ...(data.planId ? { planId: new mongoose.Types.ObjectId(data.planId) } : {}),
            statusHistory: [{ status: 'active', changedAt: new Date(), reason: 'Initial registration' }],
            membershipHistory: membershipStart && membershipExpiry ? [{
                startDate: membershipStart,
                expiryDate: membershipExpiry,
                planDuration: data.membershipDuration,
                fee: data.amount ?? 0,
                discountAmount: data.discountAmount ?? 0,
                paymentMethod: data.paymentMethod ?? 'cash',
                type: 'new',
                recordedAt: new Date(),
            }] : [],
        });

        // 4. Auto-create Payment record so revenue appears in analytics
        if (data.amount && data.amount > 0) {
            try {
                const invoiceNumber = generateInvoiceNumber(data.tenantId, 'MEM');
                const gstAmt = data.gstAmount ?? 0;
                const discAmt = data.discountAmount ?? 0;
                const dueAmt = data.dueAmount ?? 0;
                const total = data.amount - discAmt + gstAmt - dueAmt;
                await Payment.create({
                    tenantId: new mongoose.Types.ObjectId(data.tenantId),
                    branchId: new mongoose.Types.ObjectId(data.branchId),
                    memberId: member._id,
                    invoiceNumber,
                    paymentType: 'subscription',
                    type: 'subscription',
                    method: (data.paymentMethod || 'cash') as any,
                    status: 'completed',
                    paidAt: new Date(),
                    amount: { subtotal: data.amount, taxAmount: gstAmt, discountAmount: discAmt, total },
                    taxDetails: { taxType: gstAmt > 0 ? 'GST' : 'NONE', taxRate: data.gstRate ?? 0 },
                    invoice: { generated: false, emailSent: false },
                    metadata: {
                        description: `Membership registration — ${data.membershipDuration?.replace('_', ' ') ?? ''}`,
                        membershipStart,
                        membershipExpiry,
                        items: [{ name: `Membership (${data.membershipDuration?.replace('_', ' ') ?? ''})`, quantity: 1, price: data.amount, total }],
                    },
                    notes: 'Auto-created on member registration',
                });
            } catch (payErr) {
                console.error('[MemberService] Failed to create membership payment record:', payErr);
            }
        }

        // 5. Return member with identity fields for immediate UI update
        const memberObj = member.toObject();
        memberObj.firstName = data.firstName;
        memberObj.lastName = data.lastName ?? '';
        memberObj.email = data.email ?? '';
        memberObj.mobile = data.mobile;

        return memberObj as any;
    }

    // Get member by ID
    async getMemberById(memberId: string, tenantId?: string): Promise<IMember | null> {
        const query: any = { _id: memberId };
        if (tenantId) query.tenantId = tenantId;
        const member = await Member.findOne(query).populate('userId');
        return this._repairMemberFields(member);
    }

    // Get member by membership number
    async getMemberByNumber(membershipNumber: string, tenantId: string): Promise<IMember | null> {
        const member = await Member.findOne({ membershipNumber, tenantId }).populate('userId');
        return this._repairMemberFields(member);
    }

    // Get member by User ID
    async getMemberByUserId(userId: string, tenantId: string): Promise<IMember | null> {
        const member = await Member.findOne({ userId, tenantId }).populate('userId');
        return this._repairMemberFields(member);
    }

    // Update member
    async updateMember(memberId: string, tenantId: string, data: UpdateMemberDTO): Promise<IMember | null> {
        const query: any = { _id: memberId };
        if (tenantId) query.tenantId = tenantId;
        const member = await Member.findOneAndUpdate(
            query,
            { $set: data },
            { new: true, runValidators: true }
        ).populate('userId');
        return this._repairMemberFields(member);
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
        tenantId?: string,
        branchId?: string,
        status?: MemberStatus,
        page: number = 1,
        limit: number = 20,
        search?: string,
        planId?: string,
        duration?: string
    ): Promise<{ members: IMember[]; total: number }> {
        const skip = (page - 1) * limit;

        const filter: any = {};
        if (tenantId) filter.tenantId = tenantId;
        if (branchId) filter.branchId = branchId;
        if (status) filter.status = status;
        if (planId) filter.planId = planId;
        if (duration) filter.membershipDuration = duration;
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
            Member.find(filter)
                .populate('userId')
                .populate('planId', 'name price duration')
                .skip(skip)
                .limit(limit)
                .sort({ createdAt: -1 }),
            Member.countDocuments(filter),
        ]);

        // Fallback for names/contact if not present on member document (legacy data)
        const repairedMembers = members.map((member: any) => this._repairMemberFields(member));

        return { members: repairedMembers, total };
    }

    // Get member statistics
    async getMemberStats(tenantId?: string, branchId?: string): Promise<any> {
        const filter: any = {};
        if (tenantId) filter.tenantId = tenantId;
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

    // Freeze membership
    async freezeMember(
        memberId: string,
        tenantId: string,
        startDate: Date,
        endDate: Date,
        reason: string
    ): Promise<IMember | null> {
        // 1. Update Member status
        const member = await Member.findOneAndUpdate(
            { _id: memberId, tenantId },
            {
                $set: { status: 'frozen' },
                $push: {
                    statusHistory: {
                        status: 'frozen',
                        changedAt: new Date(),
                        reason: `Membership frozen: ${reason}`,
                    },
                },
            },
            { new: true }
        );

        if (!member) return null;

        // 2. Update Subscription status and history
        const daysExtended = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        await Subscription.findOneAndUpdate(
            { memberId, tenantId, status: 'active' },
            {
                $set: {
                    status: 'frozen',
                    currentFreeze: { startDate, plannedEndDate: endDate, reason }
                },
                $push: {
                    freezeHistory: {
                        startDate,
                        endDate,
                        reason,
                        daysExtended,
                        approvedBy: member.userId // Simplified for now
                    }
                }
            }
        );

        return this._repairMemberFields(member);
    }

    // Reactivate membership
    async reactivateMember(
        memberId: string,
        tenantId: string,
        reason: string = 'Manual reactivation'
    ): Promise<IMember | null> {
        const member = await Member.findOne({ _id: memberId, tenantId });
        if (!member) return null;

        const previousStatus = member.status;

        // 1. Update Member status
        const updatedMember = await Member.findByIdAndUpdate(
            memberId,
            {
                $set: { status: 'active' },
                $push: {
                    statusHistory: {
                        status: 'active',
                        changedAt: new Date(),
                        reason: `Reactivated from ${previousStatus}: ${reason}`,
                    },
                },
            },
            { new: true }
        );

        // 2. Update Subscription status if it was frozen or paused
        if (previousStatus === 'frozen' || previousStatus === 'paused') {
            await Subscription.findOneAndUpdate(
                { memberId, tenantId, status: previousStatus },
                {
                    $set: { status: 'active' },
                    $unset: { currentFreeze: "" }
                }
            );
        }

        return this._repairMemberFields(updatedMember);
    }

    // Transfer member between branches
    async transferMember(
        memberId: string,
        tenantId: string,
        newBranchId: string,
        reason: string
    ): Promise<IMember | null> {
        const member = await Member.findOneAndUpdate(
            { _id: memberId, tenantId },
            {
                $set: { branchId: new mongoose.Types.ObjectId(newBranchId) },
                $push: {
                    statusHistory: {
                        status: 'active', // Keep active or current status
                        changedAt: new Date(),
                        reason: `Transferred branch to ${newBranchId}. Reason: ${reason}`,
                    },
                },
            },
            { new: true }
        );

        if (member) {
            // Also update the User model
            await User.findByIdAndUpdate(member.userId, { branchId: newBranchId });

            // Update active subscription
            await Subscription.findOneAndUpdate(
                { memberId, tenantId, status: 'active' },
                { $set: { branchId: new mongoose.Types.ObjectId(newBranchId) } }
            );
        }

        return this._repairMemberFields(member);
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
