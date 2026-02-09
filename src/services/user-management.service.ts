import User from '../models/User.model';
import Role from '../models/Role.model';
import logger from '../config/logger';

interface UserManagementData {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    role: string;
    branchId?: string;
    tenantId: string;
    isActive: boolean;
}

class UserManagementService {
    /**
     * Create user
     */
    async createUser(data: UserManagementData) {
        const existingUser = await User.findOne({ email: data.email });

        if (existingUser) {
            throw new Error('User with this email already exists');
        }

        const user = await User.create({
            ...data,
            createdAt: new Date(),
        });

        logger.info('User created', { userId: user._id });

        return user;
    }

    /**
     * Get all users
     */
    async getAllUsers(tenantId: string, filters?: {
        role?: string;
        branchId?: string;
        isActive?: boolean;
        search?: string;
    }) {
        const query: any = { tenantId };

        if (filters?.role) query.role = filters.role;
        if (filters?.branchId) query.branchId = filters.branchId;
        if (filters?.isActive !== undefined) query.isActive = filters.isActive;

        if (filters?.search) {
            query.$or = [
                { firstName: { $regex: filters.search, $options: 'i' } },
                { lastName: { $regex: filters.search, $options: 'i' } },
                { email: { $regex: filters.search, $options: 'i' } },
            ];
        }

        const users = await User.find(query)
            .populate('branchId', 'name')
            .sort({ createdAt: -1 });

        return users;
    }

    /**
     * Update user
     */
    async updateUser(userId: string, updates: Partial<UserManagementData>) {
        const user = await User.findByIdAndUpdate(userId, updates, { new: true });

        if (!user) {
            throw new Error('User not found');
        }

        logger.info('User updated', { userId });

        return user;
    }

    /**
     * Delete user
     */
    async deleteUser(userId: string) {
        const user = await User.findByIdAndDelete(userId);

        if (!user) {
            throw new Error('User not found');
        }

        logger.info('User deleted', { userId });

        return {
            success: true,
            message: 'User deleted successfully',
        };
    }

    /**
     * Activate/Deactivate user
     */
    async toggleUserStatus(userId: string, isActive: boolean) {
        const user = await User.findByIdAndUpdate(
            userId,
            { isActive },
            { new: true }
        );

        if (!user) {
            throw new Error('User not found');
        }

        logger.info('User status toggled', { userId, isActive });

        return user;
    }

    /**
     * Reset user password
     */
    async resetPassword(userId: string, newPassword: string) {
        const user = await User.findById(userId);

        if (!user) {
            throw new Error('User not found');
        }

        user.password = newPassword; // Will be hashed by pre-save hook
        await user.save();

        logger.info('User password reset', { userId });

        return {
            success: true,
            message: 'Password reset successfully',
        };
    }

    /**
     * Get user statistics
     */
    async getUserStatistics(tenantId: string) {
        const users = await User.find({ tenantId });

        const stats = {
            total: users.length,
            active: users.filter((u) => u.isActive).length,
            inactive: users.filter((u) => !u.isActive).length,
            byRole: {} as any,
        };

        users.forEach((user) => {
            stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
        });

        return stats;
    }
}

export default new UserManagementService();
