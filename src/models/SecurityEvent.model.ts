import mongoose, { Schema, Document } from 'mongoose';

export type SecurityEventType =
    | 'new_device'
    | 'concurrent_login'
    | 'impossible_travel'
    | 'high_frequency_checkin'
    | 'device_blocked'
    | 'manual_flag'
    | 'reverification_required'
    | 'reverification_completed';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ISecurityEvent extends Document {
    tenantId: string;
    memberId?: string;
    userId?: string;
    eventType: SecurityEventType;
    severity: SecuritySeverity;
    riskScore: number;
    details: object;
    deviceId?: string;
    ipAddress?: string;
    location?: {
        lat: number;
        lng: number;
        city?: string;
    };
    isResolved: boolean;
    resolvedAt?: Date;
    resolvedBy?: string;
    resolutionNote?: string;
    autoAction?: string;
    createdAt: Date;
    updatedAt: Date;
}

const SecurityEventSchema: Schema = new Schema(
    {
        tenantId: { type: String, required: true, index: true },
        memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
        userId: { type: Schema.Types.ObjectId, ref: 'User' },
        eventType: {
            type: String,
            enum: [
                'new_device',
                'concurrent_login',
                'impossible_travel',
                'high_frequency_checkin',
                'device_blocked',
                'manual_flag',
                'reverification_required',
                'reverification_completed',
            ],
            required: true,
        },
        severity: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            required: true,
        },
        riskScore: { type: Number, default: 0, min: 0, max: 100 },
        details: { type: Schema.Types.Mixed, default: {} },
        deviceId: { type: String },
        ipAddress: { type: String },
        location: {
            lat: { type: Number },
            lng: { type: Number },
            city: { type: String },
        },
        isResolved: { type: Boolean, default: false },
        resolvedAt: { type: Date },
        resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        resolutionNote: { type: String },
        autoAction: { type: String },
    },
    { timestamps: true }
);

// Indexes
SecurityEventSchema.index({ tenantId: 1, memberId: 1, createdAt: -1 });
SecurityEventSchema.index({ tenantId: 1, severity: 1 });
SecurityEventSchema.index({ tenantId: 1, isResolved: 1 });
SecurityEventSchema.index({ tenantId: 1, eventType: 1 });

export default mongoose.model<ISecurityEvent>('SecurityEvent', SecurityEventSchema);
