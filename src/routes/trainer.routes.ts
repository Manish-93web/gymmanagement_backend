import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import trainerController from '../controllers/trainer.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import CommissionLog from '../models/CommissionLog.model';
import TrainerModel from '../models/Trainer.model';

const router = Router();

router.use(authenticate);

router.post('/', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), trainerController.createTrainer.bind(trainerController));
router.get('/', authenticate, trainerController.getTrainers.bind(trainerController));
router.get('/:trainerId', authenticate, trainerController.getTrainerById.bind(trainerController));
router.put('/:trainerId', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), trainerController.updateTrainer.bind(trainerController));
router.post('/:trainerId/certifications', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), trainerController.addCertification.bind(trainerController));
router.put('/:trainerId/availability', requireAnyRole('trainer', 'branch_manager', 'super_admin'), trainerController.updateAvailability.bind(trainerController));
router.post('/:trainerId/ratings', requireAnyRole('member', 'super_admin'), trainerController.addRating.bind(trainerController));
router.get('/:trainerId/stats', requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'super_admin'), trainerController.getTrainerStats.bind(trainerController));
router.delete('/:trainerId', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), trainerController.deleteTrainer.bind(trainerController));

// ─── Commission routes ────────────────────────────────────────────────────────

// List commissions for a trainer (trainer sees own, owner sees all)
router.get('/:trainerId/commissions', authenticate, async (req: Request, res: Response) => {
    try {
        const { status, month, year, page = '1', limit = '20' } = req.query as Record<string, string>;
        const filter: Record<string, any> = {
            trainerId: req.params.trainerId,
            tenantId: (req as any).tenantId,
        };
        if (status) filter.status = status;
        if (month) filter.month = +month;
        if (year) filter.year = +year;
        const skip = (+page - 1) * +limit;
        const [logs, total] = await Promise.all([
            CommissionLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(+limit).lean(),
            CommissionLog.countDocuments(filter),
        ]);
        const summary = await CommissionLog.aggregate([
            { $match: filter },
            { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ]);
        res.json({ success: true, data: { logs, total, page: +page, summary } });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Create manual commission entry
router.post('/:trainerId/commissions', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const { type, amount, baseAmount, percentage, description, month, year, notes, referenceId, referenceType } = req.body;
        if (!type || !amount || !description) {
            res.status(400).json({ success: false, message: 'type, amount, description required' });
            return;
        }
        const trainer = await TrainerModel.findOne({ _id: req.params.trainerId, tenantId: (req as any).tenantId });
        if (!trainer) { res.status(404).json({ success: false, message: 'Trainer not found' }); return; }
        const now = new Date();
        const log = await CommissionLog.create({
            trainerId: req.params.trainerId,
            tenantId: (req as any).tenantId,
            branchId: trainer.branchId ?? trainer.branches?.[0],
            type, amount, baseAmount: baseAmount ?? 0,
            percentage: percentage ?? 0,
            referenceId, referenceType,
            description, notes,
            month: month ?? now.getMonth() + 1,
            year:  year  ?? now.getFullYear(),
            status: 'pending',
        });
        res.status(201).json({ success: true, data: log });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Approve a commission entry
router.put('/:trainerId/commissions/:logId/approve', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const log = await CommissionLog.findOneAndUpdate(
            { _id: req.params.logId, trainerId: req.params.trainerId, tenantId: (req as any).tenantId, status: 'pending' },
            { status: 'approved', notes: req.body.notes },
            { new: true },
        );
        if (!log) { res.status(404).json({ success: false, message: 'Commission log not found or not in pending state' }); return; }
        res.json({ success: true, data: log });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Mark commission as paid
router.put('/:trainerId/commissions/:logId/pay', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?._id ?? (req as any).user?.id;
        const log = await CommissionLog.findOneAndUpdate(
            { _id: req.params.logId, trainerId: req.params.trainerId, tenantId: (req as any).tenantId, status: { $in: ['pending', 'approved'] } },
            { status: 'paid', paidAt: new Date(), paidBy: userId, notes: req.body.notes },
            { new: true },
        );
        if (!log) { res.status(404).json({ success: false, message: 'Commission log not found or already paid' }); return; }
        res.json({ success: true, data: log });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// All-trainers commission summary for gym owner
router.get('/commissions/summary', requireAnyRole('gym_owner', 'branch_manager', 'super_admin'), async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).tenantId;
        const { month, year } = req.query as Record<string, string>;
        const match: Record<string, any> = tenantId
            ? { tenantId: new mongoose.Types.ObjectId(tenantId) }
            : {};
        if (month) match.month = +month;
        if (year)  match.year  = +year;
        const summary = await CommissionLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { trainerId: '$trainerId', status: '$status' },
                    total: { $sum: '$amount' },
                    count: { $sum: 1 },
                },
            },
            {
                $group: {
                    _id: '$_id.trainerId',
                    statuses: { $push: { status: '$_id.status', total: '$total', count: '$count' } },
                    totalCommissions: { $sum: '$total' },
                },
            },
            {
                $lookup: {
                    from: 'trainers',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'trainer',
                },
            },
            { $unwind: { path: '$trainer', preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'trainer.userId',
                    foreignField: '_id',
                    as: 'trainerUser',
                },
            },
            { $unwind: { path: '$trainerUser', preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    trainerName: { $ifNull: ['$trainerUser.name', { $ifNull: ['$trainerUser.email', 'Unknown'] }] },
                    totalCommissions: 1,
                    statuses: 1,
                },
            },
            { $sort: { totalCommissions: -1 } },
        ]);
        res.json({ success: true, data: summary });
    } catch (err: any) {
        console.error('[commissions/summary]', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
});

export default router;
