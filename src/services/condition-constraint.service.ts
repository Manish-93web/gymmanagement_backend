// ─── Condition Food Constraint Engine ────────────────────────────────────────
// Rule-based (no LLM) — predictable, safe, auditable.
// Each condition maps to foods to avoid, foods to prefer, optional macro limits,
// and a human-readable alert message.

export interface ConditionConstraint {
  avoid: string[];
  prefer: string[];
  macroLimits?: {
    maxCarbs?: number;
    maxFat?: number;
    minProtein?: number;
  };
  alertMessage: string;
}

export const CONDITION_CONSTRAINTS: Record<string, ConditionConstraint> = {
  pcos: {
    avoid: [
      'white rice', 'refined flour', 'maida', 'sugar', 'jaggery',
      'potato chips', 'white bread', 'soda', 'processed', 'fried',
    ],
    prefer: [
      'quinoa', 'oats', 'brown rice', 'leafy greens', 'berries',
      'lean protein', 'fish', 'flaxseeds', 'cinnamon',
    ],
    macroLimits: { maxCarbs: 120 },
    alertMessage:
      'High-glycemic foods worsen PCOS insulin resistance. Avoid refined carbs.',
  },

  type2diabetes: {
    avoid: [
      'white rice', 'sugar', 'jaggery', 'fruit juice', 'soft drink',
      'candy', 'white bread', 'refined flour', 'biscuits', 'sweets',
    ],
    prefer: [
      'dal', 'legumes', 'vegetables', 'nuts', 'seeds',
      'fish', 'eggs', 'bitter gourd', 'fenugreek',
    ],
    macroLimits: { maxCarbs: 100 },
    alertMessage:
      'High-sugar foods spike blood glucose. Choose low-GI alternatives.',
  },

  hypertension: {
    avoid: [
      'salt', 'sodium', 'pickle', 'papad', 'chips', 'processed meat',
      'canned food', 'soy sauce', 'MSG', 'fast food',
    ],
    prefer: [
      'banana', 'spinach', 'flaxseeds', 'garlic', 'oats',
      'beets', 'pomegranate', 'low-fat dairy',
    ],
    alertMessage:
      'High sodium foods raise blood pressure. Limit daily sodium to <2300mg.',
  },

  hypothyroidism: {
    avoid: [
      'soy', 'tofu', 'raw cabbage', 'raw broccoli', 'raw cauliflower',
      'raw kale', 'millet', 'flaxseed',
    ],
    prefer: [
      'iodine-rich', 'selenium-rich', 'seafood', 'eggs',
      'dairy', 'chicken', 'cooked vegetables',
    ],
    alertMessage:
      'Goitrogens (raw cruciferous vegetables, soy) can interfere with thyroid medication. Cook vegetables.',
  },

  insulinresistance: {
    avoid: [
      'white rice', 'sugar', 'honey', 'processed foods',
      'refined carbs', 'fruit juice', 'candy',
    ],
    prefer: [
      'complex carbs', 'fiber', 'protein', 'healthy fats',
      'vinegar', 'cinnamon', 'berries',
    ],
    macroLimits: { maxCarbs: 110 },
    alertMessage:
      'Insulin resistance requires low-GI, high-fiber foods. Avoid simple sugars.',
  },

  gerd: {
    avoid: [
      'tomato', 'citrus', 'lemon', 'orange', 'coffee', 'tea',
      'alcohol', 'chocolate', 'spicy', 'fried', 'onion', 'garlic', 'mint',
    ],
    prefer: [
      'oatmeal', 'ginger', 'banana', 'melon', 'fennel',
      'rice', 'bread', 'lean meat', 'egg whites',
    ],
    alertMessage:
      'Acidic and spicy foods trigger acid reflux. Eat smaller meals, avoid lying down after eating.',
  },

  celiac: {
    avoid: [
      'wheat', 'maida', 'roti', 'bread', 'pasta', 'barley',
      'rye', 'oats', 'chapati', 'biscuits', 'cake', 'beer',
    ],
    prefer: [
      'rice', 'quinoa', 'millet', 'corn', 'potatoes',
      'sorghum', 'buckwheat', 'gluten-free',
    ],
    alertMessage:
      'Gluten (wheat, barley, rye) causes intestinal damage in celiac disease. Strict gluten-free diet required.',
  },

  lactoseintolerance: {
    avoid: [
      'milk', 'cheese', 'butter', 'cream', 'ice cream',
      'paneer', 'curd', 'yogurt', 'ghee', 'whey',
    ],
    prefer: [
      'almond milk', 'coconut milk', 'soy milk', 'lactose-free',
      'calcium-fortified', 'tofu', 'fortified cereals',
    ],
    alertMessage:
      'Dairy products cause digestive distress. Use lactose-free alternatives or take lactase enzyme.',
  },

  skinhealth: {
    avoid: [
      'sugar', 'dairy', 'refined carbs', 'fried foods',
      'trans fats', 'alcohol', 'processed foods',
    ],
    prefer: [
      'vitamin C', 'vitamin E', 'omega-3', 'zinc', 'antioxidants',
      'berries', 'nuts', 'fish', 'avocado', 'carrots',
    ],
    alertMessage:
      'High-sugar and dairy foods can trigger acne and inflammation. Focus on antioxidant-rich foods.',
  },
};

// ─── Check a single food against one or more conditions ──────────────────────
export function checkFoodConstraints(
  foodName: string,
  conditions: string[]
): {
  isAllowed: boolean;
  violations: Array<{ condition: string; reason: string; alertMessage: string }>;
} {
  const violations: Array<{
    condition: string;
    reason: string;
    alertMessage: string;
  }> = [];

  const foodLower = foodName.toLowerCase();

  for (const condition of conditions) {
    // Normalise: "Type 2 Diabetes" → "type2diabetes", "PCOS" → "pcos"
    const normalised = condition.toLowerCase().replace(/[\s_-]/g, '');
    const constraints = CONDITION_CONSTRAINTS[normalised];
    if (!constraints) continue;

    const avoidMatch = constraints.avoid.find((keyword) =>
      foodLower.includes(keyword.toLowerCase())
    );

    if (avoidMatch) {
      violations.push({
        condition,
        reason: `"${foodName}" contains "${avoidMatch}" which should be avoided for ${condition}`,
        alertMessage: constraints.alertMessage,
      });
    }
  }

  return { isAllowed: violations.length === 0, violations };
}

// ─── Filter a complete meal plan for safety ───────────────────────────────────
export function filterMealPlan(
  mealPlan: Array<{ name: string; [key: string]: any }>,
  conditions: string[]
): {
  safe: Array<any>;
  flagged: Array<{ item: any; violations: any[] }>;
} {
  const safe: any[] = [];
  const flagged: Array<{ item: any; violations: any[] }> = [];

  for (const item of mealPlan) {
    const result = checkFoodConstraints(item.name, conditions);
    if (result.isAllowed) {
      safe.push(item);
    } else {
      flagged.push({ item, violations: result.violations });
    }
  }

  return { safe, flagged };
}

// ─── Merge constraints for multiple conditions ────────────────────────────────
export function mergeConstraints(conditions: string[]): {
  avoidList: string[];
  preferList: string[];
  macroLimits: { maxCarbs?: number; maxFat?: number; minProtein?: number };
  alertMessages: string[];
} {
  const avoidSet = new Set<string>();
  const preferSet = new Set<string>();
  const alertMessages: string[] = [];
  const macroLimits: { maxCarbs?: number; maxFat?: number; minProtein?: number } =
    {};

  for (const condition of conditions) {
    const normalised = condition.toLowerCase().replace(/[\s_-]/g, '');
    const constraints = CONDITION_CONSTRAINTS[normalised];
    if (!constraints) continue;

    constraints.avoid.forEach((f) => avoidSet.add(f));
    constraints.prefer.forEach((f) => preferSet.add(f));
    alertMessages.push(constraints.alertMessage);

    if (constraints.macroLimits?.maxCarbs !== undefined) {
      macroLimits.maxCarbs =
        macroLimits.maxCarbs === undefined
          ? constraints.macroLimits.maxCarbs
          : Math.min(macroLimits.maxCarbs, constraints.macroLimits.maxCarbs);
    }
    if (constraints.macroLimits?.maxFat !== undefined) {
      macroLimits.maxFat =
        macroLimits.maxFat === undefined
          ? constraints.macroLimits.maxFat
          : Math.min(macroLimits.maxFat, constraints.macroLimits.maxFat);
    }
    if (constraints.macroLimits?.minProtein !== undefined) {
      macroLimits.minProtein =
        macroLimits.minProtein === undefined
          ? constraints.macroLimits.minProtein
          : Math.max(macroLimits.minProtein, constraints.macroLimits.minProtein);
    }
  }

  return {
    avoidList: Array.from(avoidSet),
    preferList: Array.from(preferSet),
    macroLimits,
    alertMessages,
  };
}
