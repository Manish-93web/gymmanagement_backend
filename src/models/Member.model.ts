import mongoose, { Schema, Document } from 'mongoose';

export type MemberStatus =
    | 'lead'
    | 'trial'
    | 'active'
    | 'paused'
    | 'expired'
    | 'archived';

export interface IMember extends Document {
    tenantId: mongoose.Types.ObjectId;
    branchId: mongoose.Types.ObjectId;
    userId: mongoose.Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    membershipNumber: string;
    status: MemberStatus;
    statusHistory: {
        status: MemberStatus;
        changedAt: Date;
        changedBy: mongoose.Types.ObjectId;
        reason?: string;
    }[];
    personalInfo: {
        dateOfBirth: Date;
        gender: 'male' | 'female' | 'other';
        bloodGroup?: string;
        emergencyContact?: {
            name?: string;
            relationship?: string;
            phone?: string;
        };
    };
    healthInfo: {
        medicalConditions: string[];
        allergies: string[];
        medications: string[];
        injuries: string[];
        doctorClearance: boolean;
        doctorClearanceDate?: Date;
        notes?: string;
    };
    measurements: {
        date: Date;
        weight: number;
        height: number;
        bodyFat?: number;
        muscleMass?: number;
        bmi?: number;
        chest?: number;
        waist?: number;
        hips?: number;
        biceps?: number;
        thighs?: number;
        notes?: string;
        recordedBy: mongoose.Types.ObjectId;
    }[];
    transformationGallery: {
        date: Date;
        images: string[];
        weight: number;
        description?: string;
    }[];
    documents: {
        type: 'id_proof' | 'medical_certificate' | 'photo' | 'other';
        name: string;
        url: string;
        uploadedAt: Date;
    }[];
    goals: string[];
    preferences: {
        preferredTrainer?: mongoose.Types.ObjectId;
        preferredClassTime?: string;
        notifications: {
            email: boolean;
            sms: boolean;
            whatsapp: boolean;
            push: boolean;
        };
    };
    referredBy?: mongoose.Types.ObjectId;
    referralCode: string;
    tags: string[];
    notes: string;
    gamification?: {
        currentStreak: number;
        longestStreak: number;
        workoutStreak: number;
        longestWorkoutStreak: number;
        lastStreakUpdate?: Date;
        totalPoints: number;
        pointsSpent: number;
        level: number;
        badges: string[];
    };
    lastCheckIn?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const MemberSchema: Schema = new Schema(
    {
        tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
        branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
        firstName: { type: String, required: true, trim: true },
        lastName: { type: String, required: true, trim: true },
        email: { type: String, required: true, lowercase: true, trim: true },
        mobile: { type: String, required: true, trim: true },
        membershipNumber: { type: String, required: true, unique: true },
        status: {
            type: String,
            enum: ['lead', 'trial', 'active', 'paused', 'expired', 'archived'],
            default: 'lead',
            index: true,
        },
        statusHistory: [
            {
                status: {
                    type: String,
                    enum: ['lead', 'trial', 'active', 'paused', 'expired', 'archived'],
                    required: true,
                },
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
                reason: { type: String },
            },
        ],
        personalInfo: {
            dateOfBirth: { type: Date, required: true },
            gender: { type: String, enum: ['male', 'female', 'other'], required: true },
            bloodGroup: { type: String },
            emergencyContact: {
                name: { type: String },
                relationship: { type: String },
                phone: { type: String },
            },
        },
        healthInfo: {
            medicalConditions: [{ type: String }],
            allergies: [{ type: String }],
            medications: [{ type: String }],
            injuries: [{ type: String }],
            doctorClearance: { type: Boolean, default: false },
            doctorClearanceDate: { type: Date },
            notes: { type: String },
        },
        measurements: [
            {
                date: { type: Date, default: Date.now },
                weight: { type: Number, required: true },
                height: { type: Number, required: true },
                bodyFat: { type: Number },
                muscleMass: { type: Number },
                bmi: { type: Number },
                chest: { type: Number },
                waist: { type: Number },
                hips: { type: Number },
                biceps: { type: Number },
                thighs: { type: Number },
                notes: { type: String },
                recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
            },
        ],
        transformationGallery: [
            {
                date: { type: Date, default: Date.now },
                images: [{ type: String }],
                weight: { type: Number },
                description: { type: String },
            },
        ],
        documents: [
            {
                type: {
                    type: String,
                    enum: ['id_proof', 'medical_certificate', 'photo', 'other'],
                    required: true,
                },
                name: { type: String, required: true },
                url: { type: String, required: true },
                uploadedAt: { type: Date, default: Date.now },
            },
        ],
        goals: [{ type: String }],
        preferences: {
            preferredTrainer: { type: Schema.Types.ObjectId, ref: 'User' },
            preferredClassTime: { type: String },
            notifications: {
                email: { type: Boolean, default: true },
                sms: { type: Boolean, default: true },
                whatsapp: { type: Boolean, default: false },
                push: { type: Boolean, default: true },
            },
        },
        referredBy: { type: Schema.Types.ObjectId, ref: 'Member' },
        referralCode: { type: String, unique: true, required: true },
        tags: [{ type: String }],
        notes: { type: String },
        gamification: {
            currentStreak: { type: Number, default: 0 },
            longestStreak: { type: Number, default: 0 },
            workoutStreak: { type: Number, default: 0 },
            longestWorkoutStreak: { type: Number, default: 0 },
            lastStreakUpdate: { type: Date },
            totalPoints: { type: Number, default: 0 },
            pointsSpent: { type: Number, default: 0 },
            level: { type: Number, default: 1 },
            badges: [{ type: String }],
        },
        lastCheckIn: { type: Date },
    },
    { timestamps: true }
);

// Indexes
MemberSchema.index({ tenantId: 1, status: 1 });
MemberSchema.index({ tenantId: 1, branchId: 1, status: 1 });

export default mongoose.model<IMember>('Member', MemberSchema);
