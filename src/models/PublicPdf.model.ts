import mongoose, { Schema, Document } from 'mongoose';

export interface IPublicPdf extends Document {
    slug: string;
    type: 'receipt' | 'invoice';
    tenantId: mongoose.Types.ObjectId;
    memberId: mongoose.Types.ObjectId;
    memberName: string;
    phone?: string;
    membershipPlan?: string;
    amount?: number;
    subtotal?: number;
    gstAmount?: number;
    gstRate?: number;
    discountAmount?: number;
    discountType?: string;
    paymentMethod?: string;
    joiningDate?: Date;
    expiryDate?: Date;
    invoiceNumber?: string;
    paidDate?: Date;
    dueAmount?: number;
    dueDate?: Date;
    gymName?: string;
    gymAddress?: string;
    gymPhone?: string;
    viewCount: number;
    downloadCount: number;
    lastOpenedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PublicPdfSchema = new Schema<IPublicPdf>(
    {
        slug:           { type: String, required: true, unique: true, index: true },
        type:           { type: String, enum: ['receipt', 'invoice'], required: true },
        tenantId:       { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        memberId:       { type: Schema.Types.ObjectId, ref: 'Member', required: true },
        memberName:     { type: String, required: true },
        phone:          { type: String },
        membershipPlan: { type: String },
        amount:         { type: Number },
        subtotal:       { type: Number },
        gstAmount:      { type: Number },
        gstRate:        { type: Number },
        discountAmount: { type: Number },
        discountType:   { type: String },
        paymentMethod:  { type: String },
        joiningDate:    { type: Date },
        expiryDate:     { type: Date },
        invoiceNumber:  { type: String },
        paidDate:       { type: Date },
        dueAmount:      { type: Number },
        dueDate:        { type: Date },
        gymName:        { type: String },
        gymAddress:     { type: String },
        gymPhone:       { type: String },
        viewCount:      { type: Number, default: 0 },
        downloadCount:  { type: Number, default: 0 },
        lastOpenedAt:   { type: Date },
    },
    { timestamps: true }
);

PublicPdfSchema.index({ tenantId: 1, type: 1 });
PublicPdfSchema.index({ slug: 1, type: 1 });

export default (mongoose.models.PublicPdf as mongoose.Model<IPublicPdf>) ||
    mongoose.model<IPublicPdf>('PublicPdf', PublicPdfSchema);
