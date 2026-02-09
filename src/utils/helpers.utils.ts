import crypto from 'crypto';

export const generateMembershipNumber = (tenantId: string, branchId: string): string => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    const tenantPrefix = tenantId.slice(-4).toUpperCase();
    const branchPrefix = branchId.slice(-2).toUpperCase();

    return `${tenantPrefix}${branchPrefix}${timestamp}${random}`;
};

export const generateReferralCode = (userId: string): string => {
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    const userPrefix = userId.slice(-4).toUpperCase();

    return `${userPrefix}${random}`;
};

export const generateInvoiceNumber = (tenantId: string, type: string = 'INV'): string => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const timestamp = Date.now().toString().slice(-6);
    const tenantPrefix = tenantId.slice(-3).toUpperCase();

    return `${type}-${tenantPrefix}-${year}${month}-${timestamp}`;
};

export const generateSKU = (category: string, productName: string): string => {
    const categoryCode = category.slice(0, 3).toUpperCase();
    const nameCode = productName.replace(/\s+/g, '').slice(0, 4).toUpperCase();
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();

    return `${categoryCode}-${nameCode}-${random}`;
};

export const slugify = (text: string): string => {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
};

export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
    }).format(amount);
};

export const calculateBMI = (weight: number, height: number): number => {
    // weight in kg, height in cm
    const heightInMeters = height / 100;
    return parseFloat((weight / (heightInMeters * heightInMeters)).toFixed(2));
};

export const calculateAge = (dateOfBirth: Date): number => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
};

export const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

export const addMonths = (date: Date, months: number): Date => {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
};

export const getDaysBetween = (startDate: Date, endDate: Date): number => {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((endDate.getTime() - startDate.getTime()) / oneDay));
};
