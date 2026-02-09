import mongoose, { Schema, Document } from 'mongoose';

export interface IBranch extends Document {
    tenantId: mongoose.Types.ObjectId;
    name: string;
    code: string;
    isActive: boolean;
    contactInfo: {
        email: string;
        phone: string;
        address: string;
        city: string;
        state: string;
        country: string;
        zipCode: string;
        latitude?: number;
        longitude?: number;
    };
    operatingHours: {
        day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
        isOpen: boolean;
        openTime: string;
        closeTime: string;
    }[];
    capacity: {
        maxMembers: number;
        maxConcurrentAttendance: number;
    };
    amenities: string[];
    managerId?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const BranchSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        name: { type: String, required: true },
        code: { type: String, required: true },
        isActive: { type: Boolean, default: true },
        contactInfo: {
            email: { type: String, required: true },
            phone: { type: String, required: true },
            address: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            country: { type: String, required: true },
            zipCode: { type: String, required: true },
            latitude: { type: Number },
            longitude: { type: Number },
        },
        operatingHours: [
            {
                day: {
                    type: String,
                    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
                    required: true,
                },
                isOpen: { type: Boolean, default: true },
                openTime: { type: String, default: '06:00' },
                closeTime: { type: String, default: '22:00' },
            },
        ],
        capacity: {
            maxMembers: { type: Number, default: 500 },
            maxConcurrentAttendance: { type: Number, default: 100 },
        },
        amenities: [{ type: String }],
        managerId: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

// Compound index for tenant and branch code uniqueness
BranchSchema.index({ tenantId: 1, code: 1 }, { unique: true });
BranchSchema.index({ tenantId: 1, isActive: 1 });

export default mongoose.model<IBranch>('Branch', BranchSchema);
