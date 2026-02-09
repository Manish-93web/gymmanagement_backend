import Role from '../models/Role.model';
import Permission from '../models/Permission.model';
import logger from '../config/logger';

interface RoleData {
    name: string;
    description: string;
    permissions: string[];
    tenantId: string;
}

class RolePermissionService {
    /**
     * Create role
     */
    async createRole(data: RoleData) {
        const role = await Role.create({
            ...data,
            createdAt: new Date(),
        });

        logger.info('Role created', { roleId: role._id });

        return role;
    }

    /**
     * Get all roles
     */
    async getAllRoles(tenantId: string) {
        const roles = await Role.find({ tenantId })
            .populate('permissions')
            .sort({ createdAt: -1 });

        return roles;
    }

    /**
     * Update role
     */
    async updateRole(roleId: string, updates: Partial<RoleData>) {
        const role = await Role.findByIdAndUpdate(roleId, updates, { new: true });

        if (!role) {
            throw new Error('Role not found');
        }

        logger.info('Role updated', { roleId });

        return role;
    }

    /**
     * Delete role
     */
    async deleteRole(roleId: string) {
        const role = await Role.findByIdAndDelete(roleId);

        if (!role) {
            throw new Error('Role not found');
        }

        logger.info('Role deleted', { roleId });

        return {
            success: true,
            message: 'Role deleted successfully',
        };
    }

    /**
     * Get all permissions
     */
    async getAllPermissions() {
        return [
            // Member Management
            { name: 'members.view', description: 'View members', category: 'Members' },
            { name: 'members.create', description: 'Create members', category: 'Members' },
            { name: 'members.edit', description: 'Edit members', category: 'Members' },
            { name: 'members.delete', description: 'Delete members', category: 'Members' },

            // Payment Management
            { name: 'payments.view', description: 'View payments', category: 'Payments' },
            { name: 'payments.create', description: 'Create payments', category: 'Payments' },
            { name: 'payments.refund', description: 'Refund payments', category: 'Payments' },

            // Class Management
            { name: 'classes.view', description: 'View classes', category: 'Classes' },
            { name: 'classes.create', description: 'Create classes', category: 'Classes' },
            { name: 'classes.edit', description: 'Edit classes', category: 'Classes' },
            { name: 'classes.delete', description: 'Delete classes', category: 'Classes' },

            // Reports
            { name: 'reports.view', description: 'View reports', category: 'Reports' },
            { name: 'reports.export', description: 'Export reports', category: 'Reports' },

            // Settings
            { name: 'settings.view', description: 'View settings', category: 'Settings' },
            { name: 'settings.edit', description: 'Edit settings', category: 'Settings' },

            // Users
            { name: 'users.view', description: 'View users', category: 'Users' },
            { name: 'users.create', description: 'Create users', category: 'Users' },
            { name: 'users.edit', description: 'Edit users', category: 'Users' },
            { name: 'users.delete', description: 'Delete users', category: 'Users' },
        ];
    }

    /**
     * Assign permissions to role
     */
    async assignPermissions(roleId: string, permissions: string[]) {
        const role = await Role.findByIdAndUpdate(
            roleId,
            { permissions },
            { new: true }
        );

        if (!role) {
            throw new Error('Role not found');
        }

        logger.info('Permissions assigned to role', { roleId, permissionCount: permissions.length });

        return role;
    }

    /**
     * Check if role has permission
     */
    async hasPermission(roleId: string, permission: string): Promise<boolean> {
        const role = await Role.findById(roleId);

        if (!role) {
            return false;
        }

        return role.permissions.includes(permission);
    }
}

export default new RolePermissionService();
