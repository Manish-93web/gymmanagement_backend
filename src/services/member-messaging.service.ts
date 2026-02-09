import Conversation from '../models/Conversation.model';
import Message from '../models/Message.model';
import Member from '../models/Member.model';
import logger from '../config/logger';

interface MessageData {
    conversationId: string;
    senderId: string;
    content: string;
    type: 'text' | 'image' | 'video' | 'file';
    mediaUrl?: string;
}

class MemberMessagingService {
    /**
     * Create or get conversation
     */
    async createConversation(member1Id: string, member2Id: string) {
        // Check if conversation already exists
        const existing = await Conversation.findOne({
            participants: { $all: [member1Id, member2Id] },
            type: 'direct',
        });

        if (existing) {
            return existing;
        }

        // Create new conversation
        const conversation = await Conversation.create({
            participants: [member1Id, member2Id],
            type: 'direct',
            lastMessageAt: new Date(),
            createdAt: new Date(),
        });

        logger.info('Conversation created', { conversationId: conversation._id });

        return conversation;
    }

    /**
     * Send message
     */
    async sendMessage(data: MessageData) {
        const message = await Message.create({
            ...data,
            status: 'sent',
            createdAt: new Date(),
        });

        // Update conversation
        await Conversation.findByIdAndUpdate(data.conversationId, {
            lastMessageAt: new Date(),
            lastMessage: data.content.substring(0, 100),
        });

        logger.info('Message sent', { messageId: message._id, conversationId: data.conversationId });

        return message;
    }

    /**
     * Get conversations for member
     */
    async getConversations(memberId: string) {
        const conversations = await Conversation.find({
            participants: memberId,
        })
            .populate('participants', 'firstName lastName profilePicture')
            .sort({ lastMessageAt: -1 });

        return conversations;
    }

    /**
     * Get messages in conversation
     */
    async getMessages(conversationId: string, page: number = 1, limit: number = 50) {
        const total = await Message.countDocuments({ conversationId });
        const messages = await Message.find({ conversationId })
            .populate('senderId', 'firstName lastName profilePicture')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return {
            messages: messages.reverse(), // Reverse to show oldest first
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Mark messages as read
     */
    async markAsRead(conversationId: string, memberId: string) {
        await Message.updateMany(
            {
                conversationId,
                senderId: { $ne: memberId },
                status: { $ne: 'read' },
            },
            {
                status: 'read',
                readAt: new Date(),
            }
        );

        return {
            success: true,
            message: 'Messages marked as read',
        };
    }

    /**
     * Get unread count
     */
    async getUnreadCount(memberId: string) {
        const conversations = await Conversation.find({
            participants: memberId,
        });

        let unreadCount = 0;

        for (const conversation of conversations) {
            const count = await Message.countDocuments({
                conversationId: conversation._id,
                senderId: { $ne: memberId },
                status: { $ne: 'read' },
            });
            unreadCount += count;
        }

        return {
            unreadCount,
        };
    }

    /**
     * Delete conversation
     */
    async deleteConversation(conversationId: string, memberId: string) {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) throw new Error('Conversation not found');

        if (!conversation.participants.includes(memberId as any)) {
            throw new Error('Not authorized to delete this conversation');
        }

        await Conversation.findByIdAndDelete(conversationId);
        await Message.deleteMany({ conversationId });

        logger.info('Conversation deleted', { conversationId, memberId });

        return {
            success: true,
            message: 'Conversation deleted successfully',
        };
    }
}

export default new MemberMessagingService();
