import NotificationPreference from '../models/NotificationPreference.model';
import logger from '../config/logger';

interface PreferenceConfig {
    userId: string;
    email: {
        enabled: boolean;
        marketing: boolean;
        transactional: boolean;
        reports: boolean;
    };
    sms: {
        enabled: boolean;
        marketing: boolean;
        transactional: boolean;
        reminders: boolean;
    };
    whatsapp: {
        enabled: boolean;
        marketing: boolean;
        transactional: boolean;
        reminders: boolean;
    };
    push: {
        enabled: boolean;
        marketing: boolean;
        transactional: boolean;
        updates: boolean;
    };
    frequency: {
        dailyDigest: boolean;
        weeklyReport: boolean;
        monthlyReport: boolean;
    };
}

class NotificationPreferenceService {
    /**
     * Get or create user preferences
     */
    async getPreferences(userId: string): Promise<PreferenceConfig> {
        let preferences = await NotificationPreference.findOne({ userId });

        if (!preferences) {
            // Create default preferences
            preferences = await NotificationPreference.create({
                userId,
                email: {
                    enabled: true,
                    marketing: true,
                    transactional: true,
                    reports: true,
                },
                sms: {
                    enabled: true,
                    marketing: false,
                    transactional: true,
                    reminders: true,
                },
                whatsapp: {
                    enabled: true,
                    marketing: false,
                    transactional: true,
                    reminders: true,
                },
                push: {
                    enabled: true,
                    marketing: true,
                    transactional: true,
                    updates: true,
                },
                frequency: {
                    dailyDigest: false,
                    weeklyReport: true,
                    monthlyReport: true,
                },
            });
        }

        return preferences.toObject() as PreferenceConfig;
    }

    /**
     * Update preferences
     */
    async updatePreferences(userId: string, updates: Partial<PreferenceConfig>) {
        const preferences = await NotificationPreference.findOneAndUpdate(
            { userId },
            { $set: updates },
            { new: true, upsert: true }
        );

        logger.info('Notification preferences updated', { userId });

        return preferences;
    }

    /**
     * Check if notification should be sent
     */
    async shouldSendNotification(
        userId: string,
        channel: 'email' | 'sms' | 'whatsapp' | 'push',
        type: 'marketing' | 'transactional' | 'reports' | 'reminders' | 'updates'
    ): Promise<boolean> {
        const preferences = await this.getPreferences(userId);

        // Transactional messages always go through
        if (type === 'transactional') {
            return preferences[channel].enabled;
        }

        // Check both channel enabled and specific type
        return (preferences[channel] as any).enabled && (preferences[channel] as any)[type];
    }

    /**
     * Bulk update preferences
     */
    async bulkUpdatePreferences(userIds: string[], updates: Partial<PreferenceConfig>) {
        const result = await NotificationPreference.updateMany(
            { userId: { $in: userIds } },
            { $set: updates }
        );

        logger.info('Bulk notification preferences updated', { count: result.modifiedCount });

        return {
            success: true,
            updated: result.modifiedCount,
        };
    }

    /**
     * Unsubscribe from all marketing
     */
    async unsubscribeMarketing(userId: string) {
        await NotificationPreference.findOneAndUpdate(
            { userId },
            {
                $set: {
                    'email.marketing': false,
                    'sms.marketing': false,
                    'whatsapp.marketing': false,
                    'push.marketing': false,
                },
            },
            { upsert: true }
        );

        logger.info('User unsubscribed from marketing', { userId });

        return {
            success: true,
            message: 'Unsubscribed from all marketing communications',
        };
    }

    /**
     * Get users with specific preferences
     */
    async getUsersWithPreferences(filter: any) {
        const users = await NotificationPreference.find(filter).select('userId');
        return users.map((u) => u.userId);
    }
}

export default new NotificationPreferenceService();
