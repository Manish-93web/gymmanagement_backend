import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole =
    | 'super_admin'
    | 'gym_owner'
    | 'branch_manager'
    | 'trainer'
    | 'staff'
    | 'member'
    | 'accountant'
    | 'auditor';

export interface IUser extends Document {
    tenantId?: mongoose.Types.ObjectId;
    branchId?: mongoose.Types.ObjectId;
    role: UserRole;
    email: string;
    mobile: string;
    password: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    isActive: boolean;
    isEmailVerified: boolean;
    isMobileVerified: boolean;
    permissions: string[];
    devices: {
        deviceId: string;
        deviceName: string;
        lastLogin: Date;
        ipAddress: string;
        userAgent: string;
    }[];
    securitySettings: {
        twoFactorEnabled: boolean;
        allowedIPs: string[];
        sessionTimeout: number;
    };
    lastLogin?: Date;
    lastPasswordChange?: Date;
    refreshTokens: string[];
    createdAt: Date;
    updatedAt: Date;
    comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', index: true },
        role: {
            type: String,
            enum: [
                'super_admin',
                'gym_owner',
                'branch_manager',
                'trainer',
                'staff',
                'member',
                'accountant',
                'auditor',
            ],
            required: true,
            index: true,
        },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        mobile: { type: String, required: true, unique: true, trim: true },
        password: { type: String, required: true, select: false },
        firstName: { type: String, required: true, trim: true },
        lastName: { type: String, required: true, trim: true },
        avatar: { type: String },
        isActive: { type: Boolean, default: true, index: true },
        isEmailVerified: { type: Boolean, default: false },
        isMobileVerified: { type: Boolean, default: false },
        permissions: [{ type: String }],
        devices: [
            {
                deviceId: { type: String, required: true },
                deviceName: { type: String },
                lastLogin: { type: Date, default: Date.now },
                ipAddress: { type: String },
                userAgent: { type: String },
            },
        ],
        securitySettings: {
            twoFactorEnabled: { type: Boolean, default: false },
            allowedIPs: [{ type: String }],
            sessionTimeout: { type: Number, default: 3600000 }, // 1 hour in ms
        },
        lastLogin: { type: Date },
        lastPasswordChange: { type: Date },
        refreshTokens: [{ type: String, select: false }],
    },
    { timestamps: true }
);

// Indexes
UserSchema.index({ tenantId: 1, role: 1 });
UserSchema.index({ tenantId: 1, branchId: 1 });

// Hash password before saving
UserSchema.pre('save', async function (this: IUser, next) {
    if (!this.isModified('password')) return next();

    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.lastPasswordChange = new Date();
    next();
});

// Compare password method
UserSchema.methods.comparePassword = async function (
    candidatePassword: string
): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
