import mongoose, { Schema, Document } from 'mongoose';

export interface IAnnouncement extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    title: string;
    content: string;
    targetRoles: string[];
    priority: 'low' | 'medium' | 'high' | 'critical';
    expiresAt?: Date;
    createdBy: mongoose.Types.ObjectId;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    // Added fields
    status: 'draft' | 'scheduled' | 'published' | 'archived';
    channels: ('app' | 'email' | 'sms' | 'whatsapp')[];
    publishedAt?: Date;
    recipientCount?: number;
    viewCount?: number;
    targetAudience: 'all' | 'active' | 'branch' | 'custom';
    customMemberIds?: mongoose.Types.ObjectId[];
    scheduledFor?: Date;
}

const AnnouncementSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        title: { type: String, required: true },
        content: { type: String, required: true },
        targetRoles: [{ type: String }],
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium',
        },
        expiresAt: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        isActive: { type: Boolean, default: true },

        // Added fields
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'published', 'archived'],
            default: 'draft'
        },
        channels: [{ type: String }],
        publishedAt: { type: Date },
        recipientCount: { type: Number, default: 0 },
        viewCount: { type: Number, default: 0 },
        targetAudience: {
            type: String,
            enum: ['all', 'active', 'branch', 'custom'],
            default: 'all'
        },
        customMemberIds: [{ type: Schema.Types.ObjectId, ref: 'Member' }],
        scheduledFor: { type: Date }
    },
    { timestamps: true }
);

// Indexes
AnnouncementSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.model<IAnnouncement>('Announcement', AnnouncementSchema);
