import { Request, Response } from 'express';
import socialFeedService from '../services/social-feed.service';
import communityGroupService from '../services/community-group.service';
import memberMessagingService from '../services/member-messaging.service';

export class CommunityController {
    /**
     * Get social feed
     */
    async getFeed(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const tenantId = (req as any).tenantId;
            const { type, groupId, authorId, page, limit } = req.query;

            const result = await socialFeedService.getFeed(
                tenantId,
                user._id,
                {
                    type: type as string,
                    groupId: groupId as string,
                    authorId: authorId as string,
                },
                Number(page) || 1,
                Number(limit) || 20
            );

            res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Get groups
     */
    async getGroups(req: Request, res: Response) {
        try {
            const tenantId = (req as any).tenantId;
            const { type, category, branchId } = req.query;

            const groups = await communityGroupService.getAllGroups(tenantId, {
                type: type as string,
                category: category as string,
                branchId: branchId as string,
            });

            res.status(200).json({
                success: true,
                data: groups,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Get member conversations
     */
    async getConversations(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const conversations = await memberMessagingService.getConversations(user._id);

            res.status(200).json({
                success: true,
                data: conversations,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Create social post
     */
    async createPost(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { content, type, visibility, groupId } = req.body;

            const post = await socialFeedService.createPost({
                content,
                type: type || 'text',
                visibility: visibility || 'public',
                groupId,
                authorId: user._id,
                tenantId: (req as any).tenantId,
            });

            res.status(201).json({
                success: true,
                data: post,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Like/Unlike post
     */
    async likePost(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { postId } = req.params as Record<string, string>;

            const result = await socialFeedService.likePost(postId, user._id);

            res.status(200).json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Comment on post
     */
    async commentOnPost(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { postId } = req.params as Record<string, string>;
            const { content } = req.body;

            const comment = await socialFeedService.commentOnPost(postId, user._id, content);

            res.status(201).json({
                success: true,
                data: comment,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Get post comments
     */
    async getPostComments(req: Request, res: Response) {
        try {
            const { postId } = req.params as Record<string, string>;
            const { page, limit } = req.query;

            const result = await socialFeedService.getPostComments(
                postId,
                Number(page) || 1,
                Number(limit) || 20
            );

            res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Delete post
     */
    async deletePost(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { postId } = req.params as Record<string, string>;

            await socialFeedService.deletePost(postId, user._id);

            res.status(200).json({
                success: true,
                message: 'Post deleted successfully',
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Send message
     */
    async sendMessage(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { recipientId, content, conversationId: existingConvId } = req.body;

            let conversationId = existingConvId;

            if (!conversationId && recipientId) {
                const conversation = await memberMessagingService.createConversation(user._id, recipientId);
                conversationId = conversation._id;
            }

            if (!conversationId) {
                throw new Error('Conversation ID or Recipient ID is required');
            }

            const message = await memberMessagingService.sendMessage({
                conversationId,
                senderId: user._id,
                content,
                type: 'text',
            });

            res.status(201).json({
                success: true,
                data: message,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Get messages in conversation
     */
    async getMessages(req: Request, res: Response) {
        try {
            const { conversationId } = req.params as Record<string, string>;
            const { page, limit } = req.query;

            const result = await memberMessagingService.getMessages(
                conversationId,
                Number(page) || 1,
                Number(limit) || 50
            );

            res.status(200).json({
                success: true,
                data: result,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Join group
     */
    async joinGroup(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { groupId } = req.params as Record<string, string>;

            const result = await communityGroupService.joinGroup(groupId, user._id);

            res.status(200).json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }

    /**
     * Leave group
     */
    async leaveGroup(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            const { groupId } = req.params as Record<string, string>;

            const result = await communityGroupService.leaveGroup(groupId, user._id);

            res.status(200).json(result);
        } catch (error: any) {
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }
}

export default new CommunityController();

