import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── POST /pricing-simulator/simulate ────────────────────────────────────────
// Forward revenue simulator — NO database writes. Projects future revenue based
// on hypothetical pricing rules applied to attendance demand patterns.
router.post('/simulate', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { rules = [], projectionDays = 30 } = req.body;

    // Pull attendance history to get demand baseline
    const Attendance = require('../models/Attendance.model').default;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const attendanceByHour = await Attendance.aggregate([
      { $match: { tenantId, checkInTime: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: {
            hour: { $hour: '$checkInTime' },
            dayOfWeek: { $dayOfWeek: '$checkInTime' },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    // Build demand map: "hour_dayofweek" → avg daily visits
    const demandMap: Record<string, number> = {};
    for (const d of attendanceByHour) {
      const key = `${d._id.hour}_${d._id.dayOfWeek}`;
      demandMap[key] = d.count / 30;
    }

    // Get current plan prices for baseline revenue-per-visit estimate
    const MembershipPlan = require('../models/MembershipPlan.model').default;
    const plans = await MembershipPlan.find({ tenantId, isActive: true })
      .select('price duration')
      .lean();
    const avgPlanPrice =
      plans.length
        ? plans.reduce((s: number, p: any) => s + (p.price || 0), 0) / plans.length
        : 3000;
    const dailyVisitRevenue = avgPlanPrice / 30; // avg revenue per visit

    // Helper: parse hour from "HH:MM"
    const parseHour = (timeStr: string) => parseInt(timeStr.split(':')[0], 10);

    // Simulate: for each day in projectionDays, calc flat vs dynamic revenue
    let flatRevenue = 0;
    let dynamicRevenue = 0;
    const dailyBreakdown: Array<{
      date: string;
      flatRevenue: number;
      dynamicRevenue: number;
      uplift: number;
    }> = [];

    for (let dayOffset = 1; dayOffset <= projectionDays; dayOffset++) {
      const date = new Date(Date.now() + dayOffset * 86400000);
      const dayOfWeek = date.getDay() + 1; // 1=Sunday … 7=Saturday
      const isWeekend = dayOfWeek === 1 || dayOfWeek === 7;

      let dayFlat = 0;
      let dayDynamic = 0;

      for (let hour = 5; hour <= 22; hour++) {
        const key = `${hour}_${dayOfWeek}`;
        const expectedVisits = demandMap[key] ?? 0.5;
        const slotBaseRevenue = expectedVisits * dailyVisitRevenue;

        dayFlat += slotBaseRevenue;

        // Apply the highest matching rule multiplier for this slot
        let multiplier = 1.0;
        for (const rule of rules) {
          if (rule.dayTypes?.includes('weekday') && isWeekend) continue;
          if (rule.dayTypes?.includes('weekend') && !isWeekend) continue;

          for (const timeRange of rule.peakHours ?? []) {
            const [start, end] = (timeRange as string).split('-').map(parseHour);
            if (hour >= start && hour < end) {
              multiplier = Math.max(multiplier, rule.multiplier ?? 1.0);
              break;
            }
          }
        }

        dayDynamic += slotBaseRevenue * multiplier;
      }

      flatRevenue += dayFlat;
      dynamicRevenue += dayDynamic;

      dailyBreakdown.push({
        date: date.toISOString().slice(0, 10),
        flatRevenue: Math.round(dayFlat),
        dynamicRevenue: Math.round(dayDynamic),
        uplift: Math.round(dayDynamic - dayFlat),
      });
    }

    const upliftAmount = dynamicRevenue - flatRevenue;
    const upliftPercent =
      flatRevenue > 0 ? (upliftAmount / flatRevenue) * 100 : 0;

    // Identify top peak hours from demand map (avg visits > 2/day)
    const peakHoursIdentified = Object.entries(demandMap)
      .filter(([, v]) => v > 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([k]) => {
        const [h] = k.split('_');
        return `${h}:00`;
      });

    return res.json({
      success: true,
      data: {
        projectionDays,
        flatRevenue: Math.round(flatRevenue),
        dynamicRevenue: Math.round(dynamicRevenue),
        upliftAmount: Math.round(upliftAmount),
        upliftPercent: Math.round(upliftPercent * 10) / 10,
        dailyBreakdown,
        peakHoursIdentified,
        summary: `With these pricing rules, you'd earn ₹${Math.round(upliftAmount).toLocaleString('en-IN')} more over ${projectionDays} days (${Math.round(upliftPercent * 10) / 10}% uplift).`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /pricing-simulator/peak-hours ───────────────────────────────────────
// Returns the top 5 peak hours from last 30 days of attendance data.
router.get('/peak-hours', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const Attendance = require('../models/Attendance.model').default;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const hourly = await Attendance.aggregate([
      { $match: { tenantId, checkInTime: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $hour: '$checkInTime' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const peak = hourly.slice(0, 5).map((h: any) => ({
      hour: h._id,
      label: `${h._id}:00`,
      avgDailyVisits: Math.round((h.count / 30) * 10) / 10,
    }));

    return res.json({ success: true, data: peak });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
