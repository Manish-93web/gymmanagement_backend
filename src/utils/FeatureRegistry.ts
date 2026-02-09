export type FeatureCategory = 'crm' | 'ai' | 'pos' | 'automation' | 'reporting' | 'community' | 'gamification' | 'inventory';

export interface FeatureDefinition {
    id: string;
    name: string;
    description: string;
    category: FeatureCategory;
    dependencies?: string[]; // IDs of other features required
    parentFeature?: string; // ID of the parent feature if this is a sub-feature
}

export const FEATURES: Record<string, FeatureDefinition> = {
    // CRM
    CRM_BASE: {
        id: 'CRM_BASE',
        name: 'Basic CRM',
        description: 'Manage members, inquiries, and follow-ups',
        category: 'crm'
    },
    CRM_AUTOMATION: {
        id: 'CRM_AUTOMATION',
        name: 'CRM Automation',
        description: 'Automated follow-ups and lead scoring',
        category: 'crm',
        dependencies: ['CRM_BASE']
    },

    // POS
    POS_BASE: {
        id: 'POS_BASE',
        name: 'Point of Sale',
        description: 'Inventory management and store billing',
        category: 'pos'
    },

    // AI Features
    AI_BASE: {
        id: 'AI_BASE',
        name: 'AI Foundation',
        description: 'Enable AI-powered features across the platform',
        category: 'ai'
    },
    AI_WORKOUT: {
        id: 'AI_WORKOUT',
        name: 'AI Workout Generator',
        description: 'Generate personalized workout plans using AI',
        category: 'ai',
        dependencies: ['AI_BASE', 'WORKOUT_TRACKER']
    },
    AI_CHURN_PREDICTION: {
        id: 'AI_CHURN_PREDICTION',
        name: 'AI Churn Analytics',
        description: 'Predict members likely to churn',
        category: 'ai',
        dependencies: ['AI_BASE', 'RETENTION_ENGINE']
    },

    // Retention & Engagement
    RETENTION_ENGINE: {
        id: 'RETENTION_ENGINE',
        name: 'Smart Retention Engine',
        description: 'Analyze member inactivity and run win-back campaigns',
        category: 'reporting'
    },

    // Community
    COMMUNITY_BASE: {
        id: 'COMMUNITY_BASE',
        name: 'Community Hub',
        description: 'Discussion forums, groups, and social feed',
        category: 'community'
    },

    // Gamification
    GAMIFICATION_BASE: {
        id: 'GAMIFICATION_BASE',
        name: 'Gamification Suite',
        description: 'Badges, streaks, and personal records',
        category: 'gamification'
    },
    GAMIFICATION_REWARDS: {
        id: 'GAMIFICATION_REWARDS',
        name: 'Reward Store',
        description: 'Redeem points for gym merchandise',
        category: 'gamification',
        dependencies: ['GAMIFICATION_BASE']
    },

    // Infrastructure
    MULTI_BRANCH: {
        id: 'MULTI_BRANCH',
        name: 'Multi-Branch Management',
        description: 'Manage multiple gym locations from one dashboard',
        category: 'reporting'
    },
    CUSTOM_DOMAIN: {
        id: 'CUSTOM_DOMAIN',
        name: 'Custom Domain',
        description: 'Use your own domain name for the member portal',
        category: 'reporting'
    },
    WHITE_LABEL: {
        id: 'WHITE_LABEL',
        name: 'White Labeling',
        description: 'Remove SaaS branding and use custom logos/colors',
        category: 'reporting'
    }
};

/**
 * Utility to check if a feature can be enabled based on its dependencies
 */
export const checkDependencies = (featureId: string, enabledFeatures: string[]): {
    canEnable: boolean;
    missingDependencies: string[];
} => {
    const feature = FEATURES[featureId];
    if (!feature || !feature.dependencies) {
        return { canEnable: true, missingDependencies: [] };
    }

    const missing = feature.dependencies.filter(dep => !enabledFeatures.includes(dep));
    return {
        canEnable: missing.length === 0,
        missingDependencies: missing
    };
};
