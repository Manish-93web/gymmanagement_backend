import { normalizeIndianMobile } from './platform-lead.controller';
import { Request, Response } from 'express';
import crypto from 'crypto';
import User, { IUser } from '../models/User.model';
import Branch from '../models/Branch.model';
import StaffFace from '../models/StaffFace.model';
import StaffShiftService from '../services/staff-shift.service';
import { placeholderEmail, placeholderMobile, withoutPlaceholders } from '../utils/placeholders';
import { Types } from 'mongoose';

export const getStaffList = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const { role, status, search, page = 1, limit = 10 } = req.query;

        const query: any = {};
        if (tenantId) query.tenantId = tenantId;

        // Filter by specific staff roles if not provided
        if (role) {
            query.role = role;
        } else {
            query.role = { $in: ['staff', 'trainer', 'branch_manager', 'accountant'] };
        }

        if (status) {
            query.isActive = status === 'active';
        }

        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);

        const staff = await User.find(query)
            .select('-password')
            .skip(skip)
            .limit(Number(limit))
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                staff: staff.map(s => withoutPlaceholders(s)),
                total,
                page: Number(page),
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching staff list', error: (error as Error).message });
    }
};

export const getStaffStats = async (req: Request, res: Response) => {
    try {
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const query: any = {
            role: { $in: ['staff', 'trainer', 'branch_manager', 'accountant'] }
        };
        if (tenantId) query.tenantId = tenantId;

        const totalStaff = await User.countDocuments(query);
        const activeStaff = await User.countDocuments({ ...query, isActive: true });

        // Group by role
        const byRole = await User.aggregate([
            { $match: query },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        const roleStats = byRole.reduce((acc: any, curr: any) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            data: {
                totalStaff,
                activeStaff,
                roleStats
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching staff stats', error: (error as Error).message });
    }
};

export const getStaffMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;

        const query: any = { _id: id };
        if (tenantId) query.tenantId = tenantId;

        const staff = await User.findOne(query).select('-password');

        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        res.status(200).json({ success: true, data: withoutPlaceholders(staff) });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching staff member', error: (error as Error).message });
    }
};

export const createStaffMember = async (req: Request, res: Response) => {
    try {
        const { email, password, role, firstName, lastName, mobile, salary, shiftId, branchId: bodyBranchId } = req.body;
        const tenantId = req.user?.role === 'super_admin' ? req.body.tenantId : req.user?.tenantId;

        if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant context required' });
        if (!['staff', 'trainer', 'branch_manager', 'accountant'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role for staff member' });
        }
        if (typeof firstName !== 'string' || !firstName.trim()) {
            return res.status(400).json({ success: false, message: 'First name is required' });
        }

        // Email and phone are optional. A typed phone must be a valid Indian mobile, and neither may belong to another account.
        const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
        if (cleanEmail && await User.exists({ email: cleanEmail })) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        const cleanMobile = mobile ? normalizeIndianMobile(mobile) : null;
        if (mobile && !cleanMobile) {
            return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number.' });
        }
        if (cleanMobile && await User.exists({ mobile: cleanMobile })) {
            return res.status(409).json({ success: false, message: 'This phone number is already used by another account.' });
        }
        const pay = Number(salary);
        if (salary !== undefined && salary !== '' && !(pay >= 0)) {
            return res.status(400).json({ success: false, message: 'Salary must be a positive number' });
        }

        // Checked before anything is created, so a bad choice leaves no half-made account behind.
        if (shiftId && !(await StaffShiftService.exists(String(tenantId), shiftId))) {
            return res.status(400).json({ success: false, message: 'The chosen shift was not found' });
        }
        let branchId = bodyBranchId || (req as any).branchId;
        if (!branchId) branchId = (await Branch.findOne({ tenantId }).select('_id').lean() as any)?._id;
        if (!branchId) return res.status(400).json({ success: false, message: 'No branch found for this gym. Please create a branch first.' });

        const newStaff = await User.create({
            email: cleanEmail || placeholderEmail(),
            mobile: cleanMobile || placeholderMobile(),
            // Staff set their own password on first login. An account with no real email cannot be signed into,
            // so it gets a random one rather than a known default.
            password: password || (cleanEmail ? 'Staff@123' : crypto.randomBytes(18).toString('base64url')),
            role,
            tenantId,
            branchId,
            firstName: firstName.trim(),
            lastName: typeof lastName === 'string' ? lastName.trim() : '',
            ...(pay > 0 && { salary: pay }),
            isActive: true,
        } as any);

        if (shiftId) await StaffShiftService.assignFromToday(String(tenantId), String(newStaff._id), String(shiftId), req.user?._id?.toString());

        const staffResponse: any = withoutPlaceholders(newStaff);
        delete staffResponse.password;

        res.status(201).json({ success: true, data: staffResponse, message: 'Staff member created successfully' });
    } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ success: false, message: 'This phone number or email is already used by another account.' });
        res.status(500).json({ success: false, message: 'Error creating staff member', error: (error as Error).message });
    }
};

export const updateStaffMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;
        const updates = req.body;

        const query: any = { _id: id };
        if (tenantId) query.tenantId = tenantId;

        // Prevent password update via this endpoint directly if needed, or allow it
        if (updates.password) {
            // If password is updated, we need to handle hashing if simpler update is used, 
            // but findOneAndUpdate bypasses pre-save hooks unless documented otherwise or using save()
            // For safety, let's assume separate password update or use save() 
            // But for now, let's just strip password to be safe, assuming there's a specific endpoint or we use save()
            delete updates.password;
        }

        if (typeof updates.mobile === 'string' && updates.mobile.trim()) {
            const clean = normalizeIndianMobile(updates.mobile);
            if (!clean) return res.status(400).json({ success: false, message: 'Please enter a valid 10-digit mobile number.' });
            updates.mobile = clean;
        }

        const staff = await User.findOneAndUpdate(query, { $set: updates }, { new: true }).select('-password');

        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        res.status(200).json({ success: true, data: staff, message: 'Staff member updated successfully' });
    } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ success: false, message: 'This phone number or email is already used by another account.' });
        res.status(500).json({ success: false, message: 'Error updating staff member', error: (error as Error).message });
    }
};

export const deleteStaffMember = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;

        const query: any = { _id: id };
        if (tenantId) query.tenantId = tenantId;

        // Soft-delete, consistent with member.controller.ts's deleteMember: deactivate
        // rather than remove the account, since staff records are referenced by
        // attendance/payroll history.
        const staff = await User.findOneAndUpdate(query, { isActive: false }, { new: true }).select('-password');

        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        await StaffFace.deleteMany({ tenantId: staff.tenantId, staffId: staff._id });   // the face template goes with the person

        res.status(200).json({ success: true, data: staff, message: 'Staff member deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting staff member', error: (error as Error).message });
    }
};

export const updateStaffStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting 'active' or 'inactive' to map to boolean
        const tenantId = req.user?.role === 'super_admin' ? undefined : req.user?.tenantId;

        const query: any = { _id: id };
        if (tenantId) query.tenantId = tenantId; // Enforce tenant check

        const isActive = status === 'active';

        const staff = await User.findOneAndUpdate(query, { isActive }, { new: true }).select('-password');

        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        // someone made inactive no longer checks in, so their face template is not kept
        if (!isActive) await StaffFace.deleteMany({ tenantId: staff.tenantId, staffId: staff._id });

        res.status(200).json({ success: true, data: staff, message: 'Staff status updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating staff status', error: (error as Error).message });
    }
};
