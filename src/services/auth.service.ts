import User, { IUser } from '../models/User.model';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.utils';
import { generateOTP, storeOTP, verifyOTP } from '../utils/otp.utils';

export interface RegisterDTO {
    email: string;
    mobile: string;
    password: string;
    firstName: string;
    lastName: string;
    role: string;
    tenantId?: string;
    branchId?: string;
}

export interface LoginDTO {
    identifier: string; // email or mobile
    password: string;
}

export interface OTPLoginDTO {
    identifier: string; // email or mobile
    otp: string;
    type: 'email' | 'mobile';
}

export class AuthService {
    // Register new user
    async register(data: RegisterDTO): Promise<{ user: IUser; accessToken: string; refreshToken: string }> {
        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ email: data.email }, { mobile: data.mobile }],
        });

        if (existingUser) {
            throw new Error('User already exists with this email or mobile');
        }

        // Create user
        const user = await User.create(data);

        // Generate tokens
        const accessToken = generateAccessToken({
            userId: user._id.toString(),
            role: user.role,
            tenantId: user.tenantId?.toString(),
            branchId: user.branchId?.toString(),
        });

        const refreshToken = generateRefreshToken({
            userId: user._id.toString(),
            role: user.role,
            tenantId: user.tenantId?.toString(),
            branchId: user.branchId?.toString(),
        });

        // Store refresh token
        user.refreshTokens.push(refreshToken);
        await user.save();

        return { user, accessToken, refreshToken };
    }

    // Login with email/mobile and password
    async login(data: LoginDTO, deviceInfo: any): Promise<{ user: IUser; accessToken: string; refreshToken: string }> {
        // Normalize identifier
        const identifier = data.identifier.trim();
        const isEmail = identifier.includes('@');

        let user;
        if (isEmail) {
            user = await User.findOne({ email: identifier.toLowerCase() }).select('+password +refreshTokens');
        } else {
            // Normalize mobile: remove all non-digits for comparison
            const mobileDigits = identifier.replace(/\D/g, '');
            user = await User.findOne({
                $or: [
                    { mobile: identifier }, // try original
                    { mobile: mobileDigits } // try normalized
                ]
            }).select('+password +refreshTokens');
        }

        if (!user) {
            throw new Error('User not found with these credentials');
        }

        // Ensure arrays are initialized (especially for select: false fields)
        if (!user.devices) user.devices = [];
        if (!user.refreshTokens) user.refreshTokens = [];

        // Check if user is active
        if (!user.isActive) {
            throw new Error('This account has been deactivated');
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(data.password);

        if (!isPasswordValid) {
            throw new Error('Incorrect password. Please try again.');
        }

        // Update device info
        const now = new Date();
        const deviceExists = user.devices.find(d => d.deviceId === deviceInfo.deviceId);

        if (deviceExists) {
            deviceExists.lastLogin = now;
            deviceExists.ipAddress = deviceInfo.ipAddress;
            deviceExists.userAgent = deviceInfo.userAgent;
        } else {
            user.devices.push({
                deviceId: deviceInfo.deviceId,
                deviceName: deviceInfo.deviceName,
                lastLogin: now,
                ipAddress: deviceInfo.ipAddress,
                userAgent: deviceInfo.userAgent,
            });
        }


        // Update last login and refresh tokens locally
        user.lastLogin = now;

        // Generate tokens
        const accessToken = generateAccessToken({
            userId: user._id.toString(),
            role: user.role,
            tenantId: user.tenantId?.toString(),
            branchId: user.branchId?.toString(),
        });

        const refreshToken = generateRefreshToken({
            userId: user._id.toString(),
            role: user.role,
            tenantId: user.tenantId?.toString(),
            branchId: user.branchId?.toString(),
        });

        // Store refresh token (limit to 5 devices)
        user.refreshTokens.push(refreshToken);
        if (user.refreshTokens.length > 5) {
            user.refreshTokens = user.refreshTokens.slice(-5);
        }

        // Use findOneAndUpdate to avoid triggering 'pre-save' hooks that might re-hash the password
        await User.findOneAndUpdate(
            { _id: user._id },
            {
                $set: {
                    lastLogin: user.lastLogin,
                    devices: user.devices,
                    refreshTokens: user.refreshTokens
                }
            }
        );

        return { user, accessToken, refreshToken };
    }


    // Send OTP for login
    async sendOTP(identifier: string, type: 'email' | 'mobile'): Promise<void> {
        // Find user
        const user = await User.findOne(
            type === 'email' ? { email: identifier } : { mobile: identifier }
        );

        if (!user) {
            throw new Error('User not found');
        }

        if (!user.isActive) {
            throw new Error('Account is inactive');
        }

        // Generate OTP
        const otp = generateOTP();

        // Store OTP in Redis
        await storeOTP(identifier, otp, type);

        // TODO: Send OTP via email or SMS
        console.log(`OTP for ${identifier}: ${otp}`);

        // In production, integrate with email/SMS service
        // if (type === 'email') {
        //   await sendEmail(identifier, 'Login OTP', `Your OTP is: ${otp}`);
        // } else {
        //   await sendSMS(identifier, `Your OTP is: ${otp}`);
        // }
    }

    // Login with OTP
    async loginWithOTP(data: OTPLoginDTO, deviceInfo: any): Promise<{ user: IUser; accessToken: string; refreshToken: string }> {
        // Verify OTP
        const isValid = await verifyOTP(data.identifier, data.otp, data.type);

        if (!isValid) {
            throw new Error('Invalid or expired OTP');
        }

        // Find user
        const user = await User.findOne(
            data.type === 'email' ? { email: data.identifier } : { mobile: data.identifier }
        ).select('+refreshTokens');

        if (!user || !user.isActive) {
            throw new Error('User not found or inactive');
        }

        // Ensure arrays are initialized
        if (!user.devices) user.devices = [];
        if (!user.refreshTokens) user.refreshTokens = [];

        // Update device info and last login (same as regular login)
        const now = new Date();
        const deviceExists = user.devices.find(d => d.deviceId === deviceInfo.deviceId);

        if (deviceExists) {
            deviceExists.lastLogin = now;
            deviceExists.ipAddress = deviceInfo.ipAddress;
            deviceExists.userAgent = deviceInfo.userAgent;
        } else {
            user.devices.push({
                deviceId: deviceInfo.deviceId,
                deviceName: deviceInfo.deviceName,
                lastLogin: now,
                ipAddress: deviceInfo.ipAddress,
                userAgent: deviceInfo.userAgent,
            });
        }

        user.lastLogin = now;

        // Generate tokens
        const accessToken = generateAccessToken({
            userId: user._id.toString(),
            role: user.role,
            tenantId: user.tenantId?.toString(),
            branchId: user.branchId?.toString(),
        });

        const refreshToken = generateRefreshToken({
            userId: user._id.toString(),
            role: user.role,
            tenantId: user.tenantId?.toString(),
            branchId: user.branchId?.toString(),
        });

        user.refreshTokens.push(refreshToken);
        if (user.refreshTokens.length > 5) {
            user.refreshTokens = user.refreshTokens.slice(-5);
        }

        // Use findOneAndUpdate to avoid triggering 'pre-save' hooks that might re-hash the password
        await User.findOneAndUpdate(
            { _id: user._id },
            {
                $set: {
                    lastLogin: user.lastLogin,
                    devices: user.devices,
                    refreshTokens: user.refreshTokens
                }
            }
        );

        return { user, accessToken, refreshToken };
    }

    // Refresh access token
    async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
        // Verify refresh token
        const payload = verifyRefreshToken(refreshToken);

        // Find user and verify refresh token exists
        const user = await User.findById(payload.userId).select('+refreshTokens');

        if (!user || !user.isActive) {
            throw new Error('Invalid refresh token');
        }

        if (!user.refreshTokens) user.refreshTokens = [];

        if (!user.refreshTokens.includes(refreshToken)) {
            throw new Error('Invalid refresh token');
        }

        // Generate new tokens
        const newAccessToken = generateAccessToken({
            userId: user._id.toString(),
            role: user.role,
            tenantId: user.tenantId?.toString(),
            branchId: user.branchId?.toString(),
        });

        const newRefreshToken = generateRefreshToken({
            userId: user._id.toString(),
            role: user.role,
            tenantId: user.tenantId?.toString(),
            branchId: user.branchId?.toString(),
        });

        // Replace old refresh token with new one
        user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
        user.refreshTokens.push(newRefreshToken);

        await user.save();

        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }

    // Logout
    async logout(userId: string, refreshToken: string): Promise<void> {
        const user = await User.findById(userId).select('+refreshTokens');

        if (user) {
            if (user.refreshTokens) {
                user.refreshTokens = user.refreshTokens.filter(t => t !== refreshToken);
                await user.save();
            }
        }
    }

    // Logout from all devices
    async logoutAll(userId: string): Promise<void> {
        await User.findByIdAndUpdate(userId, {
            $set: { refreshTokens: [], devices: [] },
        });
    }
}

export default new AuthService();
