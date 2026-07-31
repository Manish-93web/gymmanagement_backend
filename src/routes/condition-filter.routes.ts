import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import {
  checkFoodConstraints,
  filterMealPlan,
  mergeConstraints,
  CONDITION_CONSTRAINTS,
} from '../services/condition-constraint.service';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── Helper: fetch member medical conditions ──────────────────────────────────
async function getMemberConditions(
  memberId: string,
  tenantId: any
): Promise<string[]> {
  const Member = require('../models/Member.model').default;
  const member = await Member.findOne({ _id: memberId, tenantId })
    .select('healthInfo.medicalConditions')
    .lean();
  return (member as any)?.healthInfo?.medicalConditions ?? [];
}

// ─── POST /condition-filter/check-food ───────────────────────────────────────
// Check if a food is safe for a member's (or explicitly provided) conditions.
// Returns: { isAllowed, violations, safeAlternatives }
router.post(
  '/check-food',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const { foodName, memberId, conditions: bodyConditions } = req.body;

      if (!foodName) {
        return res
          .status(400)
          .json({ success: false, message: 'foodName is required' });
      }

      // Resolve conditions: from member if memberId provided, else from body
      const conditions: string[] =
        memberId
          ? await getMemberConditions(memberId, tenantId)
          : Array.isArray(bodyConditions)
          ? bodyConditions
          : [];

      const result = checkFoodConstraints(foodName, conditions);

      // Build safe alternatives from the prefer list of violated conditions
      const safeAlternativeSet = new Set<string>();
      for (const v of result.violations) {
        const key = v.condition.toLowerCase().replace(/[\s_-]/g, '');
        const constraint = CONDITION_CONSTRAINTS[key];
        if (constraint) {
          constraint.prefer.slice(0, 4).forEach((p) => safeAlternativeSet.add(p));
        }
      }

      return res.json({
        success: true,
        data: {
          foodName,
          conditions,
          isAllowed: result.isAllowed,
          violations: result.violations,
          safeAlternatives: Array.from(safeAlternativeSet).slice(0, 6),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /condition-filter/filter-meal-plan ─────────────────────────────────
// Filter an entire meal plan array against a member's (or provided) conditions.
// Returns: { safe, flagged, summary }
router.post(
  '/filter-meal-plan',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const {
        mealPlan,
        memberId,
        conditions: bodyConditions,
      } = req.body;

      if (!Array.isArray(mealPlan) || mealPlan.length === 0) {
        return res
          .status(400)
          .json({ success: false, message: 'mealPlan array is required' });
      }

      const conditions: string[] =
        memberId
          ? await getMemberConditions(memberId, tenantId)
          : Array.isArray(bodyConditions)
          ? bodyConditions
          : [];

      const result = filterMealPlan(mealPlan, conditions);

      const conditionLabel =
        conditions.length > 0 ? conditions.join(', ') : 'no conditions';
      const summary =
        result.flagged.length === 0
          ? `All ${mealPlan.length} foods are safe for ${conditionLabel}.`
          : `${result.flagged.length} of ${mealPlan.length} foods flagged for ${conditionLabel}.`;

      return res.json({
        success: true,
        data: {
          conditions,
          safe: result.safe,
          flagged: result.flagged,
          summary,
          totalItems: mealPlan.length,
          safeCount: result.safe.length,
          flaggedCount: result.flagged.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /condition-filter/member/:memberId/constraints ──────────────────────
// Returns merged constraint rules for a member based on their medical conditions.
router.get(
  '/member/:memberId/constraints',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const memberId = req.params.memberId as string;

      const conditions = await getMemberConditions(memberId, tenantId);

      if (conditions.length === 0) {
        return res.json({
          success: true,
          data: {
            memberId,
            conditions: [],
            avoidList: [],
            preferList: [],
            macroLimits: {},
            alertMessages: [],
            message: 'No medical conditions recorded for this member.',
          },
        });
      }

      const merged = mergeConstraints(conditions);

      return res.json({
        success: true,
        data: {
          memberId,
          conditions,
          ...merged,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /condition-filter/suggest-alternatives ─────────────────────────────
// Given a flagged food and conditions, return safe food alternatives.
router.post(
  '/suggest-alternatives',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { foodName, conditions } = req.body;

      if (!foodName) {
        return res
          .status(400)
          .json({ success: false, message: 'foodName is required' });
      }

      const resolvedConditions: string[] = Array.isArray(conditions)
        ? conditions
        : [];

      // Gather prefer lists from all relevant conditions
      const alternativeSet = new Set<string>();
      for (const condition of resolvedConditions) {
        const key = condition.toLowerCase().replace(/[\s_-]/g, '');
        const constraint = CONDITION_CONSTRAINTS[key];
        if (constraint) {
          constraint.prefer.forEach((p) => alternativeSet.add(p));
        }
      }

      // Determine which conditions this food violates
      const result = checkFoodConstraints(foodName, resolvedConditions);

      return res.json({
        success: true,
        data: {
          foodName,
          conditions: resolvedConditions,
          isViolation: !result.isAllowed,
          violations: result.violations,
          alternatives: Array.from(alternativeSet),
          message:
            alternativeSet.size > 0
              ? `Consider these alternatives safe for ${resolvedConditions.join(', ')}.`
              : 'No specific alternatives found — consult a nutritionist.',
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
