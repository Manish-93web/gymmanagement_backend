import mongoose, { Schema, Document } from 'mongoose';

export type AuditAction =
    | 'create'
    | 'update'
    | 'delete'
    | 'login'
    | 'logout'
    | 'payment'
    | 'refund'
    | 'export'
    | 'import'
    | 'config_change'
    | 'other';

export interface IAuditLog extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    action: AuditAction;
    resource: string;
    resourceId?: mongoose.Types.ObjectId;
    changes?: {
        field: string;
        oldValue: any;
        newValue: any;
    }[];
    metadata: {
        ipAddress: string;
        userAgent: string;
        method: string;
        endpoint: string;
        statusCode: number;
        duration?: number;
    };
    severity: 'info' | 'warning' | 'error' | 'critical';
    description: string;
    createdAt: Date;
}

const AuditLogSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        action: {
            type: String,
            enum: [
                'create',
                'update',
                'delete',
                'login',
                'logout',
                'payment',
                'refund',
                'export',
                'import',
                'config_change',
                'other',
            ],
            required: true,
            index: true,
        },
        resource: { type: String, required: true, index: true },
        resourceId: { type: Schema.Types.ObjectId },
        changes: [
            {
                field: { type: String, required: true },
                oldValue: { type: Schema.Types.Mixed },
                newValue: { type: Schema.Types.Mixed },
            },
        ],
        metadata: {
            ipAddress: { type: String, required: true },
            userAgent: { type: String },
            method: { type: String, required: true },
            endpoint: { type: String, required: true },
            statusCode: { type: Number, required: true },
            duration: { type: Number },
        },
        severity: {
            type: String,
            enum: ['info', 'warning', 'error', 'critical'],
            default: 'info',
            index: true,
        },
        description: { type: String, required: true },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

// Indexes
AuditLogSchema.index({ tenantId: 1, createdAt: -1 });
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ severity: 1, createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
