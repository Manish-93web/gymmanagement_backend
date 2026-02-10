import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
    participants: mongoose.Types.ObjectId[];
    type: 'direct' | 'group';
    lastMessage?: string;
    lastMessageAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ConversationSchema: Schema = new Schema({
    participants: [{ type: Schema.Types.ObjectId, ref: 'Member', required: true }],
    type: { type: String, enum: ['direct', 'group'], default: 'direct' },
    lastMessage: { type: String },
    lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export default mongoose.model<IConversation>('Conversation', ConversationSchema);
