import { Router, Request, Response } from 'express';
import { handleWhatsApp, handleSMS, handleFacebookLeads } from '../controllers/crm-webhook.controller';

const router = Router();

// Twilio sends webhook with x-twilio-signature — no auth middleware (public endpoint)
router.post('/whatsapp', handleWhatsApp);
router.post('/sms', handleSMS);

// Facebook Lead Ads webhook — GET is the verification challenge, POST receives leads
router.get('/facebook-leads', (req: Request, res: Response) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'gym_fb_webhook_2024';
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.status(403).json({ error: 'Verification failed' });
    }
});
router.post('/facebook-leads', handleFacebookLeads);

export default router;
