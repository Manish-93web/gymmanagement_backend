import mongoose from 'mongoose';

/**
 * A user account needs a unique email and mobile number. Someone onboarded without them gets a stand-in value,
 * which the app never shows.
 */
const NO_EMAIL_DOMAIN = '@no-email.invalid';
const NO_MOBILE_PREFIX = 'no-mobile-';

export const placeholderEmail = () => `staff.${new mongoose.Types.ObjectId().toString()}${NO_EMAIL_DOMAIN}`;
export const placeholderMobile = () => `${NO_MOBILE_PREFIX}${new mongoose.Types.ObjectId().toString()}`;

/** What the app shows: stand-ins read as empty. */
export const shownEmail = (v?: string) => (v && !v.endsWith(NO_EMAIL_DOMAIN) ? v : '');
export const shownMobile = (v?: string) => (v && !v.startsWith(NO_MOBILE_PREFIX) ? v : '');

/** The same user with stand-in email and mobile blanked, for sending to the browser. */
export function withoutPlaceholders<T extends Record<string, any>>(user: T): T {
    const plain: any = typeof (user as any).toObject === 'function' ? (user as any).toObject() : { ...user };
    if ('email' in plain) plain.email = shownEmail(plain.email);
    if ('mobile' in plain) plain.mobile = shownMobile(plain.mobile);
    return plain;
}
