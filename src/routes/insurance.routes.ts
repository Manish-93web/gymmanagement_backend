import { Router, Request, Response, NextFunction } from 'express'
import crypto from 'crypto'
import mongoose from 'mongoose'
import { authenticate } from '../middleware/auth.middleware'
import { requireAnyRole } from '../middleware/rbac.middleware'
import { tenantContext } from '../middleware/tenant.middleware'
import WellnessScore from '../models/WellnessScore.model'
import InsuranceLink from '../models/InsuranceLink.model'
import Attendance from '../models/Attendance.model'
import Subscription from '../models/Subscription.model'
import Member from '../models/Member.model'

const router = Router()
router.use(authenticate)
router.use(tenantContext)

// ── GET /wellness-scores — admin: paginated list for current month ─────────────
router.get(
  '/wellness-scores',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const now      = new Date()
      const month    = Number(req.query.month) || now.getMonth() + 1
      const year     = Number(req.query.year)  || now.getFullYear()
      const page     = Math.max(1, Number(req.query.page) || 1)
      const limit    = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
      const skip     = (page - 1) * limit

      const filter: any = { tenantId, 'period.month': month, 'period.year': year }

      const [scores, total] = await Promise.all([
        WellnessScore.find(filter)
          .populate('memberId', 'firstName lastName membershipNumber email')
          .sort({ score: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        WellnessScore.countDocuments(filter),
      ])

      return res.json({ success: true, data: scores, total, page, limit })
    } catch (err) { next(err) }
  }
)

// ── POST /wellness-scores/calculate/:memberId — admin/staff ───────────────────
router.post(
  '/wellness-scores/calculate/:memberId',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'admin', 'staff'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const memberId = req.params.memberId as string

      if (!mongoose.Types.ObjectId.isValid(memberId)) {
        return res.status(400).json({ success: false, message: 'Invalid memberId' })
      }

      const member = await Member.findOne({ _id: memberId, tenantId }).lean()
      if (!member) return res.status(404).json({ success: false, message: 'Member not found' })

      const now   = new Date()
      const month = now.getMonth() + 1
      const year  = now.getFullYear()

      // Sub-score 1: Attendance (max 20) — visits in last 30 days
      let attendanceScore = 0
      try {
        const thirtyDaysAgo = new Date(now)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const visits = await Attendance.countDocuments({
          tenantId,
          memberId: new mongoose.Types.ObjectId(memberId),
          checkInTime: { $gte: thirtyDaysAgo },
        })
        // 16+ visits = 20 pts, scale linearly; max 20
        attendanceScore = Math.min(20, Math.round((visits / 16) * 20))
      } catch (_) { attendanceScore = 0 }

      // Sub-score 2: Plan adherence (max 20) — active subscription
      let planAdherenceScore = 0
      try {
        const activeSub = await Subscription.findOne({
          tenantId,
          memberId: new mongoose.Types.ObjectId(memberId),
          status: 'active',
          endDate: { $gte: now },
        }).lean()
        planAdherenceScore = activeSub ? 20 : 0
      } catch (_) { planAdherenceScore = 0 }

      // Sub-score 3: Step challenges (max 20) — achieved days in active challenges
      let stepChallengesScore = 0
      try {
        const StepChallengeProgress = (await import('../models/StepChallengeProgress.model')).default
        const thirtyDaysAgo = new Date(now)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const achieved = await StepChallengeProgress.countDocuments({
          tenantId,
          memberId: memberId,
          achieved: true,
          date: { $gte: thirtyDaysAgo },
        })
        // 20+ achieved days = 20 pts
        stepChallengesScore = Math.min(20, Math.round((achieved / 20) * 20))
      } catch (_) { stepChallengesScore = 10 }

      // Sub-score 4: Class attendance (max 20)
      let classAttendanceScore = 10
      try {
        const Booking = (await import('../models/Booking.model')).default
        const thirtyDaysAgo = new Date(now)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const bookings = await Booking.countDocuments({
          tenantId,
          memberId: new mongoose.Types.ObjectId(memberId),
          status: 'attended',
          createdAt: { $gte: thirtyDaysAgo },
        })
        // 8+ attended classes = 20 pts
        classAttendanceScore = Math.min(20, Math.round((bookings / 8) * 20))
      } catch (_) { classAttendanceScore = 10 }

      // Sub-score 5: Nutrition compliance (max 20) — NutritionLog entries in last 30 days
      let nutritionComplianceScore = 10
      try {
        const NutritionLog = (await import('../models/NutritionLog.model')).default
        const thirtyDaysAgo = new Date(now)
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const logs = await NutritionLog.countDocuments({
          tenantId,
          memberId: new mongoose.Types.ObjectId(memberId),
          date: { $gte: thirtyDaysAgo },
        })
        // 20+ log days = 20 pts
        nutritionComplianceScore = Math.min(20, Math.round((logs / 20) * 20))
      } catch (_) { nutritionComplianceScore = 10 }

      const totalScore = Math.min(
        100,
        attendanceScore + planAdherenceScore + stepChallengesScore +
        classAttendanceScore + nutritionComplianceScore
      )

      // Upsert score for this month
      const wellnessScore = await WellnessScore.findOneAndUpdate(
        { tenantId, memberId: new mongoose.Types.ObjectId(memberId), 'period.month': month, 'period.year': year },
        {
          $set: {
            tenantId,
            memberId:   new mongoose.Types.ObjectId(memberId),
            score:      totalScore,
            breakdown: {
              attendance:          attendanceScore,
              planAdherence:       planAdherenceScore,
              stepChallenges:      stepChallengesScore,
              classAttendance:     classAttendanceScore,
              nutritionCompliance: nutritionComplianceScore,
            },
            period:       { month, year },
            calculatedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      )

      return res.status(200).json({ success: true, data: wellnessScore })
    } catch (err) { next(err) }
  }
)

// ── GET /wellness-scores/my — member: own score history ──────────────────────
router.get(
  '/wellness-scores/my',
  requireAnyRole('member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const userId   = (req as any).user?._id

      // Resolve memberId from userId
      const member = await Member.findOne({ tenantId, userId }).lean()
      if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' })

      const scores = await WellnessScore.find({ tenantId, memberId: member._id })
        .sort({ 'period.year': -1, 'period.month': -1 })
        .lean()

      return res.json({ success: true, data: scores })
    } catch (err) { next(err) }
  }
)

// ── POST /wellness-scores/:id/share — member: share with insurer ──────────────
router.post(
  '/wellness-scores/:id/share',
  requireAnyRole('member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const userId   = (req as any).user?._id
      const { insurerId } = req.body

      const member = await Member.findOne({ tenantId, userId }).lean()
      if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' })

      const wellnessScore = await WellnessScore.findOne({
        _id: req.params.id,
        tenantId,
        memberId: member._id,
      })
      if (!wellnessScore) return res.status(404).json({ success: false, message: 'Wellness score not found' })

      const shareToken = crypto.randomUUID()
      wellnessScore.sharedWithInsurer = true
      wellnessScore.shareToken        = shareToken
      if (insurerId) wellnessScore.insurerId = insurerId
      await wellnessScore.save()

      return res.json({ success: true, data: { shareToken, score: wellnessScore.score } })
    } catch (err) { next(err) }
  }
)

// ── GET /insurance-links — admin: list all linked policies ───────────────────
router.get(
  '/insurance-links',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const { status, page = 1, limit = 20 } = req.query

      const filter: any = { tenantId }
      if (status) filter.status = status

      const skip = (Number(page) - 1) * Number(limit)

      const [links, total] = await Promise.all([
        InsuranceLink.find(filter)
          .populate('memberId', 'firstName lastName membershipNumber email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        InsuranceLink.countDocuments(filter),
      ])

      return res.json({ success: true, data: links, total, page: Number(page), limit: Number(limit) })
    } catch (err) { next(err) }
  }
)

// ── GET /insurance-links/my — member: own insurance links ────────────────────
router.get(
  '/insurance-links/my',
  requireAnyRole('member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const userId   = (req as any).user?._id

      const member = await Member.findOne({ tenantId, userId }).lean()
      if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' })

      const links = await InsuranceLink.find({ tenantId, memberId: member._id })
        .sort({ createdAt: -1 })
        .lean()

      return res.json({ success: true, data: links })
    } catch (err) { next(err) }
  }
)

// ── POST /insurance-links — member: add insurance policy ─────────────────────
router.post(
  '/insurance-links',
  requireAnyRole('member'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const userId   = (req as any).user?._id

      const member = await Member.findOne({ tenantId, userId }).lean()
      if (!member) return res.status(404).json({ success: false, message: 'Member profile not found' })

      const {
        insurerName, policyNumber, policyType, expiryDate,
        irdaiRegistrationNumber, premiumDiscountPercent,
      } = req.body

      if (!insurerName || !policyNumber || !policyType || !expiryDate) {
        return res.status(400).json({
          success: false,
          message: 'insurerName, policyNumber, policyType, and expiryDate are required',
        })
      }

      const validTypes = ['health', 'life', 'accident', 'critical_illness']
      if (!validTypes.includes(policyType)) {
        return res.status(400).json({ success: false, message: `policyType must be one of: ${validTypes.join(', ')}` })
      }

      // IRDAI reg number: 9-digit numeric
      if (irdaiRegistrationNumber && !/^\d{9}$/.test(irdaiRegistrationNumber)) {
        return res.status(400).json({ success: false, message: 'IRDAI registration number must be exactly 9 digits' })
      }

      const link = await InsuranceLink.create({
        tenantId,
        memberId:               member._id,
        insurerName,
        policyNumber,
        policyType,
        expiryDate:             new Date(expiryDate),
        irdaiRegistrationNumber,
        premiumDiscountPercent: premiumDiscountPercent ?? 0,
        status:                 'pending_verification',
      })

      return res.status(201).json({ success: true, data: link })
    } catch (err) { next(err) }
  }
)

// ── PUT /insurance-links/:id/verify — admin/staff: verify policy ──────────────
router.put(
  '/insurance-links/:id/verify',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'admin', 'staff'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId

      const link = await InsuranceLink.findOne({ _id: req.params.id, tenantId })
      if (!link) return res.status(404).json({ success: false, message: 'Insurance link not found' })

      link.status     = 'active'
      link.verifiedAt = new Date()
      if (req.body.premiumDiscountPercent != null) {
        link.premiumDiscountPercent = Number(req.body.premiumDiscountPercent)
      }
      await link.save()

      return res.json({ success: true, data: link })
    } catch (err) { next(err) }
  }
)

// ── DELETE /insurance-links/:id — member/admin: cancel policy link ────────────
router.delete(
  '/insurance-links/:id',
  requireAnyRole('member', 'gym_owner', 'branch_manager', 'super_admin', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId
      const userRole = (req as any).user?.role
      const userId   = (req as any).user?._id

      const link = await InsuranceLink.findOne({ _id: req.params.id, tenantId })
      if (!link) return res.status(404).json({ success: false, message: 'Insurance link not found' })

      // Members can only cancel their own links
      if (userRole === 'member') {
        const member = await Member.findOne({ tenantId, userId }).lean()
        if (!member || String(link.memberId) !== String(member._id)) {
          return res.status(403).json({ success: false, message: 'Forbidden' })
        }
      }

      link.status = 'cancelled'
      await link.save()

      return res.json({ success: true, message: 'Insurance link cancelled' })
    } catch (err) { next(err) }
  }
)

export default router
