import { Router } from 'express';
import publicController from '../controllers/public.controller';

const router = Router();

// All public routes — no authentication required
router.get('/gyms', publicController.getGyms.bind(publicController));
router.post('/leads', publicController.submitLead.bind(publicController));
router.get('/stats', publicController.getPublicStats.bind(publicController));
router.get('/pdf/:slug', publicController.getPublicPdf.bind(publicController));
router.get('/gym/:slug', publicController.getGymProfile.bind(publicController));

export default router;
