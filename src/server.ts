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
if (config.nodeEnv === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Health check
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/members', memberRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Error:', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
        ...(config.nodeEnv === 'development' && { stack: err.stack }),
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
            console.log(`🚀 Server running on port ${PORT} in ${config.nodeEnv} mode`);
            console.log(`🔌 WebSocket server ready`);
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
    httpServer.close(() => process.exit(1));
});

startServer();

export default app;
