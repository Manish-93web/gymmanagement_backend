import { redisUtils } from '../config/redis';
import { config } from '../config/config';

export const generateOTP = (): string => {
    const length = config.otp.length;
    const digits = '0123456789';
    let otp = '';

    for (let i = 0; i < length; i++) {
        otp += digits[Math.floor(Math.random() * digits.length)];
    }

    return otp;
};

export const storeOTP = async (
    identifier: string,
    otp: string,
    type: 'email' | 'mobile'
): Promise<void> => {
    const key = `otp:${type}:${identifier}`;
    const expirySeconds = config.otp.expiryMinutes * 60;

    await redisUtils.setEx(key, otp, expirySeconds);
};

export const verifyOTP = async (
    identifier: string,
    otp: string,
    type: 'email' | 'mobile'
): Promise<boolean> => {
    const key = `otp:${type}:${identifier}`;
    const storedOTP = await redisUtils.get(key);

    if (!storedOTP || storedOTP !== otp) {
        return false;
    }

    // Delete OTP after successful verification
    await redisUtils.del(key);
    return true;
};

export const deleteOTP = async (
    identifier: string,
    type: 'email' | 'mobile'
): Promise<void> => {
    const key = `otp:${type}:${identifier}`;
    await redisUtils.del(key);
};
