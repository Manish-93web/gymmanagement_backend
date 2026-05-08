import { Request, Response } from 'express';
import Lead from '../models/Lead.model';
import logger from '../config/logger';

// POST /api/crm-webhook/whatsapp — Twilio inbound WhatsApp message
export const handleWhatsApp = async (req: Request, res: Response): Promise<void> => {
    try {
        const { From, Body, AccountSid } = req.body;
        const tenantId = (req as any).tenantId || req.query.tenantId;

        if (!tenantId) {
            res.status(400).json({ success: false, message: 'tenantId required' });
            return;
        }

        // Find existing lead by mobile
        const mobile = From?.replace('whatsapp:', '').replace(/\s/g, '') || '';
        const lead = await Lead.findOne({ tenantId, mobile }).lean();

        if (lead) {
            await Lead.findByIdAndUpdate(lead._id, {
                $push: {
                    followUps: {
                        date: new Date(),
                        type: 'whatsapp',
                        notes: `Inbound WhatsApp from ${From}: ${Body}`,
                        outcome: 'callback',
                        performedBy: 'system',
                    },
                },
                $set: { lastContactDate: new Date() },
            });
        } else {
            logger.info(`[CRMWebhook] WhatsApp from unknown number ${From} (AccountSid: ${AccountSid})`);
        }

        // Twilio expects TwiML 200 response
        res.status(200).send('<Response></Response>');
    } catch (err: any) {
        logger.error('[CRMWebhook] WhatsApp error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/crm-webhook/sms — Twilio inbound SMS
export const handleSMS = async (req: Request, res: Response): Promise<void> => {
    try {
        const { From, Body } = req.body;
        const tenantId = (req as any).tenantId || req.query.tenantId;

        if (!tenantId) {
            res.status(400).json({ success: false, message: 'tenantId required' });
            return;
        }

        const mobile = From?.replace(/\s/g, '') || '';
        const lead = await Lead.findOne({ tenantId, mobile }).lean();

        if (lead) {
            await Lead.findByIdAndUpdate(lead._id, {
                $push: {
                    followUps: {
                        date: new Date(),
                        type: 'sms',
                        notes: `Inbound SMS from ${From}: ${Body}`,
                        outcome: 'callback',
                        performedBy: 'system',
                    },
                },
                $set: { lastContactDate: new Date() },
            });
        } else {
            logger.info(`[CRMWebhook] SMS from unknown number ${From}`);
        }

        res.status(200).send('<Response></Response>');
    } catch (err: any) {
        logger.error('[CRMWebhook] SMS error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/crm-webhook/facebook-leads — Meta Lead Ads webhook
export const handleFacebookLeads = async (req: Request, res: Response): Promise<void> => {
    try {
        const { field_data, tenantId: bodyTenantId, branchId } = req.body;
        const tenantId = bodyTenantId || (req as any).tenantId || req.query.tenantId;

        if (!tenantId) {
            res.status(400).json({ success: false, message: 'tenantId required' });
            return;
        }

        // Extract fields from Meta Lead Ads payload
        const fields: Record<string, string> = {};
        if (Array.isArray(field_data)) {
            for (const field of field_data) {
                if (field.name && Array.isArray(field.values)) {
                    fields[field.name] = field.values[0] || '';
                }
            }
        }

        const firstName = fields['first_name'] || fields['full_name']?.split(' ')[0] || 'Lead';
        const lastName  = fields['last_name']  || fields['full_name']?.split(' ').slice(1).join(' ') || '';
        const email     = fields['email'] || '';
        const mobile    = fields['phone_number'] || fields['mobile'] || '0000000000';

        await (Lead as any).create({
            tenantId,
            branchId: branchId || null,
            firstName,
            lastName,
            email,
            mobile,
            source: 'social_media',
            status: 'new',
            notes: `Facebook Lead Ad. Raw fields: ${JSON.stringify(fields)}`,
            statusHistory: [{
                status: 'new',
                changedAt: new Date(),
                changedBy: 'system',
            }],
        });

        res.status(200).json({ success: true, message: 'Lead created from Facebook' });
    } catch (err: any) {
        logger.error('[CRMWebhook] Facebook leads error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};
