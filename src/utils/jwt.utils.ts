import jwt from 'jsonwebtoken';
import { config } from '../config/config';

export interface JWTPayload {
    userId: string;
    role: string;
    tenantId?: string;
    branchId?: string;
}

export const generateAccessToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
    });
};

export const generateRefreshToken = (payload: JWTPayload): string => {
    return jwt.sign(payload, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiresIn,
    });
};

export const verifyAccessToken = (token: string): JWTPayload => {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
};

export const verifyRefreshToken = (token: string): JWTPayload => {
    return jwt.verify(token, config.jwt.refreshSecret) as JWTPayload;
};
