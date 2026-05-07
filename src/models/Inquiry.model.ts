import mongoose, { Schema, Document } from 'mongoose';

export interface IInquiry extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    name: string;
    phone: string;
    notes?: string;
    status: 'new' | 'contacted' | 'converted' | 'not_interested';
    createdAt: Date;
    updatedAt: Date;
}

const InquirySchema = new Schema<IInquiry>(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
        name:     { type: String, required: true, trim: true },
        phone:    { type: String, required: true, trim: true },
        notes:    { type: String },
        status:   { type: String, enum: ['new', 'contacted', 'converted', 'not_interested'], default: 'new' },
    },
    { timestamps: true }
);

InquirySchema.index({ tenantId: 1, createdAt: -1 });
InquirySchema.index({ tenantId: 1, status: 1 });

export default (mongoose.models.Inquiry as mongoose.Model<IInquiry>) ||
    mongoose.model<IInquiry>('Inquiry', InquirySchema);
