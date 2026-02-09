import jwt from 'jsonwebtoken';
import { config } from '../config/config';

export interface JWTPayload {
    userId: string;
    role: string;
    tenantId?: string;
    branchId?: string;
}

export const generateAccessToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, config.jwt.secret as jwt.Secret, {
        expiresIn: config.jwt.expiresIn as any,
    });
};

export const generateRefreshToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, config.jwt.refreshSecret as jwt.Secret, {
        expiresIn: config.jwt.refreshExpiresIn as any,
    });
};

export const verifyAccessToken = (token: string): JWTPayload => {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
};

export const verifyRefreshToken = (token: string): JWTPayload => {
    return jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;
};

export const generateTokens = (userId: string) => {
    const payload: JWTPayload = { userId, role: 'member' };
    return {
        accessToken: generateAccessToken(payload),
        refreshToken: generateRefreshToken(payload),
    };
};
