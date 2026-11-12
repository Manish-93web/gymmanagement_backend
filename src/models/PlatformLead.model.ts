import mongoose, { Schema, Document } from 'mongoose';

/**
 * A gym owner who asked GymBodyFlow to contact them from the public website.
 * Platform-level (no tenant): these are prospects, not members of an existing gym.
 */
export type PlatformLeadStatus = 'new' | 'contacted' | 'demo_scheduled' | 'won' | 'lost';

export interface IPlatformLead extends Document {
    gymName: string;
    ownerName: string;
    mobile: string;            // 10-digit Indian mobile, digits only
    status: PlatformLeadStatus;
    source: string;            // e.g. 'website'
    pageUrl?: string;
    referrer?: string;
    utm?: { source?: string; medium?: string; campaign?: string };
    submissionCount: number;   // same number submitting again bumps this instead of creating a duplicate
    lastSubmittedAt: Date;
    notes?: string;
    contactedAt?: Date;
    contactedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const PlatformLeadSchema = new Schema<IPlatformLead>(
    {
        gymName:   { type: String, required: true, trim: true, maxlength: 100 },
        ownerName: { type: String, required: true, trim: true, maxlength: 80 },
        mobile:    { type: String, required: true, trim: true, index: true },
        status:    { type: String, enum: ['new', 'contacted', 'demo_scheduled', 'won', 'lost'], default: 'new', index: true },
        source:    { type: String, default: 'website' },
        pageUrl:   { type: String, maxlength: 300 },
        referrer:  { type: String, maxlength: 300 },
        utm: {
            source:   { type: String, maxlength: 100 },
            medium:   { type: String, maxlength: 100 },
            campaign: { type: String, maxlength: 100 },
        },
        submissionCount: { type: Number, default: 1 },
        lastSubmittedAt: { type: Date, default: Date.now },
        notes:       { type: String, maxlength: 2000 },
        contactedAt: { type: Date },
        contactedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

PlatformLeadSchema.index({ status: 1, createdAt: -1 });

export default (mongoose.models.PlatformLead as mongoose.Model<IPlatformLead>) ||
    mongoose.model<IPlatformLead>('PlatformLead', PlatformLeadSchema);
