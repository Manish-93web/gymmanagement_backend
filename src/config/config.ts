import dotenv from 'dotenv';

dotenv.config();

export const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),

    // Database
    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-management',
        testUri: process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/gym-management-test',
    },

    // Redis
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || '',
    },

    // JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },

    // CORS
    cors: {
        origin: (process.env.CORS_ORIGIN || 'http://localhost:3001')
            .split(',').map(s => s.trim()).filter(Boolean),
    },

    // Rate Limiting
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    },

    // Cloudinary
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
        apiKey: process.env.CLOUDINARY_API_KEY || '',
        apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    },

    // Payment Gateways
    razorpay: {
        keyId: process.env.RAZORPAY_KEY_ID || '',
        keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    },

    // Email
    email: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        user: process.env.SMTP_USER || '',
        password: process.env.SMTP_PASSWORD || '',
        from: process.env.EMAIL_FROM || 'noreply@gymmanagement.com',
        fromName: process.env.EMAIL_FROM_NAME || 'Gym Management',
    },

    // SMS (Twilio)
    sms: {
        accountSid: process.env.TWILIO_ACCOUNT_SID || '',
        authToken: process.env.TWILIO_AUTH_TOKEN || '',
        fromNumber: process.env.TWILIO_PHONE_NUMBER || '',
    },

    // WhatsApp
    whatsapp: {
        apiUrl: process.env.WHATSAPP_API_URL || '',
        apiKey: process.env.WHATSAPP_API_KEY || '',
    },

    // OpenAI (legacy fallback)
    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: process.env.OPENAI_MODEL || 'gpt-4',
    },

    // OpenRouter (active AI provider)
    openrouter: {
        apiKey: process.env.OPENROUTER_API_KEY || '',
        model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
        baseUrl: 'https://openrouter.ai/api/v1',
    },

    // AI Provider selection
    ai: {
        provider: process.env.AI_PROVIDER || 'openrouter',
    },

    // Super Admin
    superAdmin: {
        mobile: process.env.SUPER_ADMIN_MOBILE || '8860281526',
    },

    // Zoom
    zoom: {
        apiKey: process.env.ZOOM_API_KEY || '',
        apiSecret: process.env.ZOOM_API_SECRET || '',
    },

    // Frontend
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',

    // Session
    sessionSecret: process.env.SESSION_SECRET || 'your-session-secret',

    // File Upload
    upload: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
        allowedTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,video/mp4,application/pdf').split(','),
    },

    // OTP
    otp: {
        expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10),
        length: parseInt(process.env.OTP_LENGTH || '6', 10),
    },

    // Backup
    backup: {
        enabled: process.env.BACKUP_ENABLED === 'true',
        schedule: process.env.BACKUP_SCHEDULE || '0 2 * * *',
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
    },
};
