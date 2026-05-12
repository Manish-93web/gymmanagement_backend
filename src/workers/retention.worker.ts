import cron from 'node-cron';
import Member from '../models/Member.model';
import InactivityAlert from '../models/InactivityAlert.model';
import logger from '../config/logger';

export const checkInactivity = async () => {
    logger.info('[Retention] Running Inactivity Check...');

    const now = new Date();
    const thresholds = [
        { days: 30, level: 'critical' as const },
        { days: 14, level: 'warning' as const },
        { days: 7, level: 'warning' as const } // Both 7 and 14 days mapped to warning for now or I can add 'churned'
    ];

    for (const threshold of thresholds) {
        const dateLimit = new Date(now.getTime() - (threshold.days * 24 * 60 * 60 * 1000));

        // Find members whose last check-in was before dateLimit
        const members = await Member.find({
            lastCheckIn: { $lt: dateLimit },
            isActive: true
        } as any);

        for (const member of members) {
            const existingAlert = await InactivityAlert.findOne({
                memberId: member._id,
                level: threshold.level,
                status: 'pending'
            });

            if (!existingAlert) {
                // @ts-ignore
                const alert = await InactivityAlert.create({
                    memberId: member._id,
                    tenantId: member.tenantId,
                    level: threshold.level,
                    daysInactive: threshold.days,
                    lastAttendanceDate: member.lastCheckIn || new Date(),
                    status: 'pending'
                } as any);

                const ws = (global as any).websocketService;
                if (ws?.broadcastToTenant) {
                    ws.broadcastToTenant(member.tenantId.toString(), 'retention:newRisk', {
                        memberId:    member._id.toString(),
                        memberName:  `${member.firstName} ${member.lastName}`,
                        level:       threshold.level,
                        daysInactive: threshold.days,
                        alertId:     alert._id.toString(),
                    });
                }
                logger.info(`[Retention] Alert created for ${member.firstName} (${threshold.level})`);
            }
        }
    }

    logger.info('✅ Inactivity Check Complete.');
};

// Singleton cron — run daily at 3 AM
class RetentionWorker {
    private static instance: RetentionWorker;

    private constructor() {
        cron.schedule('0 3 * * *', async () => {
            logger.info('[Retention] Running inactivity check...');
            try {
                await checkInactivity();
            } catch (err: any) {
                logger.error('[Retention] Inactivity check failed:', err.message);
            }
        });
        logger.info('✅ RetentionWorker scheduled (daily 3 AM)');
    }

    public static getInstance(): RetentionWorker {
        if (!RetentionWorker.instance) {
            RetentionWorker.instance = new RetentionWorker();
        }
        return RetentionWorker.instance;
    }
}

RetentionWorker.getInstance();
