import { Request, Response } from 'express';
import User, { IUser } from '../models/User.model';
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
                staff,
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

        res.status(200).json({ success: true, data: staff });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching staff member', error: (error as Error).message });
    }
};

export const createStaffMember = async (req: Request, res: Response) => {
    try {
        const { email, password, role, ...otherData } = req.body;
        const tenantId = req.user?.role === 'super_admin' ? req.body.tenantId : req.user?.tenantId;

        if (!['staff', 'trainer', 'branch_manager', 'accountant'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Invalid role for staff member' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }

        const newStaff = await User.create({
            email,
            password, // Password will be hashed by User model pre-save hook
            role,
            tenantId,
            ...otherData,
        });

        const staffResponse = newStaff.toObject();
        // @ts-ignore
        delete staffResponse.password;

        res.status(201).json({ success: true, data: staffResponse, message: 'Staff member created successfully' });
    } catch (error) {
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

        const staff = await User.findOneAndUpdate(query, { $set: updates }, { new: true }).select('-password');

        if (!staff) {
            return res.status(404).json({ success: false, message: 'Staff member not found' });
        }

        res.status(200).json({ success: true, data: staff, message: 'Staff member updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating staff member', error: (error as Error).message });
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

        res.status(200).json({ success: true, data: staff, message: 'Staff status updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error updating staff status', error: (error as Error).message });
    }
};
