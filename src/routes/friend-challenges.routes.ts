import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import FriendChallenge from '../models/FriendChallenge.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

const unitForType = (type: string): string => {
  const map: Record<string, string> = {
    steps: 'steps',
    workouts: 'sessions',
    calories: 'kcal',
    attendance: 'sessions',
    weight_loss: 'kg',
  };
  return map[type] ?? type;
};

// GET / — all challenges where user is challenger or challenged
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();
    const { status } = req.query;

    const filter: any = {
      tenantId,
      $or: [{ challengerId: userId }, { challengedId: userId }],
    };
    if (status) filter.status = status;

    const challenges = await FriendChallenge.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, data: challenges });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /sent
router.get('/sent', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();
    const challenges = await FriendChallenge.find({ tenantId, challengerId: userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: challenges });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /received
router.get('/received', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();
    const challenges = await FriendChallenge.find({ tenantId, challengedId: userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: challenges });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /active
router.get('/active', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();
    const challenges = await FriendChallenge.find({
      tenantId,
      status: 'active',
      $or: [{ challengerId: userId }, { challengedId: userId }],
    }).sort({ startDate: -1 });
    res.json({ success: true, data: challenges });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();

    const [sent, received, won, pending] = await Promise.all([
      FriendChallenge.countDocuments({ tenantId, challengerId: userId }),
      FriendChallenge.countDocuments({ tenantId, challengedId: userId }),
      FriendChallenge.countDocuments({ tenantId, winnerId: userId }),
      FriendChallenge.countDocuments({
        tenantId,
        status: 'pending',
        $or: [{ challengerId: userId }, { challengedId: userId }],
      }),
    ]);

    const completed = await FriendChallenge.countDocuments({
      tenantId,
      status: 'completed',
      $or: [{ challengerId: userId }, { challengedId: userId }],
    });
    const lost = completed - won;

    res.json({ success: true, data: { sent, received, won, lost: lost < 0 ? 0 : lost, pending } });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();
    const challenge = await FriendChallenge.findOne({ _id: req.params.id, tenantId });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.challengerId !== userId && challenge.challengedId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, data: challenge });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST / — create a new challenge
router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const user = (req as any).user;
    const userId = user._id.toString();
    const userName = user.name || user.email || 'Member';

    const { challengedId, challengedName, type, title, description, targetValue, durationDays, message, rewardPoints } = req.body;

    if (!challengedId || !type || !title || !targetValue || !durationDays) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (challengedId === userId) {
      return res.status(400).json({ success: false, message: 'Cannot challenge yourself' });
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + Number(durationDays) * 24 * 60 * 60 * 1000);

    const challenge = await FriendChallenge.create({
      tenantId,
      challengerId: userId,
      challengerName: userName,
      challengedId,
      challengedName: challengedName || 'Member',
      type,
      title,
      description,
      targetValue: Number(targetValue),
      unit: unitForType(type),
      durationDays: Number(durationDays),
      startDate,
      endDate,
      status: 'pending',
      challengerProgress: 0,
      challengedProgress: 0,
      rewardPoints: rewardPoints ?? 50,
      message,
    });

    res.status(201).json({ success: true, data: challenge });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /:id/accept
router.patch('/:id/accept', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();

    const challenge = await FriendChallenge.findOne({ _id: req.params.id, tenantId });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.challengedId !== userId) return res.status(403).json({ success: false, message: 'Only the challenged member can accept' });
    if (challenge.status !== 'pending') return res.status(400).json({ success: false, message: 'Challenge is not pending' });

    const now = new Date();
    const endDate = new Date(now.getTime() + challenge.durationDays * 24 * 60 * 60 * 1000);

    challenge.status = 'active';
    challenge.acceptedAt = now;
    challenge.startDate = now;
    challenge.endDate = endDate;
    await challenge.save();

    res.json({ success: true, data: challenge });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /:id/decline
router.patch('/:id/decline', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();

    const challenge = await FriendChallenge.findOne({ _id: req.params.id, tenantId });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.challengedId !== userId) return res.status(403).json({ success: false, message: 'Only the challenged member can decline' });
    if (challenge.status !== 'pending') return res.status(400).json({ success: false, message: 'Challenge is not pending' });

    challenge.status = 'declined';
    await challenge.save();

    res.json({ success: true, data: challenge });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /:id/progress — update progress for the current user
router.patch('/:id/progress', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();
    const { progress } = req.body;

    if (progress === undefined || progress === null) {
      return res.status(400).json({ success: false, message: 'progress is required' });
    }

    const challenge = await FriendChallenge.findOne({ _id: req.params.id, tenantId });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.status !== 'active') return res.status(400).json({ success: false, message: 'Challenge is not active' });

    const isChallenger = challenge.challengerId === userId;
    const isChallenged = challenge.challengedId === userId;

    if (!isChallenger && !isChallenged) {
      return res.status(403).json({ success: false, message: 'You are not part of this challenge' });
    }

    if (isChallenger) {
      challenge.challengerProgress = Number(progress);
    } else {
      challenge.challengedProgress = Number(progress);
    }

    const challengerDone = challenge.challengerProgress >= challenge.targetValue;
    const challengedDone = challenge.challengedProgress >= challenge.targetValue;

    if (challengerDone || challengedDone) {
      challenge.status = 'completed';
      challenge.completedAt = new Date();

      if (challengerDone && challengedDone) {
        if (challenge.challengerProgress >= challenge.challengedProgress) {
          challenge.winnerId = challenge.challengerId;
        } else {
          challenge.winnerId = challenge.challengedId;
        }
      } else if (challengerDone) {
        challenge.winnerId = challenge.challengerId;
      } else {
        challenge.winnerId = challenge.challengedId;
      }
    }

    await challenge.save();
    res.json({ success: true, data: challenge });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /:id/cancel — challenger cancels (pending only)
router.patch('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user._id.toString();

    const challenge = await FriendChallenge.findOne({ _id: req.params.id, tenantId });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });
    if (challenge.challengerId !== userId) return res.status(403).json({ success: false, message: 'Only the challenger can cancel' });
    if (challenge.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending challenges can be cancelled' });

    challenge.status = 'cancelled';
    await challenge.save();

    res.json({ success: true, data: challenge });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /:id — admin / gym_owner only
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const role = (req as any).user?.role;

    if (!['gym_owner', 'admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    const challenge = await FriendChallenge.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' });

    res.json({ success: true, message: 'Challenge deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
