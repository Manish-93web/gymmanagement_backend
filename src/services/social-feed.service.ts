import Post from '../models/Post.model';
import PostLike from '../models/PostLike.model';
import PostComment from '../models/PostComment.model';
import Member from '../models/Member.model';
import logger from '../config/logger';

interface PostConfig {
    content: string;
    type: 'text' | 'image' | 'video' | 'transformation' | 'achievement' | 'announcement';
    media?: string[];
    transformationData?: {
        beforeImage: string;
        afterImage: string;
        startDate: Date;
        endDate: Date;
        weightLost?: number;
        description: string;
    };
    visibility: 'public' | 'members' | 'group';
    groupId?: string;
    authorId: string;
    tenantId: string;
}

class SocialFeedService {
    /**
     * Create post
     */
    async createPost(config: PostConfig) {
        const post = await Post.create({
            ...config,
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
            createdAt: new Date(),
        });

        logger.info('Post created', { postId: post._id, type: config.type });

        return post;
    }

    /**
     * Get feed
     */
    async getFeed(
        tenantId: string,
        memberId?: string,
        filters?: {
            type?: string;
            groupId?: string;
            authorId?: string;
        },
        page: number = 1,
        limit: number = 20
    ) {
        const query: any = { tenantId };

        if (filters?.type) query.type = filters.type;
        if (filters?.groupId) query.groupId = filters.groupId;
        if (filters?.authorId) query.authorId = filters.authorId;

        // Visibility filter
        if (memberId) {
            query.visibility = { $in: ['public', 'members'] };
        } else {
            query.visibility = 'public';
        }

        const total = await Post.countDocuments(query);
        const posts = await Post.find(query)
            .populate('authorId', 'firstName lastName profilePicture')
            .populate('groupId', 'name')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        // Get like status for each post if memberId provided
        if (memberId) {
            const postsWithLikeStatus = await Promise.all(
                posts.map(async (post: any) => {
                    const liked = await PostLike.exists({ postId: post._id, memberId });
                    return {
                        ...post.toObject(),
                        likedByMe: !!liked,
                    };
                })
            );

            return {
                posts: postsWithLikeStatus,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit),
                },
            };
        }

        return {
            posts,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Like post
     */
    async likePost(postId: string, memberId: string) {
        const post = await Post.findById(postId);
        if (!post) throw new Error('Post not found');

        // Check if already liked
        const existing = await PostLike.findOne({ postId, memberId });
        if (existing) {
            // Unlike
            await PostLike.findByIdAndDelete(existing._id);
            await Post.findByIdAndUpdate(postId, {
                $inc: { likeCount: -1 },
            });

            return {
                success: true,
                action: 'unliked',
                likeCount: post.likeCount - 1,
            };
        }

        // Like
        await PostLike.create({
            postId,
            memberId,
            createdAt: new Date(),
        });

        await Post.findByIdAndUpdate(postId, {
            $inc: { likeCount: 1 },
        });

        logger.info('Post liked', { postId, memberId });

        return {
            success: true,
            action: 'liked',
            likeCount: post.likeCount + 1,
        };
    }

    /**
     * Comment on post
     */
    async commentOnPost(postId: string, memberId: string, content: string) {
        const post = await Post.findById(postId);
        if (!post) throw new Error('Post not found');

        const comment = await PostComment.create({
            postId,
            memberId,
            content,
            likeCount: 0,
            createdAt: new Date(),
        });

        // Update comment count
        await Post.findByIdAndUpdate(postId, {
            $inc: { commentCount: 1 },
        });

        logger.info('Comment added', { postId, memberId, commentId: comment._id });

        return comment;
    }

    /**
     * Get post comments
     */
    async getPostComments(postId: string, page: number = 1, limit: number = 20) {
        const total = await PostComment.countDocuments({ postId });
        const comments = await PostComment.find({ postId })
            .populate('memberId', 'firstName lastName profilePicture')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return {
            comments,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Delete post
     */
    async deletePost(postId: string, memberId: string) {
        const post = await Post.findById(postId);
        if (!post) throw new Error('Post not found');

        if (post.authorId.toString() !== memberId) {
            throw new Error('Only the author can delete this post');
        }

        await Post.findByIdAndDelete(postId);
        await PostLike.deleteMany({ postId });
        await PostComment.deleteMany({ postId });

        logger.info('Post deleted', { postId, memberId });

        return {
            success: true,
            message: 'Post deleted successfully',
        };
    }

    /**
     * Get transformation posts
     */
    async getTransformationPosts(tenantId: string, page: number = 1, limit: number = 10) {
        const query = {
            tenantId,
            type: 'transformation',
            visibility: { $in: ['public', 'members'] },
        };

        const total = await Post.countDocuments(query as any);
        const posts = await Post.find(query as any)
            .populate('authorId', 'firstName lastName profilePicture')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        return {
            posts,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
        };
    }

    /**
     * Get trending posts
     */
    async getTrendingPosts(tenantId: string, limit: number = 10) {
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);

        const posts = await Post.find({
            tenantId,
            createdAt: { $gte: oneDayAgo },
            visibility: { $in: ['public', 'members'] },
        })
            .populate('authorId', 'firstName lastName profilePicture')
            .sort({ likeCount: -1, commentCount: -1 })
            .limit(limit);

        return posts;
    }

    /**
     * Get social engagement statistics
     */
    async getSocialStats(tenantId: string) {
        const totalPosts = await Post.countDocuments({ tenantId });
        const totalLikes = await PostLike.countDocuments();
        const totalComments = await PostComment.countDocuments();

        const postsByType = await Post.aggregate([
            { $match: { tenantId } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
        ]);

        const topContributors = await Post.aggregate([
            { $match: { tenantId } },
            {
                $group: {
                    _id: '$authorId',
                    postCount: { $sum: 1 },
                    totalLikes: { $sum: '$likeCount' },
                },
            },
            { $sort: { postCount: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'members',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'member',
                },
            },
        ]);

        return {
            totalPosts,
            totalLikes,
            totalComments,
            postsByType,
            topContributors,
            engagementRate: totalPosts > 0 ? ((totalLikes + totalComments) / totalPosts).toFixed(2) : 0,
        };
    }
}

export default new SocialFeedService();
