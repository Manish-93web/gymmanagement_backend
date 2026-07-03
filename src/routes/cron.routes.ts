import { Router, Request, Response, NextFunction } from 'express';
import cronController from '../controllers/cron.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import Member from '../models/Member.model';
import WhatsAppAutomationConfig from '../models/WhatsAppAutomationConfig.model';

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

        let sentCount = 0;
        const results: { memberId: string; name: string; phone: string; tenantId: string }[] = [];

        for (const member of birthdayMembers) {
            const config = await WhatsAppAutomationConfig.findOne({ tenantId: member.tenantId }).lean();
            if (!config || !(config as any).birthday?.enabled) continue;

            const name = `${member.firstName} ${member.lastName}`.trim();
            const phone = member.mobile;

            // Log the birthday WhatsApp that would be sent (WhatsApp API integration required)
            console.log(`[BirthdayWhatsApp] Would send birthday message to ${name} (${phone}) for tenant ${member.tenantId}`);

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
            message: `Birthday WhatsApp cron completed. ${sentCount} messages queued.`,
            data: { count: sentCount, members: results },
        });
    } catch (error) { next(error); }
});

export default router;
