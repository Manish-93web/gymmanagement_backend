import mongoose, { Document, Schema } from 'mongoose';

export interface IExpense extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    category: 'Equipment' | 'Utilities' | 'Salary' | 'Maintenance' | 'Supplements' | 'Marketing' | 'Rent' | 'Other';
    description: string;
    amount: number;
    vendor?: string;
    date: Date;
    receiptUrl?: string;
    notes?: string;
    createdBy?: mongoose.Types.ObjectId;
}

const ExpenseSchema = new Schema<IExpense>(
    {
        tenantId:   { type: Schema.Types.ObjectId, ref: 'Tenant',  required: true, index: true },
        branchId:   { type: Schema.Types.ObjectId, ref: 'Branch' },
        category:   {
            type: String,
            enum: ['Equipment', 'Utilities', 'Salary', 'Maintenance', 'Supplements', 'Marketing', 'Rent', 'Other'],
            required: true,
        },
        description: { type: String, required: true, trim: true },
        amount:      { type: Number, required: true, min: 0 },
        vendor:      { type: String, trim: true },
        date:        { type: Date,   required: true },
        receiptUrl:  { type: String },
        notes:       { type: String, trim: true },
        createdBy:   { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true },
);

ExpenseSchema.index({ tenantId: 1, date: -1 });
ExpenseSchema.index({ tenantId: 1, category: 1, date: -1 });

export default mongoose.model<IExpense>('Expense', ExpenseSchema);
