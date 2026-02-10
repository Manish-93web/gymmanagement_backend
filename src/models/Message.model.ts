import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
    conversationId: mongoose.Types.ObjectId;
    senderId: mongoose.Types.ObjectId;
    content: string;
    type: 'text' | 'image' | 'video' | 'file';
    mediaUrl?: string;
    status: 'sent' | 'delivered' | 'read';
    readAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const MessageSchema: Schema = new Schema({
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['text', 'image', 'video', 'file'], default: 'text' },
    mediaUrl: { type: String },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    readAt: { type: Date },
}, { timestamps: true });

export default mongoose.model<IMessage>('Message', MessageSchema);
