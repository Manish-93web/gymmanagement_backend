import { Request, Response, NextFunction } from 'express';

/**
 * P4 — One-Device Anti-Sharing Enforcement Middleware
 *
 * Applied to protected member routes to block a second device login.
 * Non-members (trainers, staff, admins) are always allowed through.
 * Missing x-device-id header is treated as "skip" so browser sessions aren't broken.
 */
export const enforceOneDevice = async (
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        // Only enforce for member role
        const user = (req as any).user;
        if (!user || user.role !== 'member') {
            return next();
        }

        const deviceId = req.headers['x-device-id'] as string | undefined;
        if (!deviceId) {
            // No device ID header — mobile app should always send this; skip enforcement
            return next();
        }

        try {
            // Defensive require: if DeviceRecord model somehow doesn't exist, skip enforcement
            const DeviceRecord = require('../models/DeviceRecord.model').default;

            // Find the most recently trusted device for this user
            const registeredDevice = await DeviceRecord.findOne({
                userId: user._id,
                isTrusted: true,
                isBlocked: { $ne: true },
            })
                .sort({ trustVerifiedAt: -1 })
                .lean();

            if (!registeredDevice) {
                // No trusted device yet — allow; first-time registration is handled by
                // the POST /security/register-device route
                return next();
            }

            // Same device — allow
            if (registeredDevice.deviceId === deviceId) {
                return next();
            }

            // Check if this member has been whitelisted for multi-device access by an admin
            try {
                const User = require('../models/User.model').default;
                // lean() returns raw MongoDB document, so extra fields (allowMultiDevice)
                // stored via strict:false updates are visible even if not in schema
                const memberUser = await User.findById(user._id).lean();
                if ((memberUser as any)?.allowMultiDevice === true) {
                    return next();
                }
            } catch {
                // If User model lookup fails, continue with enforcement
            }

            // Different device — block and present the replacement prompt
            const maskedPhone = (user.mobile || user.phone)
                ? `+91 xxxxxx${String(user.mobile || user.phone).slice(-4)}`
                : null;

            res.status(403).json({
                success: false,
                code: 'DEVICE_CONFLICT',
                message: 'Your account is logged in on another device.',
                data: {
                    registeredDeviceName: registeredDevice.deviceName ?? 'Unknown Device',
                    registeredPlatform: registeredDevice.platform ?? 'unknown',
                    canReplace: true,
                    phone: maskedPhone,
                },
            });
        } catch {
            // If any model operation fails, fail open (don't block the user)
            return next();
        }
    } catch {
        // Never block a request due to enforcement errors
        next();
    }
};
