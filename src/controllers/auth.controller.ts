import { Request, Response } from 'express';

import authService from '../services/auth.service';
import { z } from 'zod';

// Validation schemas
const registerSchema = z.object({
    email: z.string().email(),
    mobile: z.string().min(10).max(15),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(['gym_owner', 'branch_manager', 'trainer', 'staff', 'member', 'accountant', 'auditor']),
    tenantId: z.string().optional(),
    branchId: z.string().optional(),
});

const loginSchema = z.object({
    identifier: z.string().min(1),
    password: z.string().min(1),
});

const sendOTPSchema = z.object({
    identifier: z.string().min(1),
    type: z.enum(['email', 'mobile']),
});

const otpLoginSchema = z.object({
    identifier: z.string().min(1),
    otp: z.string().length(6),
    type: z.enum(['email', 'mobile']),
});

const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1),
});

export class AuthController {
    // Register new user
    async register(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = registerSchema.parse(req.body);

            const result = await authService.register(validatedData);

            res.status(201).json({
                status: 'success',
                message: 'User registered successfully',
                data: {
                    user: {
                        id: result.user._id,
                        email: result.user.email,
                        mobile: result.user.mobile,
                        firstName: result.user.firstName,
                        lastName: result.user.lastName,
                        role: result.user.role,
                    },
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Registration failed',
            });
        }
    }

    // Login with password
    async login(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = loginSchema.parse(req.body);

            const deviceInfo = {
                deviceId: req.headers['x-device-id'] || 'unknown',
                deviceName: req.headers['x-device-name'] || 'unknown',
                ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
            };

            const result = await authService.login(validatedData, deviceInfo);

            res.status(200).json({
                status: 'success',
                message: 'Login successful',
                data: {
                    user: {
                        id: result.user._id,
                        email: result.user.email,
                        mobile: result.user.mobile,
                        firstName: result.user.firstName,
                        lastName: result.user.lastName,
                        role: result.user.role,
                        tenantId: result.user.tenantId,
                        branchId: result.user.branchId,
                    },
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                },
            });
        } catch (error: any) {
            res.status(401).json({
                status: 'error',
                message: error.message || 'Login failed',
            });
        }
    }

    // Send OTP
    async sendOTP(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = sendOTPSchema.parse(req.body);

            await authService.sendOTP(validatedData.identifier, validatedData.type);

            res.status(200).json({
                status: 'success',
                message: 'OTP sent successfully',
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to send OTP',
            });
        }
    }

    // Login with OTP
    async loginWithOTP(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = otpLoginSchema.parse(req.body);

            const deviceInfo = {
                deviceId: req.headers['x-device-id'] || 'unknown',
                deviceName: req.headers['x-device-name'] || 'unknown',
                ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
                userAgent: req.headers['user-agent'] || 'unknown',
            };

            const result = await authService.loginWithOTP(validatedData, deviceInfo);

            res.status(200).json({
                status: 'success',
                message: 'Login successful',
                data: {
                    user: {
                        id: result.user._id,
                        email: result.user.email,
                        mobile: result.user.mobile,
                        firstName: result.user.firstName,
                        lastName: result.user.lastName,
                        role: result.user.role,
                        tenantId: result.user.tenantId,
                        branchId: result.user.branchId,
                    },
                    accessToken: result.accessToken,
                    refreshToken: result.refreshToken,
                },
            });
        } catch (error: any) {
            res.status(401).json({
                status: 'error',
                message: error.message || 'OTP login failed',
            });
        }
    }

    // Refresh access token
    async refreshToken(req: Request, res: Response): Promise<void> {
        try {
            const validatedData = refreshTokenSchema.parse(req.body);

            const result = await authService.refreshAccessToken(validatedData.refreshToken);

            res.status(200).json({
                status: 'success',
                message: 'Token refreshed successfully',
                data: result,
            });
        } catch (error: any) {
            res.status(401).json({
                status: 'error',
                message: error.message || 'Token refresh failed',
            });
        }
    }

    // Logout
    async logout(req: Request, res: Response): Promise<void> {
        try {
            const { refreshToken } = req.body;

            if (req.user) {
                await authService.logout(req.user._id.toString(), refreshToken);
            }

            res.status(200).json({
                status: 'success',
                message: 'Logout successful',
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Logout failed',
            });
        }
    }

    // Logout from all devices
    async logoutAll(req: Request, res: Response): Promise<void> {
        try {
            if (req.user) {
                await authService.logoutAll(req.user._id.toString());
            }

            res.status(200).json({
                status: 'success',
                message: 'Logged out from all devices',
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Logout failed',
            });
        }
    }

    // Get current user
    async getCurrentUser(req: Request, res: Response): Promise<void> {
        try {
            if (!req.user) {
                res.status(401).json({
                    status: 'error',
                    message: 'Not authenticated',
                });
                return;
            }

            res.status(200).json({
                status: 'success',
                data: {
                    user: {
                        id: req.user._id,
                        email: req.user.email,
                        mobile: req.user.mobile,
                        firstName: req.user.firstName,
                        lastName: req.user.lastName,
                        role: req.user.role,
                        tenantId: req.user.tenantId,
                        branchId: req.user.branchId,
                        avatar: req.user.avatar,
                        isEmailVerified: req.user.isEmailVerified,
                        isMobileVerified: req.user.isMobileVerified,
                    },
                },
            });
        } catch (error: any) {
            res.status(400).json({
                status: 'error',
                message: error.message || 'Failed to get user',
            });
        }
    }
}

export default new AuthController();
