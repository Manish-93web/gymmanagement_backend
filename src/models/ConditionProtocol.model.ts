import mongoose, { Schema, Document } from 'mongoose';

export type HealthCondition =
  | 'PCOS'
  | 'Hypothyroidism'
  | 'InsulinResistance'
  | 'Type2Diabetes'
  | 'Hypertension'
  | 'SkinHealth'
  | 'GERD'
  | 'Celiac'
  | 'LactoseIntolerance'
  | 'General';

export const ALL_CONDITIONS: HealthCondition[] = [
  'PCOS',
  'Hypothyroidism',
  'InsulinResistance',
  'Type2Diabetes',
  'Hypertension',
  'SkinHealth',
  'GERD',
  'Celiac',
  'LactoseIntolerance',
  'General',
];

export interface IConditionProtocol extends Document {
  tenantId?: string | null;
  condition: HealthCondition;
  label: string;
  description: string;
  macros: {
    proteinPercent: number;
    carbPercent: number;
    fatPercent: number;
  };
  calorieAdjustment?: number;
  mealFrequency?: string;
  includeFoods: { name: string; reason: string }[];
  avoidFoods: { name: string; reason: string }[];
  mealTimingNotes: string;
  indianFoodAlternatives: { original: string; alternative: string }[];
  phaseVariants?: { phaseName: string; notes: string }[];
  disclaimer: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const FoodItemSchema = new Schema(
  {
    name: { type: String, required: true },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const IndianFoodAltSchema = new Schema(
  {
    original: { type: String, required: true },
    alternative: { type: String, required: true },
  },
  { _id: false }
);

const PhaseVariantSchema = new Schema(
  {
    phaseName: { type: String, required: true },
    notes: { type: String, required: true },
  },
  { _id: false }
);

const ConditionProtocolSchema: Schema = new Schema(
  {
    tenantId: { type: String, default: null },
    condition: {
      type: String,
      enum: ALL_CONDITIONS,
      required: true,
    },
    label: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    macros: {
      proteinPercent: { type: Number, default: 25, min: 0, max: 100 },
      carbPercent: { type: Number, default: 50, min: 0, max: 100 },
      fatPercent: { type: Number, default: 25, min: 0, max: 100 },
    },
    calorieAdjustment: { type: Number },
    mealFrequency: { type: String },
    includeFoods: [FoodItemSchema],
    avoidFoods: [FoodItemSchema],
    mealTimingNotes: { type: String, default: '' },
    indianFoodAlternatives: [IndianFoodAltSchema],
    phaseVariants: [PhaseVariantSchema],
    disclaimer: {
      type: String,
      default: 'This is a wellness plan, not medical treatment. Consult your doctor.',
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ConditionProtocolSchema.index({ condition: 1 });
ConditionProtocolSchema.index({ tenantId: 1, condition: 1 });

export default mongoose.model<IConditionProtocol>('ConditionProtocol', ConditionProtocolSchema);
