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

// Import routes
import authRoutes from './routes/auth.routes';
import tenantRoutes from './routes/tenant.routes';
import memberRoutes from './routes/member.routes';
import communityRoutes from './routes/community.routes';
import gamificationRoutes from './routes/gamification.routes';

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
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
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

// Import additional routes
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

// Register additional routes
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
app.use('/api/platform', platformRoutes); // Layer 1: Super Admin
app.use('/api/health', healthRoutes); // Phase 24: Health Integrations
app.use('/api/workouts', workoutRoutes);
app.use('/api/exercises', workoutRoutes); // Reuse for /exercises routes
app.use('/api/automation', automationRoutes);
app.use('/api/templates', templateRoutes);
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
    try {
        // Connect to MongoDB
        await connectDB();
        console.log('✅ MongoDB connected');

        // Connect to Redis
        await connectRedis();
        console.log('✅ Redis connected');

        // Start HTTP server (with WebSocket)
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

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    httpServer.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
    console.error('Unhandled Promise Rejection:', err);
    // Don't exit immediately in dev, just log
    if (config.env === 'production') {
        process.exit(1);
    }
});

startServer();

export default app;
