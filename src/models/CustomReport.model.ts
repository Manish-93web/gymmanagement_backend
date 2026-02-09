import mongoose, { Schema, Document } from 'mongoose';

export interface ICustomReport extends Document {
    name: string;
    description?: string;
    dataSource: 'members' | 'payments' | 'attendance' | 'classes' | 'users';
    filters: {
        field: string;
        operator: string;
        value: any;
    }[];
    columns: {
        field: string;
        label: string;
        type: string;
        format?: string;
    }[];
    groupBy?: string[];
    aggregations?: {
        field: string;
        function: string;
        label: string;
    }[];
    sortBy?: {
        field: string;
        order: 'asc' | 'desc';
    }[];
    tenantId: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CustomReportSchema = new Schema<ICustomReport>(
    {
        name: { type: String, required: true },
        description: { type: String },
        dataSource: {
            type: String,
            required: true,
            enum: ['members', 'payments', 'attendance', 'classes', 'users'],
        },
        filters: [
            {
                field: { type: String, required: true },
                operator: { type: String, required: true },
                value: { type: Schema.Types.Mixed },
            },
        ],
        columns: [
            {
                field: { type: String, required: true },
                label: { type: String, required: true },
                type: { type: String, required: true },
                format: { type: String },
            },
        ],
        groupBy: [String],
        aggregations: [
            {
                field: { type: String, required: true },
                function: { type: String, required: true },
                label: { type: String, required: true },
            },
        ],
        sortBy: [
            {
                field: { type: String, required: true },
                order: { type: String, enum: ['asc', 'desc'], default: 'asc' },
            },
        ],
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    },
    { timestamps: true }
);

export default mongoose.model<ICustomReport>('CustomReport', CustomReportSchema);
