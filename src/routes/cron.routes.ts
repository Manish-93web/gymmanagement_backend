import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import cronController from '../controllers/cron.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import Member from '../models/Member.model';
import WhatsAppAutomationConfig from '../models/WhatsAppAutomationConfig.model';
import WhatsAppLog from '../models/WhatsAppLog.model';

const router = Router();

// Cron routes secured by super_admin only (or internal CRON_SECRET header)
const cronAuth = (req: any, res: any, next: any) => {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret && cronSecret === process.env.CRON_SECRET) return next();
    // Fallback: require super_admin JWT
    authenticate(req, res, () => {
        requireAnyRole('super_admin')(req, res, next);
    });
};

router.post('/process-renewals', cronAuth, cronController.processRenewals.bind(cronController));
router.post('/process-trials', cronAuth, cronController.processTrials.bind(cronController));

// POST /birthday-whatsapp — runs daily to send birthday WhatsApp messages
// Queries members whose date of birth month/day matches today, checks automation config,
// and sends (or logs) birthday WhatsApp messages for each enabled tenant.
router.post('/birthday-whatsapp', cronAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        const month = today.getMonth() + 1; // 1-based
        const day = today.getDate();

        // Find members whose birthday matches today (month and day of personalInfo.dateOfBirth)
        const birthdayMembers = await Member.find({
            'personalInfo.dateOfBirth': { $exists: true, $ne: null },
            $expr: {
                $and: [
                    { $eq: [{ $month: '$personalInfo.dateOfBirth' }, month] },
                    { $eq: [{ $dayOfMonth: '$personalInfo.dateOfBirth' }, day] },
                ],
            },
        }).select('tenantId firstName lastName mobile').lean();

        const systemUserId = new mongoose.Types.ObjectId('000000000000000000000000');
        let sentCount = 0;
        const results: { memberId: string; name: string; phone: string; tenantId: string }[] = [];

        for (const member of birthdayMembers) {
            const config = await WhatsAppAutomationConfig.findOne({ tenantId: member.tenantId }).lean();
            if (!config || !(config as any).birthday?.enabled) continue;

            const name = `${member.firstName} ${member.lastName}`.trim() || 'Member';
            const phone = member.mobile;
            if (!phone) continue;

            const template: string = (config as any).birthday?.template
                ?? 'Happy Birthday {name}! 🎂 Wishing you great health and fitness. From {gymName}';

            const message = template
                .replace(/\{name\}/g, name)
                .replace(/\{gymName\}/g, 'GymFlow');

            await WhatsAppLog.create({
                tenantId: member.tenantId,
                memberId: (member as any)._id,
                memberName: name,
                phone,
                message,
                type: 'birthday',
                sentAt: new Date(),
                sentBy: systemUserId,
                sentByName: 'System (Cron)',
                deviceType: 'unknown',
            });

            results.push({
                memberId: String(member._id),
                name,
                phone,
                tenantId: String(member.tenantId),
            });
            sentCount++;
        }

        res.json({
            success: true,
            message: `Birthday WhatsApp cron completed. ${sentCount} messages sent.`,
            data: { count: sentCount, members: results },
        });
    } catch (error) { next(error); }
});

// POST /festival-whatsapp — runs daily to send festival WhatsApp messages to active members.
// Checks all tenants with festival automation enabled, finds festivals whose date matches
// today (MM-DD), and queues a WhatsApp log entry for each active member of those tenants.
router.post('/festival-whatsapp', cronAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const today = new Date();
        const todayMonth = today.getMonth() + 1; // 1-12
        const todayDay = today.getDate();

        // System ObjectId placeholder for automated cron sends (no real user context)
        const systemUserId = new mongoose.Types.ObjectId('000000000000000000000000');

        // Get all tenants with festival automation enabled
        const configs = await WhatsAppAutomationConfig.find({ 'festivalTemplate.enabled': true });

        let totalSent = 0;
        for (const config of configs) {
            // Check if any festival in the config's list matches today's MM-DD date
            const matchingFestivals = (config.festivals ?? []).filter((f: any) => {
                if (!f.enabled || !f.date) return false;
                const [fMonth, fDay] = (f.date as string).split('-').map(Number);
                return fMonth === todayMonth && fDay === todayDay;
            });

            if (matchingFestivals.length === 0) continue;
            const festival = matchingFestivals[0];

            // Get all active members for this tenant
            const members = await Member.find({ tenantId: config.tenantId, status: 'active' })
                .select('firstName lastName mobile').lean();

            // Use the festival's own template, fall back to the config-level festivalTemplate message
            const template =
                festival.template ??
                config.festivalTemplate?.message ??
                'Happy {festivalName}! 🎉 Wishing you joy and prosperity!';

            for (const member of members) {
                const phone = (member as any).mobile;
                if (!phone) continue;

                const name = `${(member as any).firstName || ''} ${(member as any).lastName || ''}`.trim() || 'Member';

                const message = template
                    .replace(/\{name\}/g, name)
                    .replace(/\{festivalName\}/g, festival.name ?? 'Festival')
                    .replace(/\{festival\}/g, festival.name ?? 'Festival');

                await WhatsAppLog.create({
                    tenantId: config.tenantId,
                    memberId: (member as any)._id,
                    memberName: name,
                    phone,
                    message,
                    type: 'festival_offer',
                    sentAt: new Date(),
                    sentBy: systemUserId,
                    sentByName: 'System (Cron)',
                    deviceType: 'unknown',
                });
                totalSent++;
            }
        }

        res.json({ success: true, data: { totalSent } });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
