import { Router } from 'express';
import announcementController from '../controllers/announcement.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';

const router = Router();
router.use(authenticate);

router.get('/', announcementController.getAnnouncements.bind(announcementController));
router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), announcementController.createAnnouncement.bind(announcementController));
router.get('/:id', announcementController.getAnnouncementById.bind(announcementController));
router.put('/:id', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), announcementController.updateAnnouncement.bind(announcementController));
router.delete('/:id', requireAnyRole('gym_owner', 'super_admin'), announcementController.deleteAnnouncement.bind(announcementController));

export default router;
