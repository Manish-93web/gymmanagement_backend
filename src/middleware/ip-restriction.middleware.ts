import { Request, Response, NextFunction } from 'express';

interface IPRestrictionConfig {
    allowedIPs: string[];
    blockedIPs: string[];
    allowPrivateIPs: boolean;
}

const defaultConfig: IPRestrictionConfig = {
    allowedIPs: process.env.ADMIN_ALLOWED_IPS?.split(',') || [],
    blockedIPs: process.env.BLOCKED_IPS?.split(',') || [],
    allowPrivateIPs: process.env.NODE_ENV === 'development',
};

/**
 * Check if IP is in CIDR range
 */
function isIPInRange(ip: string, cidr: string): boolean {
    if (!cidr.includes('/')) {
        return ip === cidr;
    }

    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);

    const ipNum = ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);
    const rangeNum = range.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0);

    return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Check if IP is private
 */
function isPrivateIP(ip: string): boolean {
    const privateRanges = [
        '10.0.0.0/8',
        '172.16.0.0/12',
        '192.168.0.0/16',
        '127.0.0.0/8',
        '::1/128',
        'fc00::/7',
    ];

    return privateRanges.some((range) => isIPInRange(ip, range));
}

/**
 * Get client IP address
 */
function getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = (forwarded as string).split(',');
        return ips[0].trim();
    }

    return (
        (req.headers['x-real-ip'] as string) ||
        req.socket.remoteAddress ||
        req.ip ||
        'unknown'
    );
}

/**
 * Middleware to restrict access based on IP address
 */
export const ipRestriction = (customConfig?: Partial<IPRestrictionConfig>) => {
    const config = { ...defaultConfig, ...customConfig };

    return (req: Request, res: Response, next: NextFunction) => {
        const clientIP = getClientIP(req);

        // Check if IP is blocked
        if (config.blockedIPs.some((ip) => isIPInRange(clientIP, ip))) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Your IP address is blocked',
            });
        }

        // If allowed IPs are configured, check if client IP is in the list
        if (config.allowedIPs.length > 0) {
            const isAllowed = config.allowedIPs.some((ip) => isIPInRange(clientIP, ip));

            if (!isAllowed) {
                // Allow private IPs in development
                if (config.allowPrivateIPs && isPrivateIP(clientIP)) {
                    return next();
                }

                return res.status(403).json({
                    success: false,
                    message: 'Access denied: Your IP address is not authorized',
                });
            }
        }

        next();
    };
};

/**
 * Middleware specifically for admin routes
 */
export const adminIPRestriction = ipRestriction({
    allowedIPs: process.env.ADMIN_ALLOWED_IPS?.split(',') || [],
    allowPrivateIPs: process.env.NODE_ENV === 'development',
});

/**
 * Middleware to log IP addresses
 */
export const logIP = (req: Request, res: Response, next: NextFunction) => {
    const clientIP = getClientIP(req);
    (req as any).clientIP = clientIP;
    next();
};

export default {
    ipRestriction,
    adminIPRestriction,
    logIP,
    getClientIP,
    isPrivateIP,
    isIPInRange,
};
