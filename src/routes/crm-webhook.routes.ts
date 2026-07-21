import { Router, Request, Response } from 'express';
import { handleWhatsApp, handleSMS, handleFacebookLeads } from '../controllers/crm-webhook.controller';
import Lead from '../models/Lead.model';
import logger from '../config/logger';

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

// ─── Meta Lead Ads — full entry[0].changes[0].value.leads flow ───────────────

router.get('/facebook', (req: Request, res: Response) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN || process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN || 'gym_fb_webhook_2024';
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.status(403).json({ error: 'Verification failed' });
    }
});

router.post('/facebook', async (req: Request, res: Response) => {
    try {
        const entry = req.body?.entry?.[0];
        const change = entry?.changes?.[0];
        const value = change?.value;

        const tenantId = (req as any).tenantId || req.query.tenantId;

        const leadsData: any[] = value?.leads || [];
        if (!leadsData.length && !value?.field_data) {
            res.sendStatus(200);
            return;
        }

        const adName: string = value?.ad_name || value?.campaign_name || '';
        const platformRaw: string = (value?.platform || entry?.id || '').toLowerCase();
        const source: 'social_media' = 'social_media';
        const sourceDetails = platformRaw.includes('instagram') ? 'instagram' : 'facebook';

        const processFields = (fieldData: any[]): Record<string, string> => {
            const fields: Record<string, string> = {};
            if (Array.isArray(fieldData)) {
                for (const f of fieldData) {
                    if (f.name && Array.isArray(f.values)) fields[f.name] = f.values[0] || '';
                }
            }
            return fields;
        };

        const records = leadsData.length ? leadsData : [{ field_data: value?.field_data }];
        for (const leadEntry of records) {
            const fields = processFields(leadEntry.field_data || []);
            const fullName: string = fields['full_name'] || `${fields['first_name'] || ''} ${fields['last_name'] || ''}`.trim();
            const firstName = fullName.split(' ')[0] || 'Lead';
            const lastName  = fullName.split(' ').slice(1).join(' ') || '';
            const email     = fields['email'] || '';
            const mobile    = fields['phone_number'] || fields['mobile'] || '0000000000';

            if (tenantId) {
                await Lead.create({
                    tenantId,
                    firstName,
                    lastName,
                    email,
                    mobile,
                    source,
                    sourceDetails: `${sourceDetails}${adName ? ' | ' + adName : ''}`,
                    status: 'new',
                    notes: `Meta Lead Ad (${sourceDetails}). Raw: ${JSON.stringify(fields)}`,
                }).catch((e: any) => logger.error('[CRM/facebook webhook] lead create error', e.message));
            } else {
                logger.warn('[CRM/facebook webhook] no tenantId — lead not saved');
            }
        }

        res.sendStatus(200);
    } catch (err: any) {
        logger.error('[CRM/facebook webhook]', err.message);
        res.sendStatus(200);
    }
});

export default router;
