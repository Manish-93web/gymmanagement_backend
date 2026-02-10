import mongoose from 'mongoose';
import Member from '../models/Member.model';
import InactivityAlert from '../models/InactivityAlert.model';
import { websocketService } from '../server';

export const checkInactivity = async () => {
    console.log('🔍 Running Inactivity Check...');

    const now = new Date();
    const thresholds = [
        { days: 30, risk: 'critical' },
        { days: 14, risk: 'high' },
        { days: 7, risk: 'medium' }
    ];

    for (const threshold of thresholds) {
        const dateLimit = new Date(now.getTime() - (threshold.days * 24 * 60 * 60 * 1000));

        // Find members whose last check-in was before dateLimit and who don't have an active alert for this risk level
        const members = await Member.find({
            lastCheckIn: { $lt: dateLimit },
            isActive: true
        });

        for (const member of members) {
            const existingAlert = await InactivityAlert.findOne({
                memberId: member._id,
                riskLevel: threshold.risk,
                status: 'active'
            });

            if (!existingAlert) {
                const alert = await InactivityAlert.create({
                    memberId: member._id,
                    tenantId: member.tenantId,
                    branchId: member.branchId,
                    riskLevel: threshold.risk,
                    daysInactive: threshold.days,
                    lastCheckIn: member.lastCheckIn,
                    status: 'active'
                });

                // Notify via WebSocket
                websocketService.broadcastToBranch(
                    member.branchId.toString(),
                    'retention:newRisk',
                    {
                        alertId: alert._id,
                        memberName: `${member.firstName} ${member.lastName}`,
                        riskLevel: threshold.risk,
                        daysInactive: threshold.days
                    }
                );

                console.log(`🚩 Alert created for ${member.firstName} (${threshold.risk})`);
            }
        }
    }

    console.log('✅ Inactivity Check Complete.');
};
