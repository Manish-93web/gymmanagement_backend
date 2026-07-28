import { Router, Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import { authenticate } from '../middleware/auth.middleware'
import { requireAnyRole } from '../middleware/rbac.middleware'
import { tenantContext } from '../middleware/tenant.middleware'
import StepChallenge from '../models/StepChallenge.model'
import StepChallengeProgress from '../models/StepChallengeProgress.model'
import WearableData from '../models/WearableData.model'
import Member from '../models/Member.model'

const router = Router()
router.use(authenticate)
router.use(tenantContext)

// ── POST / — create step challenge ───────────────────────────────────────────
router.post(
  '/',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const createdBy = (req as any).user?._id?.toString()
      const {
        title, description, dailyTarget, durationDays = 30,
        startDate, badgeId, badgeName, rewardPoints, isPublic, minPlanCategory,
      } = req.body

      if (!title || !dailyTarget || !startDate) {
        return res.status(400).json({ success: false, message: 'title, dailyTarget, and startDate are required' })
      }

      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + Number(durationDays))

      const now = new Date()
      const autoStatus = now < start ? 'upcoming' : now <= end ? 'active' : 'completed'

      const targetLabel =
        dailyTarget >= 10000 ? '10K' : dailyTarget >= 8000 ? '8K' : '5K'

      const challenge = await StepChallenge.create({
        tenantId,
        title,
        description,
        dailyTarget: Number(dailyTarget),
        durationDays: Number(durationDays),
        startDate: start,
        endDate: end,
        status: autoStatus,
        badgeId,
        badgeName: badgeName || `Step Master ${targetLabel}`,
        rewardPoints: rewardPoints != null ? Number(rewardPoints) : 0,
        isPublic: isPublic !== false,
        minPlanCategory,
        createdBy,
        participants: [],
      })

      return res.status(201).json({ success: true, data: challenge })
    } catch (err) { next(err) }
  }
)

// ── GET / — list challenges for tenant ───────────────────────────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId
    const userRole = (req as any).user?.role
    const { status, activeOnly } = req.query

    const filter: any = { tenantId }
    if (activeOnly === 'true') {
      filter.status = 'active'
    } else if (status) {
      filter.status = status
    }

    // Members only see public challenges
    if (userRole === 'member') filter.isPublic = true

    const challenges = await StepChallenge.find(filter)
      .sort({ startDate: -1 })
      .lean()

    const data = challenges.map(c => ({
      ...c,
      participantCount: c.participants?.length ?? 0,
    }))

    return res.json({ success: true, data })
  } catch (err) { next(err) }
})

// ── GET /:id — single challenge ───────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId
    const challenge = await StepChallenge.findOne({ _id: req.params.id, tenantId }).lean()
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' })

    return res.json({
      success: true,
      data: { ...challenge, participantCount: challenge.participants?.length ?? 0 },
    })
  } catch (err) { next(err) }
})

// ── POST /:id/join ────────────────────────────────────────────────────────────
router.post('/:id/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId
    const { memberId } = req.body
    if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' })

    const challenge = await StepChallenge.findOne({ _id: req.params.id, tenantId })
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' })
    if (!['active', 'upcoming'].includes(challenge.status)) {
      return res.status(400).json({ success: false, message: 'Cannot join a challenge that is not active or upcoming' })
    }

    const alreadyJoined = challenge.participants.some(
      p => String(p.memberId) === String(memberId)
    )
    if (alreadyJoined) {
      return res.status(400).json({ success: false, message: 'Already joined this challenge' })
    }

    challenge.participants.push({
      memberId: new mongoose.Types.ObjectId(memberId),
      joinedAt: new Date(),
      totalSteps: 0,
      daysAchieved: 0,
    })
    await challenge.save()

    return res.json({ success: true, data: { message: 'Joined challenge successfully' } })
  } catch (err) { next(err) }
})

// ── POST /:id/leave ───────────────────────────────────────────────────────────
router.post('/:id/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId
    const { memberId } = req.body
    if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' })

    const challenge = await StepChallenge.findOne({ _id: req.params.id, tenantId })
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' })
    if (challenge.status !== 'upcoming') {
      return res.status(400).json({ success: false, message: 'Can only leave upcoming challenges' })
    }

    const idx = challenge.participants.findIndex(
      p => String(p.memberId) === String(memberId)
    )
    if (idx === -1) return res.status(400).json({ success: false, message: 'Not a participant' })

    challenge.participants.splice(idx, 1)
    await challenge.save()

    return res.json({ success: true })
  } catch (err) { next(err) }
})

// ── GET /:id/leaderboard ──────────────────────────────────────────────────────
router.get('/:id/leaderboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId
    const challenge = await StepChallenge.findOne({ _id: req.params.id, tenantId }).lean()
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' })

    const agg = await StepChallengeProgress.aggregate([
      { $match: { tenantId, challengeId: req.params.id } },
      {
        $group: {
          _id: '$memberId',
          totalSteps:   { $sum: '$stepCount' },
          daysAchieved: { $sum: { $cond: ['$achieved', 1, 0] } },
        },
      },
      { $sort: { totalSteps: -1 } },
      { $limit: 50 },
    ])

    const memberIds = agg.map(a => a._id)
    const members = await Member.find({ _id: { $in: memberIds } })
      .select('firstName lastName membershipNumber')
      .lean()

    const memberMap: Record<string, any> = {}
    members.forEach(m => { memberMap[String(m._id)] = m })

    const leaderboard = agg.map((a, i) => ({
      rank:         i + 1,
      memberId:     a._id,
      member:       memberMap[String(a._id)] ?? null,
      totalSteps:   a.totalSteps,
      daysAchieved: a.daysAchieved,
    }))

    return res.json({ success: true, data: leaderboard })
  } catch (err) { next(err) }
})

// ── GET /:id/my-progress ──────────────────────────────────────────────────────
router.get('/:id/my-progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId
    const { memberId } = req.query
    if (!memberId) {
      return res.status(400).json({ success: false, message: 'memberId query param is required' })
    }

    const challenge = await StepChallenge.findOne({ _id: req.params.id, tenantId }).lean()
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' })

    const progress = await StepChallengeProgress.find({
      tenantId,
      challengeId: req.params.id,
      memberId:    String(memberId),
    })
      .sort({ date: 1 })
      .lean()

    const totalSteps   = progress.reduce((s, p) => s + p.stepCount, 0)
    const daysAchieved = progress.filter(p => p.achieved).length
    const now          = new Date()
    const endDate      = new Date(challenge.endDate)
    const daysRemaining = Math.max(
      0,
      Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    )

    const participant = challenge.participants.find(
      p => String(p.memberId) === String(memberId)
    )
    const rank = participant?.rank ?? null

    return res.json({
      success: true,
      data: {
        progress: progress.map(p => ({
          date:      p.date,
          stepCount: p.stepCount,
          achieved:  p.achieved,
          source:    p.source,
        })),
        summary: {
          totalSteps,
          daysAchieved,
          daysRemaining,
          rank,
          durationDays: challenge.durationDays,
        },
      },
    })
  } catch (err) { next(err) }
})

// ── POST /:id/sync-progress ───────────────────────────────────────────────────
// Looks up WearableData.entries for the given date, upserts a progress record,
// and refreshes participant aggregates + ranks in the challenge document.
router.post('/:id/sync-progress', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId
    const { memberId, date: dateStr, stepCount: manualSteps, source: manualSource } = req.body
    if (!memberId) return res.status(400).json({ success: false, message: 'memberId is required' })

    const challenge = await StepChallenge.findOne({ _id: req.params.id, tenantId })
    if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' })

    const targetDate = new Date(dateStr || Date.now())
    targetDate.setHours(0, 0, 0, 0)

    // Resolve step count — prefer explicit body value, then wearable lookup
    let stepCount = 0
    let source    = 'manual'

    if (manualSteps != null) {
      stepCount = Number(manualSteps)
      source    = manualSource || 'manual'
    } else {
      const wearable = await WearableData.findOne({ tenantId, memberId }).lean()
      if (wearable) {
        const entry = (wearable.entries || []).find(e => {
          const d = new Date(e.date)
          d.setHours(0, 0, 0, 0)
          return d.getTime() === targetDate.getTime()
        })
        if (entry?.steps) {
          stepCount = entry.steps
          source    = wearable.deviceType
        }
      }
    }

    const achieved = stepCount >= challenge.dailyTarget

    await StepChallengeProgress.findOneAndUpdate(
      { tenantId, challengeId: req.params.id, memberId: String(memberId), date: targetDate },
      { $set: { stepCount, targetSteps: challenge.dailyTarget, achieved, source } },
      { upsert: true, new: true }
    )

    // Recompute participant totals
    const allProgress = await StepChallengeProgress.find({
      tenantId,
      challengeId: req.params.id,
      memberId:    String(memberId),
    }).lean()

    const totalSteps   = allProgress.reduce((s, p) => s + p.stepCount, 0)
    const daysAchieved = allProgress.filter(p => p.achieved).length

    const pIdx = challenge.participants.findIndex(
      p => String(p.memberId) === String(memberId)
    )
    if (pIdx >= 0) {
      challenge.participants[pIdx].totalSteps   = totalSteps
      challenge.participants[pIdx].daysAchieved = daysAchieved
    } else {
      // Auto-enrol if not yet a participant (e.g. manual sync by staff)
      challenge.participants.push({
        memberId:     new mongoose.Types.ObjectId(memberId),
        joinedAt:     new Date(),
        totalSteps,
        daysAchieved,
      })
    }

    // Recompute rank for every participant
    const sorted = [...challenge.participants].sort((a, b) => b.totalSteps - a.totalSteps)
    sorted.forEach((p, i) => {
      const idx = challenge.participants.findIndex(
        cp => String(cp.memberId) === String(p.memberId)
      )
      if (idx >= 0) challenge.participants[idx].rank = i + 1
    })

    await challenge.save()

    return res.json({
      success: true,
      data: { stepCount, achieved, totalSteps, daysAchieved },
    })
  } catch (err) { next(err) }
})

// ── DELETE /:id — cancel challenge ────────────────────────────────────────────
router.delete(
  '/:id',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const challenge = await StepChallenge.findOne({ _id: req.params.id, tenantId })
      if (!challenge) return res.status(404).json({ success: false, message: 'Challenge not found' })

      challenge.status = 'cancelled'
      await challenge.save()

      return res.json({ success: true })
    } catch (err) { next(err) }
  }
)

export default router
