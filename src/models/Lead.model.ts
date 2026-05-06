import mongoose, { Schema, Document } from 'mongoose';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'converted' | 'lost';
export type LeadSource = 'website' | 'walk_in' | 'referral' | 'social_media' | 'advertisement' | 'event' | 'other';

export interface ILead extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    status: LeadStatus;
    source: LeadSource;
    sourceDetails?: string;
    interests: string[];
    budget?: number;
    preferredPlan?: mongoose.Types.ObjectId;
    assignedTo?: mongoose.Types.ObjectId;
    followUps: {
        date: Date;
        type: 'call' | 'email' | 'sms' | 'whatsapp' | 'meeting' | 'other';
        notes: string;
        outcome: 'answered' | 'no_answer' | 'voicemail' | 'scheduled' | 'not_interested';
        nextFollowUp?: Date;
        performedBy: mongoose.Types.ObjectId;
    }[];
    conversion?: {
        convertedAt: Date;
        convertedBy: mongoose.Types.ObjectId;
        memberId: mongoose.Types.ObjectId;
        planId: mongoose.Types.ObjectId;
        revenue: number;
    };
    lost?: {
        lostAt: Date;
        reason: string;
        competitor?: string;
    };
    tags: string[];
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}

const LeadSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        firstName: { type: String, required: true },
        lastName: { type: String },
        email: { type: String },
        mobile: { type: String, required: true },
        status: {
            type: String,
            enum: ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'converted', 'lost'],
            default: 'new',
            index: true,
        },
        source: {
            type: String,
            enum: ['website', 'walk_in', 'referral', 'social_media', 'advertisement', 'event', 'other'],
            required: true,
        },
        sourceDetails: { type: String },
        interests: [{ type: String }],
        budget: { type: Number },
        preferredPlan: { type: Schema.Types.ObjectId, ref: 'MembershipPlan' },
        assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
        followUps: [
            {
                date: { type: Date, required: true },
                type: {
                    type: String,
                    enum: ['call', 'email', 'sms', 'whatsapp', 'meeting', 'other'],
                    required: true,
                },
                notes: { type: String },
                outcome: {
                    type: String,
                    enum: ['answered', 'no_answer', 'voicemail', 'scheduled', 'not_interested'],
                },
                nextFollowUp: { type: Date },
                performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
            },
        ],
        conversion: {
            convertedAt: { type: Date },
            convertedBy: { type: Schema.Types.ObjectId, ref: 'User' },
            memberId: { type: Schema.Types.ObjectId, ref: 'Member' },
            planId: { type: Schema.Types.ObjectId, ref: 'MembershipPlan' },
            revenue: { type: Number },
        },
        lost: {
            lostAt: { type: Date },
            reason: { type: String },
            competitor: { type: String },
        },
        tags: [{ type: String }],
        notes: { type: String },
    },
    { timestamps: true }
);

// Indexes
LeadSchema.index({ tenantId: 1, status: 1 });
LeadSchema.index({ tenantId: 1, branchId: 1, status: 1 });
LeadSchema.index({ assignedTo: 1, status: 1 });
LeadSchema.index({ email: 1 });
LeadSchema.index({ mobile: 1 });

export default mongoose.model<ILead>('Lead', LeadSchema);
