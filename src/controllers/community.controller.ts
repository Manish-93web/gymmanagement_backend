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
            const { type, groupId, authorId, page, limit } = req.query;

            const result = await socialFeedService.getFeed(
                user.tenantId,
                user.userId,
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
            const user = (req as any).user;
            const { type, category, branchId } = req.query;

            const groups = await communityGroupService.getAllGroups(user.tenantId, {
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
            const conversations = await memberMessagingService.getConversations(user.userId);

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
}

export default new CommunityController();
