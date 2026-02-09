import Group from '../models/Group.model';
import GroupMember from '../models/GroupMember.model';
import Member from '../models/Member.model';
import logger from '../config/logger';

interface GroupConfig {
    name: string;
    description: string;
    type: 'public' | 'private' | 'secret';
    category: 'fitness_goal' | 'workout_type' | 'social' | 'challenge' | 'other';
    coverImage?: string;
    rules?: string[];
    maxMembers?: number;
    createdBy: string;
    tenantId: string;
    branchId?: string;
}

class CommunityGroupService {
    /**
     * Create group
     */
    async createGroup(config: GroupConfig) {
        const group = await Group.create({
            ...config,
            memberCount: 1,
            postCount: 0,
            isActive: true,
            createdAt: new Date(),
        });

        // Add creator as admin
        await GroupMember.create({
            groupId: group._id,
            memberId: config.createdBy,
            role: 'admin',
            joinedAt: new Date(),
        });

        logger.info('Group created', { groupId: group._id, name: config.name });

        return group;
    }

    /**
     * Join group
     */
    async joinGroup(groupId: string, memberId: string) {
        const group = await Group.findById(groupId);
        if (!group) throw new Error('Group not found');

        if (!group.isActive) {
            throw new Error('Group is not active');
        }

        if (group.maxMembers && group.memberCount >= group.maxMembers) {
            throw new Error('Group is full');
        }

        // Check if already a member
        const existing = await GroupMember.findOne({ groupId, memberId });
        if (existing) {
            throw new Error('Already a member of this group');
        }

        // For private groups, require approval
        if (group.type === 'private') {
            await GroupMember.create({
                groupId,
                memberId,
                role: 'member',
                status: 'pending',
                joinedAt: new Date(),
            });

            return {
                success: true,
                message: 'Join request sent. Awaiting approval.',
                status: 'pending',
            };
        }

        // For public groups, join immediately
        await GroupMember.create({
            groupId,
            memberId,
            role: 'member',
            status: 'active',
            joinedAt: new Date(),
        });

        // Update member count
        await Group.findByIdAndUpdate(groupId, {
            $inc: { memberCount: 1 },
        });

        logger.info('Member joined group', { groupId, memberId });

        return {
            success: true,
            message: 'Successfully joined group',
            status: 'active',
        };
    }

    /**
     * Leave group
     */
    async leaveGroup(groupId: string, memberId: string) {
        const membership = await GroupMember.findOne({ groupId, memberId });
        if (!membership) throw new Error('Not a member of this group');

        if (membership.role === 'admin') {
            // Check if there are other admins
            const adminCount = await GroupMember.countDocuments({
                groupId,
                role: 'admin',
                status: 'active',
            });

            if (adminCount === 1) {
                throw new Error('Cannot leave group as the only admin. Transfer admin rights first.');
            }
        }

        await GroupMember.findByIdAndDelete(membership._id);

        // Update member count
        await Group.findByIdAndUpdate(groupId, {
            $inc: { memberCount: -1 },
        });

        logger.info('Member left group', { groupId, memberId });

        return {
            success: true,
            message: 'Successfully left group',
        };
    }

    /**
     * Approve join request
     */
    async approveJoinRequest(groupId: string, memberId: string, approverId: string) {
        // Check if approver is admin
        const approver = await GroupMember.findOne({
            groupId,
            memberId: approverId,
            role: { $in: ['admin', 'moderator'] },
        });

        if (!approver) {
            throw new Error('Only admins and moderators can approve join requests');
        }

        const membership = await GroupMember.findOne({ groupId, memberId, status: 'pending' });
        if (!membership) throw new Error('Join request not found');

        membership.status = 'active';
        await membership.save();

        // Update member count
        await Group.findByIdAndUpdate(groupId, {
            $inc: { memberCount: 1 },
        });

        logger.info('Join request approved', { groupId, memberId, approverId });

        return {
            success: true,
            message: 'Join request approved',
        };
    }

    /**
     * Get all groups
     */
    async getAllGroups(tenantId: string, filters?: {
        type?: string;
        category?: string;
        branchId?: string;
    }) {
        const query: any = { tenantId, isActive: true };

        if (filters?.type) query.type = filters.type;
        if (filters?.category) query.category = filters.category;
        if (filters?.branchId) query.branchId = filters.branchId;

        // Don't show secret groups unless member
        query.type = { $ne: 'secret' };

        const groups = await Group.find(query)
            .populate('createdBy', 'firstName lastName profilePicture')
            .sort({ memberCount: -1 });

        return groups;
    }

    /**
     * Get member's groups
     */
    async getMemberGroups(memberId: string) {
        const memberships = await GroupMember.find({
            memberId,
            status: 'active',
        }).populate('groupId');

        return memberships.map((m: any) => m.groupId);
    }

    /**
     * Get group members
     */
    async getGroupMembers(groupId: string) {
        const members = await GroupMember.find({ groupId, status: 'active' })
            .populate('memberId', 'firstName lastName profilePicture email')
            .sort({ joinedAt: 1 });

        return members;
    }

    /**
     * Update group
     */
    async updateGroup(groupId: string, updates: Partial<GroupConfig>) {
        const group = await Group.findByIdAndUpdate(groupId, updates, { new: true });

        if (!group) {
            throw new Error('Group not found');
        }

        logger.info('Group updated', { groupId });

        return group;
    }

    /**
     * Delete group
     */
    async deleteGroup(groupId: string, deletedBy: string) {
        // Check if user is admin
        const membership = await GroupMember.findOne({
            groupId,
            memberId: deletedBy,
            role: 'admin',
        });

        if (!membership) {
            throw new Error('Only admins can delete groups');
        }

        await Group.findByIdAndDelete(groupId);
        await GroupMember.deleteMany({ groupId });

        logger.info('Group deleted', { groupId, deletedBy });

        return {
            success: true,
            message: 'Group deleted successfully',
        };
    }

    /**
     * Get group statistics
     */
    async getGroupStatistics(tenantId: string) {
        const totalGroups = await Group.countDocuments({ tenantId, isActive: true });
        const totalMembers = await GroupMember.countDocuments({ status: 'active' });

        const groupsByCategory = await Group.aggregate([
            { $match: { tenantId, isActive: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
        ]);

        const mostPopular = await Group.find({ tenantId, isActive: true })
            .sort({ memberCount: -1 })
            .limit(5)
            .select('name memberCount coverImage');

        return {
            totalGroups,
            totalMembers,
            groupsByCategory,
            mostPopular,
        };
    }
}

export default new CommunityGroupService();
