import { Request } from 'express';
import Member from '../models/Member.model';

/**
 * Resolves the Member document owned by the currently authenticated user
 * (role 'member'), i.e. the Member whose `userId` points back at their own
 * User account. Returns null if the caller has no linked Member record.
 */
export async function getOwnMemberId(req: Request): Promise<string | null> {
    if (!req.user || !req.tenantId) return null;
    const member = await Member.findOne({ tenantId: req.tenantId, userId: req.user._id }).select('_id');
    return member ? (member._id as any).toString() : null;
}
