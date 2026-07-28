import mongoose, { Schema, Document } from 'mongoose';

export interface IOccasionGuide extends Document {
    name: string;
    category: 'festival' | 'social' | 'travel' | 'work';
    emoji: string;
    description: string;
    tips: string[];
    safeFoods: string[];
    avoidFoods: string[];
    moderation: string;
    createdAt: Date;
    updatedAt: Date;
}

const OccasionGuideSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        category: {
            type: String,
            enum: ['festival', 'social', 'travel', 'work'],
            required: true,
        },
        emoji: { type: String, required: true },
        description: { type: String, required: true },
        tips: [{ type: String }],
        safeFoods: [{ type: String }],
        avoidFoods: [{ type: String }],
        moderation: { type: String, default: '' },
    },
    { timestamps: true }
);

OccasionGuideSchema.index({ category: 1 });
OccasionGuideSchema.index({ name: 1 });

export default mongoose.model<IOccasionGuide>('OccasionGuide', OccasionGuideSchema);
