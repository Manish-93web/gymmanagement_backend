import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
// Allow Atlas TLS cert on dev — Node.js doesn't use system cert store unlike Next.js/browsers
if (process.env.NODE_ENV !== 'production') {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { randomUUID } from 'crypto';
import { config } from './config/config';
import { connectDB } from './config/database';
import { connectRedis } from './config/redis';
import WebSocketService from './services/websocket.service';
import BullMQAutomationService from './services/bullmq-automation.service';

// Routes
import { tenantRateLimiter } from './middleware/rateLimit.middleware';
import authRoutes from './routes/auth.routes';
import tenantRoutes from './routes/tenant.routes';
import memberRoutes from './routes/member.routes';
import communityRoutes from './routes/community.routes';
import gamificationRoutes from './routes/gamification.routes';
import paymentRoutes from './routes/payment.routes';
import planRoutes from './routes/plan.routes';
import attendanceRoutes from './routes/attendance.routes';
import analyticsRoutes from './routes/analytics.routes';
import posRoutes from './routes/pos.routes';
import trainerRoutes from './routes/trainer.routes';
import classRoutes from './routes/class.routes';
import fitnessRoutes from './routes/fitness.routes';
import aiCrmRoutes from './routes/ai-crm.routes';
import notificationRoutes from './routes/notification.routes';
import dashboardRoutes from './routes/dashboard.routes';
import securityRoutes from './routes/security.routes';
import platformRoutes from './routes/platform.routes';
import franchiseRoutes from './routes/franchise.routes';
import healthRoutes from './routes/health.routes';
import workoutRoutes from './routes/workout.routes';
import automationRoutes from './routes/automation.routes';
import templateRoutes from './routes/template.routes';
import staffRoutes from './routes/staff.routes';
import retentionRoutes from './routes/retention.routes';
import brandingRoutes from './routes/branding.routes';
import marketingRoutes from './routes/marketing.routes';
import adminRoutes from './routes/admin.routes';
import announcementRoutes from './routes/announcement.routes';
import inquiryRoutes from './routes/inquiry.routes';
import billingRoutes from './routes/billing.routes';
import nutritionRoutes from './routes/nutrition.routes';
import biometricRoutes from './routes/biometric.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import supportRoutes from './routes/support.routes';
import subscriptionRoutes from './routes/subscription.routes';
import publicRoutes from './routes/public.routes';
import cronRoutes from './routes/cron.routes';
import demoRoutes from './routes/demo.routes';
import whatsappQuickRoutes from './routes/whatsapp-quick.routes';
import branchesRoutes from './routes/branches.routes';
import saasAlertsRoutes from './routes/saas-alerts.routes';
import uploadRoutes from './routes/upload.routes';
import crmWebhookRoutes from './routes/crm-webhook.routes';
import scheduledReportRoutes from './routes/scheduled-report.routes';
import esslAdmsRoutes from './routes/essl-adms.routes';
import financeRoutes from './routes/finance.routes';
import wearableRoutes from './routes/wearable.routes';
import healthRiskRoutes from './routes/health-risk.routes';
import videoLibraryRoutes from './routes/video-library.routes';
import gymProfileRoutes from './routes/gym-profile.routes';
import fitnessEventsRoutes from './routes/fitness-events.routes';
import eventPartnershipsRoutes from './routes/event-partnerships.routes';
import equipmentRoutes from './routes/equipment.routes';
import corporateRoutes from './routes/corporate.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import bodyCompositionRoutes from './routes/body-composition.routes';
import whiteLabelRoutes from './routes/white-label.routes';
import membershipTransferRoutes from './routes/membership-transfer.routes';
import conditionProtocolsRoutes from './routes/condition-protocols.routes';
import stepChallengesRoutes from './routes/step-challenges.routes';
import progressiveChallengesRoutes from './routes/progressive-challenges.routes';
import healthArticlesRoutes from './routes/health-articles.routes';
import wellnessPlansRoutes from './routes/wellness-plans.routes';
import eatingOutRoutes from './routes/eating-out.routes';
import dynamicPricingRoutes from './routes/dynamic-pricing.routes';
import eapRoutes from './routes/eap.routes';
import formSessionsRoutes from './routes/form-sessions.routes';
import pharmacyVouchersRoutes from './routes/pharmacy-vouchers.routes';
import abhaRoutes from './routes/abha.routes';
import insuranceRoutes from './routes/insurance.routes';
import memberHealthProfileRoutes from './routes/member-health-profile.routes';
import favouriteMealsRoutes from './routes/favourite-meals.routes';
import whatsappDigestRoutes from './routes/whatsapp-digest.routes';
import pointsExpiryRoutes from './routes/points-expiry.routes';
import facilityBookingRoutes from './routes/facility-booking.routes';
import scanEventsRoutes from './routes/scan-events.routes';
import gymReviewsRoutes from './routes/gym-reviews.routes';
import whatsappGroupsRoutes from './routes/whatsapp-groups.routes';
import teleConsultationRoutes from './routes/tele-consultation.routes';
import healthCheckupsRoutes from './routes/health-checkups.routes';
import friendChallengesRoutes from './routes/friend-challenges.routes';
import webStoriesRoutes from './routes/web-stories.routes';
import gymQrRoutes from './routes/gym-qr.routes';
import complaintsRoutes from './routes/complaints.routes';
import creditNotesRoutes from './routes/credit-notes.routes';
import couponRedemptionRoutes from './routes/coupon-redemption.routes';
import trialConversionRoutes from './routes/trial-conversion.routes';
import irregularMembersRoutes from './routes/irregular-members.routes';
import websiteContentRoutes from './routes/website-content.routes';
import habitChallengesRoutes from './routes/habit-challenges.routes';
import bulkMemberOpsRoutes from './routes/bulk-member-ops.routes';
import refundPolicyRoutes from './routes/refund-policy.routes';
import wellnessCheckinRoutes from './routes/wellness-checkin.routes';
import checkinEventsRoutes from './routes/checkin-events.routes';
import memberEmergencyRoutes from './routes/member-emergency.routes';
import memberSelfRenewalRoutes from './routes/member-self-renewal.routes';
import challenge678Routes from './routes/challenge-678.routes';
import refundRequestsRoutes from './routes/refund-requests.routes';
import invoiceVoidRoutes from './routes/invoice-void.routes';
import articleReadingRoutes from './routes/article-reading.routes';
import trialClaimRoutes from './routes/trial-claim.routes';
import trainerDashboardRoutes from './routes/trainer-dashboard.routes';
import stepChallengeCronRoutes from './routes/step-challenge-cron.routes';
import deviceManagementRoutes from './routes/device-management.routes';
import pricingSimulatorRoutes from './routes/pricing-simulator.routes';
import conditionFilterRoutes from './routes/condition-filter.routes';
import gstBillingRoutes from './routes/gst-billing.routes';
import cafeteriaRoutes from './routes/cafeteria.routes';
import formAnalysisRoutes from './routes/form-analysis.routes';

const app: Application = express();
const httpServer = http.createServer(app);

// Initialize WebSocket
export const websocketService = new WebSocketService(httpServer);
// Make available globally so workers (which lack access to the module graph) can emit events
(global as any).websocketService = websocketService;

// Gzip compression
app.use(compression());

// Per-request ID for log tracing
app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).requestId = randomUUID();
    next();
});

// Security middleware
app.use(helmet());
app.use(hpp());

// express-mongo-sanitize is incompatible with Express 5 (req.query is a read-only getter).
// Inline sanitizer: mutates existing query/body/params properties in-place.
app.use((req: Request, _res: Response, next: NextFunction) => {
    const sanitize = (obj: Record<string, unknown>): void => {
        for (const key of Object.keys(obj)) {
            if (key.startsWith('$') || key.includes('.')) {
                delete obj[key];
            } else if (obj[key] !== null && typeof obj[key] === 'object') {
                sanitize(obj[key] as Record<string, unknown>);
            }
        }
    };
    if (req.body && typeof req.body === 'object') sanitize(req.body as Record<string, unknown>);
    if (req.params) sanitize(req.params as unknown as Record<string, unknown>);
    if (req.query && typeof req.query === 'object') sanitize(req.query as Record<string, unknown>);
    next();
});

// CORS — in development, also allow LAN IPs so the frontend works from network access
const corsOriginFn = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) { callback(null, true); return; } // allow non-browser requests (curl, mobile)
    const allowed: (string | RegExp)[] = [
        ...config.cors.origin,
        // In development, allow any private LAN address accessing the frontend port
        ...(config.env === 'development' ? [/^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/, /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/, /^http:\/\/172\.(1[6-9]|2\d|3[01])\.\d+\.\d+(:\d+)?$/] : []),
    ];
    const ok = allowed.some(p => typeof p === 'string' ? p === origin : p.test(origin));
    callback(ok ? null : new Error(`CORS: origin not allowed: ${origin}`), ok);
};

app.use(
    cors({
        origin: corsOriginFn,
        credentials: true,
    })
);

// Rate limiting — skip in development to avoid false 429s during rapid page navigation
if (process.env.NODE_ENV !== 'development') {
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 300,
        message: 'Too many requests from this IP, please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
    });
    app.use('/api/', apiLimiter);

    // Per-tenant rate limiter — 500 req/min per gym (prevents one tenant from starving others)
    app.use('/api/', tenantRateLimiter(500, 60));
}

// Request timeout middleware (30 seconds)
app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setTimeout(30000, () => {
        if (!res.headersSent) {
            res.status(503).json({ success: false, message: 'Request timeout' });
        }
    });
    next();
});

// Bulk operation guard — reject payloads with arrays > 500 items
app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
        const checkDepth = (obj: any, depth = 0): boolean => {
            if (depth > 3) return false;
            if (Array.isArray(obj) && obj.length > 500) return true;
            if (typeof obj === 'object' && obj !== null) {
                return Object.values(obj).some((v) => checkDepth(v, depth + 1));
            }
            return false;
        };
        if (checkDepth(req.body)) {
            res.status(400).json({ success: false, message: 'Bulk operation exceeds maximum batch size of 500' });
            return;
        }
    }
    next();
});

// Log every request from non-localhost IPs so we can see device traffic
app.use((req: Request, _res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || '';
    if (!ip.includes('127.0.0.1') && !ip.includes('::1')) {
        console.log(`[LAN REQUEST] ${req.method} ${req.url} from ${ip}`);
    }
    next();
});

// eSSL ADMS device push — mounted before JSON body parser so express.text() captures raw body
// /essl/iclock/cdata  → explicit prefix (keep for backward compat)
// /iclock/cdata       → standard eSSL firmware hardcoded path (device cannot change this)
app.use('/essl', esslAdmsRoutes);
app.use('/', esslAdmsRoutes);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve locally uploaded files (fallback when Cloudinary is not configured)
app.use('/uploads', express.static('public/uploads'));

// Per-tenant request ID logging
morgan.token('tenant-id', (req: any) => req.user?.tenantId?.toString() || '-');
morgan.token('request-id', (req: any) => req.requestId || '-');

if (config.env === 'development') {
    app.use(morgan(':method :url :status :response-time ms [tenant=:tenant-id] [req=:request-id]'));
} else {
    app.use(morgan('combined :req[x-forwarded-for] :tenant-id :request-id'));
}

// Detailed health check — DB + Redis status
app.get('/health', async (_req: Request, res: Response) => {
    const checks: Record<string, any> = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
        memory: {
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        },
        services: {},
    };

    // MongoDB check
    const mongoose = await import('mongoose');
    const dbState = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    checks.services.mongodb = {
        status: dbState[mongoose.default.connection.readyState] || 'unknown',
        healthy: mongoose.default.connection.readyState === 1,
    };

    // Redis check
    const { redis } = await import('./config/redis');
    try {
        await redis.set('health_check', '1');
        checks.services.redis = { status: 'connected', healthy: true };
    } catch {
        checks.services.redis = { status: 'error', healthy: false };
    }

    const allHealthy = Object.values(checks.services as Record<string, any>).every((s) => s.healthy);
    if (!allHealthy) checks.status = 'DEGRADED';

    res.status(allHealthy ? 200 : 503).json(checks);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/gamification', gamificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/trainers', trainerRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/fitness', fitnessRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/franchise', franchiseRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/exercises', workoutRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/retention', retentionRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/wearable', wearableRoutes);
app.use('/api/health-risk', healthRiskRoutes);
app.use('/api/content', videoLibraryRoutes);
app.use('/api/gym-profile', gymProfileRoutes);
app.use('/api/events', fitnessEventsRoutes);
app.use('/api/event-partnerships', eventPartnershipsRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/corporate', corporateRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/body-composition', bodyCompositionRoutes);
app.use('/api/white-label', whiteLabelRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/biometric', biometricRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/whatsapp-quick', whatsappQuickRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/saas-alerts', saasAlertsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/crm-webhook', crmWebhookRoutes);
app.use('/api/scheduled-reports', scheduledReportRoutes);
app.use('/api', aiCrmRoutes); // handles /api/ai/* and /api/crm/* via ai-crm router
app.use('/api/membership-transfers', membershipTransferRoutes);
app.use('/api/condition-protocols', conditionProtocolsRoutes);
app.use('/api/step-challenges', stepChallengesRoutes);
app.use('/api/progressive-challenges', progressiveChallengesRoutes);
app.use('/api/health-articles', healthArticlesRoutes);
app.use('/api/wellness-plans', wellnessPlansRoutes);
app.use('/api/eating-out', eatingOutRoutes);
app.use('/api/dynamic-pricing', dynamicPricingRoutes);
app.use('/api/eap', eapRoutes);
app.use('/api/form-sessions', formSessionsRoutes);
app.use('/api/pharmacy-vouchers', pharmacyVouchersRoutes);
app.use('/api/abha', abhaRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/member-health-profile', memberHealthProfileRoutes);
app.use('/api/favourite-meals', favouriteMealsRoutes);
app.use('/api/whatsapp-digest', whatsappDigestRoutes);
app.use('/api/points-expiry', pointsExpiryRoutes);
app.use('/api/facility-booking', facilityBookingRoutes);
app.use('/api/scan-events', scanEventsRoutes);
app.use('/api/gym-reviews', gymReviewsRoutes);
app.use('/api/whatsapp-groups', whatsappGroupsRoutes);
app.use('/api/tele-consultation', teleConsultationRoutes);
app.use('/api/health-checkups', healthCheckupsRoutes);
app.use('/api/friend-challenges', friendChallengesRoutes);
app.use('/api/web-stories', webStoriesRoutes);
app.use('/api/gym-qr', gymQrRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/credit-notes', creditNotesRoutes);
app.use('/api/coupon-redemption', couponRedemptionRoutes);
app.use('/api/trial-conversion', trialConversionRoutes);
app.use('/api/irregular-members', irregularMembersRoutes);
app.use('/api/website-content', websiteContentRoutes);
app.use('/api/habit-challenges', habitChallengesRoutes);
app.use('/api/bulk-member-ops', bulkMemberOpsRoutes);
app.use('/api/refund-policy', refundPolicyRoutes);
app.use('/api/wellness-checkin', wellnessCheckinRoutes);
app.use('/api/checkin-events', checkinEventsRoutes);
app.use('/api/member-emergency', memberEmergencyRoutes);
app.use('/api/member-self-renewal', memberSelfRenewalRoutes);
app.use('/api/challenge-678', challenge678Routes);
app.use('/api/refund-requests', refundRequestsRoutes);
app.use('/api/invoice-void', invoiceVoidRoutes);
app.use('/api/article-reading', articleReadingRoutes);
app.use('/api/trial-claim', trialClaimRoutes);
app.use('/api/trainer-dashboard', trainerDashboardRoutes);
app.use('/api/step-challenge-cron', stepChallengeCronRoutes);
app.use('/api/device-management', deviceManagementRoutes);
app.use('/api/pricing-simulator', pricingSimulatorRoutes);
app.use('/api/condition-filter', conditionFilterRoutes);
app.use('/api/gst-billing', gstBillingRoutes);
app.use('/api/cafeteria', cafeteriaRoutes);
app.use('/api/form-analysis', formAnalysisRoutes);
// Note: eSSL ADMS device endpoint is at /essl/iclock/* (public, before /api rate limiter)

// 404 handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    console.error('Error:', err);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';
    res.status(statusCode).json({
        success: false,
        message,
        ...(config.env === 'development' && { stack: err.stack }),
    });
});

// Start server
const PORT = config.port || 5000;

const startServer = async () => {
    console.log('🏁 startServer called');

    // Bind port FIRST so Render's port scan succeeds immediately
    await new Promise<void>((resolve, reject) => {
        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT} in ${config.env} mode`);
            console.log(`🔌 WebSocket server ready`);
            resolve();
        }).on('error', (err) => {
            console.error('❌ Server failed to start:', err);
            reject(err);
        });
    });

    // Initialize services after port is bound (non-blocking for Render)
    try {
        await connectDB();
        console.log('✅ MongoDB connected');

        await connectRedis();
        console.log('✅ Redis connected');

        try {
            await BullMQAutomationService.initialize();
            console.log('✅ BullMQ automation queues initialized');
        } catch (err) {
            console.warn('⚠️ BullMQ init failed (Redis may not be running):', err);
        }

        try {
            const { default: ScheduledReportService } = await import('./services/scheduled-report.service');
            await ScheduledReportService.initializeScheduledReports();
            console.log('✅ Scheduled reports initialized');
        } catch (err) {
            console.warn('⚠️ Scheduled reports init failed:', err);
        }

        await import('./workers/attendance.worker');
        await import('./workers/billing.worker');
        await import('./workers/retention.worker');
        await import('./workers/membership-expiry.worker');
        await import('./workers/biometric-autocheckout.worker');
        await import('./workers/biometric-healthcheck.worker');
        await import('./workers/biometric-sync.worker');
        await import('./workers/step-challenge.worker');
        console.log('✅ Cron workers initialized');

        try {
            const { scheduleDailyDigest } = await import('./services/daily-whatsapp-digest.service');
            scheduleDailyDigest();
            console.log('✅ WhatsApp daily digest scheduler started');
        } catch (err) {
            console.warn('⚠️ WhatsApp digest scheduler init failed:', err);
        }

    } catch (error) {
        console.error('❌ Service initialization failed:', error);
        // Server stays up even if some services fail
    }
};

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
    console.log(`\n⚡ ${signal} received — initiating graceful shutdown...`);

    // Stop accepting new connections
    httpServer.close(async () => {
        console.log('✅ HTTP server closed');

        try {
            // Close MongoDB
            const mongoose = await import('mongoose');
            await mongoose.default.connection.close();
            console.log('✅ MongoDB connection closed');
        } catch (err) {
            console.error('❌ Error closing MongoDB:', err);
        }

        try {
            // Close Redis
            const { redis } = await import('./config/redis');
            if (typeof (redis as any).quit === 'function') {
                await (redis as any).quit();
                console.log('✅ Redis connection closed');
            }
        } catch (err) {
            console.error('❌ Error closing Redis:', err);
        }

        console.log('👋 Shutdown complete');
        process.exit(0);
    });

    // Force exit after 10s if graceful shutdown takes too long
    setTimeout(() => {
        console.error('❌ Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (err: Error) => {
    const msg = err?.message || String(err);
    // Redis/BullMQ connection errors are non-fatal — server keeps running with mock
    if (msg.includes('ECONNREFUSED') || msg.includes('Connection is closed') || msg.includes('Redis')) {
        console.warn('⚠️  [Redis] Unhandled rejection suppressed (non-fatal):', msg);
        return;
    }
    console.error('Unhandled Promise Rejection:', err);
    if (config.env === 'production') process.exit(1);
});

startServer();

export default app;
