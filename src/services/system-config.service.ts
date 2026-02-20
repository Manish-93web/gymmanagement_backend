import SystemConfig from '../models/SystemConfig.model';
import logger from '../config/logger';

interface ConfigData {
    tenantId: string;
    general: {
        siteName: string;
        siteUrl: string;
        supportEmail: string;
        supportPhone: string;
        timezone: string;
        currency: string;
        language: string;
    };
    branding: {
        logo: string;
        favicon: string;
        primaryColor: string;
        secondaryColor: string;
        customCSS?: string;
    };
    features: {
        enableWhatsApp: boolean;
        enableSMS: boolean;
        enableAI: boolean;
        enableCalendarSync: boolean;
        enableBiometric: boolean;
        enableQRCode: boolean;
    };
    payment: {
        razorpayEnabled: boolean;
        stripeEnabled: boolean;
        defaultGateway: 'razorpay' | 'stripe';
        currency: string;
        taxRate: number;
    };
    notifications: {
        emailProvider: 'smtp' | 'sendgrid' | 'mailgun';
        smsProvider: 'twilio' | 'msg91';
        whatsappProvider: 'twilio';
    };
    security: {
        sessionTimeout: number;
        maxLoginAttempts: number;
        passwordMinLength: number;
        requireTwoFactor: boolean;
        allowedIPs?: string[];
    };
    limits: {
        maxMembersPerBranch: number;
        maxClassesPerDay: number;
        maxTrainersPerBranch: number;
        storageLimit: number; // in MB
    };
}

class SystemConfigService {
    /**
     * Get system configuration
     */
    async getConfig(tenantId: string): Promise<ConfigData> {
        let config = await SystemConfig.findOne({ tenantId: tenantId as any });

        if (!config) {
            // Create default config
            config = await this.createDefaultConfig(tenantId);
        }

        return config.toObject() as ConfigData;
    }

    /**
     * Create default configuration
     */
    private async createDefaultConfig(tenantId: string) {
        const config = await SystemConfig.create({
            tenantId: tenantId as any,
            general: {
                siteName: 'My Gym',
                siteUrl: 'https://mygym.com',
                supportEmail: 'support@mygym.com',
                supportPhone: '+91-1234567890',
                timezone: 'Asia/Kolkata',
                currency: 'INR',
                language: 'en',
            },
            branding: {
                logo: '/default-logo.png',
                favicon: '/default-favicon.ico',
                primaryColor: '#e74c3c',
                secondaryColor: '#3498db',
            },
            features: {
                enableWhatsApp: true,
                enableSMS: true,
                enableAI: true,
                enableCalendarSync: true,
                enableBiometric: false,
                enableQRCode: true,
            },
            payment: {
                razorpayEnabled: true,
                stripeEnabled: false,
                defaultGateway: 'razorpay',
                currency: 'INR',
                taxRate: 18,
            },
            notifications: {
                emailProvider: 'smtp',
                smsProvider: 'twilio',
                whatsappProvider: 'twilio',
            },
            security: {
                sessionTimeout: 3600,
                maxLoginAttempts: 5,
                passwordMinLength: 8,
                requireTwoFactor: false,
            },
            limits: {
                maxMembersPerBranch: 1000,
                maxClassesPerDay: 50,
                maxTrainersPerBranch: 20,
                storageLimit: 5000,
            },
        });

        return config;
    }

    /**
     * Update configuration
     */
    async updateConfig(tenantId: string, updates: Partial<ConfigData>) {
        const config = await SystemConfig.findOneAndUpdate(
            { tenantId: tenantId as any },
            { $set: updates },
            { new: true, upsert: true }
        );

        logger.info('System configuration updated', { tenantId });

        return config;
    }

    /**
     * Update specific section
     */
    async updateSection(tenantId: string, section: string, data: any) {
        const config = await SystemConfig.findOneAndUpdate(
            { tenantId: tenantId as any },
            { $set: { [section]: data } },
            { new: true, upsert: true }
        );

        logger.info('System configuration section updated', { tenantId, section });

        return config;
    }

    /**
     * Reset to defaults
     */
    async resetToDefaults(tenantId: string) {
        await SystemConfig.findOneAndDelete({ tenantId: tenantId as any });
        const config = await this.createDefaultConfig(tenantId);

        logger.info('System configuration reset to defaults', { tenantId });

        return config;
    }

    /**
     * Get feature flag
     */
    async getFeatureFlag(tenantId: string, feature: string): Promise<boolean> {
        const config = await this.getConfig(tenantId);
        return config.features[feature as keyof typeof config.features] || false;
    }

    /**
     * Toggle feature
     */
    async toggleFeature(tenantId: string, feature: string, enabled: boolean) {
        const config = await SystemConfig.findOneAndUpdate(
            { tenantId: tenantId as any },
            { $set: { [`features.${feature}`]: enabled } },
            { new: true, upsert: true }
        );

        logger.info('Feature toggled', { tenantId, feature, enabled });

        return config;
    }

    /**
     * Export configuration
     */
    async exportConfig(tenantId: string) {
        const config = await this.getConfig(tenantId);
        return JSON.stringify(config, null, 2);
    }

    /**
     * Import configuration
     */
    async importConfig(tenantId: string, configJSON: string) {
        const configData = JSON.parse(configJSON);
        const config = await SystemConfig.findOneAndUpdate(
            { tenantId: tenantId as any },
            { $set: configData },
            { new: true, upsert: true }
        );

        logger.info('System configuration imported', { tenantId });

        return config;
    }
}

export default new SystemConfigService();
