import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.model';
import { generateTokens } from '../utils/jwt.utils';
import { config } from '../config/config';

const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

class GoogleAuthService {
    /**
     * Get Google OAuth URL
     */
    getAuthUrl(): string {
        const scopes = [
            'https://www.googleapis.com/auth/userinfo.profile',
            'https://www.googleapis.com/auth/userinfo.email',
        ];

        return client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent',
        });
    }

    /**
     * Verify Google OAuth token and get user info
     */
    async verifyToken(token: string) {
        try {
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();

            if (!payload) {
                throw new Error('Invalid token payload');
            }

            return {
                googleId: payload.sub,
                email: payload.email!,
                firstName: payload.given_name || '',
                lastName: payload.family_name || '',
                picture: payload.picture,
                emailVerified: payload.email_verified,
            };
        } catch (error) {
            throw new Error('Invalid Google token');
        }
    }

    /**
     * Handle Google OAuth callback
     */
    async handleCallback(code: string) {
        try {
            // Exchange code for tokens
            const { tokens } = await client.getToken(code);
            client.setCredentials(tokens);

            // Verify the ID token
            if (!tokens.id_token) {
                throw new Error('No ID token received');
            }

            const userInfo = await this.verifyToken(tokens.id_token);

            // Find or create user
            let user = await User.findOne({ email: userInfo.email });

            if (!user) {
                // Create new user
                user = await User.create({
                    email: userInfo.email,
                    firstName: userInfo.firstName,
                    lastName: userInfo.lastName,
                    googleId: userInfo.googleId,
                    profilePicture: userInfo.picture,
                    isEmailVerified: userInfo.emailVerified,
                    role: 'member', // Default role
                    isActive: true,
                    authProvider: 'google',
                });
            } else {
                // Update existing user
                user.googleId = userInfo.googleId;
                user.profilePicture = userInfo.picture;
                user.isEmailVerified = userInfo.emailVerified ?? false;
                await user.save();
            }

            // Generate JWT tokens
            const { accessToken, refreshToken } = generateTokens(user._id.toString());

            // Update refresh token
            if (!user.refreshTokens) user.refreshTokens = [];
            user.refreshTokens.push(refreshToken);
            await user.save();

            return {
                user: {
                    _id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    role: user.role,
                    tenantId: user.tenantId,
                    branchId: user.branchId,
                    profilePicture: user.profilePicture,
                },
                accessToken,
                refreshToken,
            };
        } catch (error) {
            throw new Error('Google authentication failed');
        }
    }

    /**
     * Link Google account to existing user
     */
    async linkAccount(userId: string, token: string) {
        try {
            const userInfo = await this.verifyToken(token);

            // Check if Google account is already linked
            const existingUser = await User.findOne({ googleId: userInfo.googleId });
            if (existingUser && existingUser._id.toString() !== userId) {
                throw new Error('This Google account is already linked to another user');
            }

            // Update user
            const user = await User.findByIdAndUpdate(
                userId,
                {
                    googleId: userInfo.googleId,
                    profilePicture: userInfo.picture,
                    isEmailVerified: true,
                },
                { new: true }
            );

            if (!user) {
                throw new Error('User not found');
            }

            return {
                success: true,
                message: 'Google account linked successfully',
                user: {
                    _id: user._id,
                    email: user.email,
                    googleId: user.googleId,
                    profilePicture: user.profilePicture,
                },
            };
        } catch (error: any) {
            throw new Error(error.message || 'Failed to link Google account');
        }
    }

    /**
     * Unlink Google account
     */
    async unlinkAccount(userId: string) {
        const user = await User.findByIdAndUpdate(
            userId,
            {
                $unset: { googleId: 1 },
            },
            { new: true }
        );

        if (!user) {
            throw new Error('User not found');
        }

        return {
            success: true,
            message: 'Google account unlinked successfully',
        };
    }
}

export default new GoogleAuthService();
