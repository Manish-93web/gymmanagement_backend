import Member from '../models/Member.model';
import InactivityAlert from '../models/InactivityAlert.model';
// Remove direct server import to avoid circularity crashes
// import { websocketService } from '../server';

export const checkInactivity = async () => {
    console.log('🔍 Running Inactivity Check...');

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

                // Find any globally available websocket service or just log for now
                // We will integrate this via a safer service-based approach later
                console.log(`🚩 Alert created for ${member.firstName} (${threshold.level})`);
            }
        }
    }

    console.log('✅ Inactivity Check Complete.');
};
