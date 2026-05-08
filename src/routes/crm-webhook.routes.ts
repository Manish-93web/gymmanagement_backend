import { Router } from 'express';
import { handleWhatsApp, handleSMS, handleFacebookLeads } from '../controllers/crm-webhook.controller';

const router = Router();

// Twilio sends webhook with x-twilio-signature — no auth middleware (public endpoint)
router.post('/whatsapp', handleWhatsApp);
router.post('/sms', handleSMS);
router.post('/facebook-leads', handleFacebookLeads);

export default router;
