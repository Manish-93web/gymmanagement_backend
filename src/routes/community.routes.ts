import { Router } from 'express';
import communityController from '../controllers/community.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All community routes are protected
router.use(authenticate);

router.get('/feed', communityController.getFeed);
router.get('/groups', communityController.getGroups);
router.get('/messages/conversations', communityController.getConversations);

export default router;
