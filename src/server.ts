import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import mongoSanitize from 'express-mongo-sanitize';
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
app.use(mongoSanitize());

// CORS
app.use(
    cors({
        origin: config.cors.origin,
        credentials: true,
    })
);

// Rate limiting — IP-based global limiter
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

// eSSL ADMS device push — mounted before JSON body parser so express.text() captures raw body
app.use('/essl', esslAdmsRoutes);

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

        // Initialize scheduled reports (restores all active cron jobs from DB)
        try {
            const { default: ScheduledReportService } = await import('./services/scheduled-report.service');
            await ScheduledReportService.initializeScheduledReports();
            console.log('✅ Scheduled reports initialized');
        } catch (err) {
            console.warn('⚠️ Scheduled reports init failed:', err);
        }

        // Start cron-based workers (all singletons — imported for side-effects)
        await import('./workers/attendance.worker');
        await import('./workers/billing.worker');
        await import('./workers/retention.worker');
        await import('./workers/biometric-autocheckout.worker');
        await import('./workers/biometric-healthcheck.worker');
        await import('./workers/biometric-sync.worker');
        console.log('✅ Cron workers initialized');

        httpServer.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT} in ${config.env} mode`);
            console.log(`🔌 WebSocket server ready`);
        }).on('error', (err) => {
            console.error('❌ Server failed to start:', err);
            process.exit(1);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
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
    console.error('Unhandled Promise Rejection:', err);
    if (config.env === 'production') process.exit(1);
});

startServer();

export default app;
