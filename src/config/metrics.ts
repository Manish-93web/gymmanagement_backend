import { Request, Response, NextFunction } from 'express';
import { Counter, Histogram, Gauge, register } from 'prom-client';

// HTTP Request Duration
export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5],
});

// HTTP Request Counter
export const httpRequestCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
});

// Active Connections
export const activeConnections = new Gauge({
    name: 'active_connections',
    help: 'Number of active connections',
});

// Database Operations
export const dbOperationDuration = new Histogram({
    name: 'db_operation_duration_seconds',
    help: 'Duration of database operations',
    labelNames: ['operation', 'collection'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1],
});

export const dbOperationCounter = new Counter({
    name: 'db_operations_total',
    help: 'Total number of database operations',
    labelNames: ['operation', 'collection', 'status'],
});

// Cache Operations
export const cacheHits = new Counter({
    name: 'cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['cache_name'],
});

export const cacheMisses = new Counter({
    name: 'cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['cache_name'],
});

// Business Metrics
export const memberRegistrations = new Counter({
    name: 'member_registrations_total',
    help: 'Total number of member registrations',
    labelNames: ['tenant_id', 'status'],
});

export const paymentTransactions = new Counter({
    name: 'payment_transactions_total',
    help: 'Total number of payment transactions',
    labelNames: ['tenant_id', 'gateway', 'status'],
});

export const paymentAmount = new Counter({
    name: 'payment_amount_total',
    help: 'Total payment amount processed',
    labelNames: ['tenant_id', 'gateway', 'currency'],
});

export const attendanceCheckIns = new Counter({
    name: 'attendance_checkins_total',
    help: 'Total number of attendance check-ins',
    labelNames: ['tenant_id', 'branch_id', 'method'],
});

export const classBookings = new Counter({
    name: 'class_bookings_total',
    help: 'Total number of class bookings',
    labelNames: ['tenant_id', 'class_type', 'status'],
});

// System Metrics
export const errorCounter = new Counter({
    name: 'errors_total',
    help: 'Total number of errors',
    labelNames: ['type', 'severity'],
});

export const activeUsers = new Gauge({
    name: 'active_users',
    help: 'Number of currently active users',
    labelNames: ['tenant_id'],
});

// Middleware to track HTTP metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    activeConnections.inc();

    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = (req as any).route?.path || (req as any).path || '/';

        httpRequestDuration.observe(
            {
                method: req.method,
                route,
                status_code: res.statusCode.toString(),
            } as any,
            duration
        );

        httpRequestCounter.inc({
            method: req.method,
            route,
            status_code: res.statusCode.toString(),
        } as any);

        activeConnections.dec();
    });

    next();
};

// Metrics endpoint handler
export const metricsHandler = async (req: Request, res: Response) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
};

export default {
    httpRequestDuration,
    httpRequestCounter,
    activeConnections,
    dbOperationDuration,
    dbOperationCounter,
    cacheHits,
    cacheMisses,
    memberRegistrations,
    paymentTransactions,
    paymentAmount,
    attendanceCheckIns,
    classBookings,
    errorCounter,
    activeUsers,
    metricsMiddleware,
    metricsHandler,
};
