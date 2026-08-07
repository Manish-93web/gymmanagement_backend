import mongoose, { Schema, Document } from 'mongoose';

export interface IInquiryFollowUp {
    _id?: mongoose.Types.ObjectId;
    date: string;
    time?: string;
    type: string;
    notes?: string;
    outcome?: string;
    completed: boolean;
    createdAt?: Date;
}

export interface IInquiryNote {
    _id?: mongoose.Types.ObjectId;
    note: string;
    staffName?: string;
    createdAt?: Date;
}

export interface IInquiry extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    name: string;
    phone: string;
    email?: string;
    source?: string;
    interestedPlan?: string;
    budget?: string;
    goals?: string;
    assignTo?: string;
    notes?: string;
    status: 'new' | 'contacted' | 'converted' | 'not_interested';
    followUps: IInquiryFollowUp[];
    noteEntries: IInquiryNote[];
    createdAt: Date;
    updatedAt: Date;
}

const InquirySchema = new Schema<IInquiry>(
    {
        tenantId:       { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId:       { type: Schema.Types.ObjectId, ref: 'Branch' },
        name:           { type: String, required: true, trim: true },
        phone:          { type: String, required: true, trim: true },
        email:          { type: String, trim: true },
        source:         { type: String, trim: true },
        interestedPlan: { type: String, trim: true },
        budget:         { type: String, trim: true },
        goals:          { type: String, trim: true },
        assignTo:       { type: String, trim: true },
        notes:          { type: String },
        status:         { type: String, enum: ['new', 'contacted', 'converted', 'not_interested'], default: 'new' },
        followUps: [
            {
                date:      { type: String, required: true },
                time:      { type: String },
                type:      { type: String, required: true },
                notes:     { type: String },
                outcome:   { type: String },
                completed: { type: Boolean, default: false },
                createdAt: { type: Date, default: Date.now },
            },
        ],
        noteEntries: [
            {
                note:      { type: String, required: true },
                staffName: { type: String },
                createdAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

InquirySchema.index({ tenantId: 1, createdAt: -1 });
InquirySchema.index({ tenantId: 1, status: 1 });

export default (mongoose.models.Inquiry as mongoose.Model<IInquiry>) ||
    mongoose.model<IInquiry>('Inquiry', InquirySchema);
