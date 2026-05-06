import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { config } from './config/config';
import { connectDB } from './config/database';
import { connectRedis } from './config/redis';
import WebSocketService from './services/websocket.service';
import BullMQAutomationService from './services/bullmq-automation.service';

// Routes
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

const app: Application = express();
const httpServer = http.createServer(app);

// Initialize WebSocket
export const websocketService = new WebSocketService(httpServer);

// Security middleware
app.use(helmet());
app.use(hpp());

// CORS
app.use(
    cors({
        origin: config.cors.origin,
        credentials: true,
    })
);

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', apiLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (config.env === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
    });
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
app.use('/api', aiCrmRoutes);

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

process.on('SIGTERM', () => {
    httpServer.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    httpServer.close(() => process.exit(0));
});

process.on('unhandledRejection', (err: Error) => {
    console.error('Unhandled Promise Rejection:', err);
    if (config.env === 'production') process.exit(1);
});

startServer();

export default app;
