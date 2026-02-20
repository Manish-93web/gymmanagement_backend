import express from 'express';
import brandingController from '../controllers/branding.controller';

const router = express.Router();

router.get('/manifest/:tenantSlug', brandingController.getManifest.bind(brandingController));

export default router;
