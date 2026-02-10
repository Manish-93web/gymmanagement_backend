import { Router } from 'express';
import communityController from '../controllers/community.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All community routes are protected
router.use(authenticate);

router.get('/feed', communityController.getFeed);
router.post('/posts', communityController.createPost);
router.post('/posts/:postId/like', communityController.likePost);
router.post('/posts/:postId/comments', communityController.commentOnPost);
router.get('/posts/:postId/comments', communityController.getPostComments);
router.delete('/posts/:postId', communityController.deletePost);

router.get('/groups', communityController.getGroups);
router.post('/groups/:groupId/join', communityController.joinGroup);
router.post('/groups/:groupId/leave', communityController.leaveGroup);

router.get('/messages/conversations', communityController.getConversations);
router.get('/messages/:conversationId', communityController.getMessages);
router.post('/messages', communityController.sendMessage);

export default router;
