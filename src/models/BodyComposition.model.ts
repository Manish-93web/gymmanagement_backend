import mongoose, { Document, Schema } from 'mongoose';

export interface IBodyComposition extends Document {
  tenantId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  memberName: string;
  measurementDate: Date;
  source: 'inbody' | 'activex' | 'manual' | 'tanita' | 'other';
  deviceId?: string;
  rawData?: Record<string, any>;
  // Core metrics
  weight: number;             // kg
  bmi: number;
  bodyFatPercent: number;     // %
  bodyFatMass: number;        // kg
  leanBodyMass: number;       // kg
  skeletalMuscleMass: number; // kg
  // Segmental analysis
  segmental?: {
    rightArm?:  { muscleMass?: number; fatMass?: number; fatPercent?: number };
    leftArm?:   { muscleMass?: number; fatMass?: number; fatPercent?: number };
    trunk?:     { muscleMass?: number; fatMass?: number; fatPercent?: number };
    rightLeg?:  { muscleMass?: number; fatMass?: number; fatPercent?: number };
    leftLeg?:   { muscleMass?: number; fatMass?: number; fatPercent?: number };
  };
  // Advanced metrics
  visceralFatLevel?: number;
  visceralFatArea?: number;   // cm²
  basalMetabolicRate?: number; // kcal/day
  totalBodyWater?: number;    // L
  intracellularWater?: number;
  extracellularWater?: number
  boneMineralContent?: number; // kg
  proteinMass?: number;       // kg
  mineralMass?: number;       // kg
  // Health scores
  bodyFatRating?: string;     // 'Underfat' | 'Normal' | 'Overfat' | 'Obese'
  muscleFatRating?: string;   // relative muscle/fat rating
  phaseAngle?: number;        // cellular health indicator
  ecwRatio?: number;          // extracellular water ratio (edema indicator)
  // Anthropometrics (if device provides)
  height?: number;            // cm
  waistCircumference?: number;
  hipCircumference?: number;
  notes?: string;
  createdBy?: mongoose.Types.ObjectId;
}

const SegmentSchema = new Schema({
  muscleMass: Number,
  fatMass:    Number,
  fatPercent: Number,
}, { _id: false });

const BodyCompositionSchema = new Schema<IBodyComposition>(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true },
    memberId:    { type: Schema.Types.ObjectId, required: true },
    memberName:  { type: String, required: true },
    measurementDate: { type: Date, required: true, default: Date.now },
    source:      { type: String, enum: ['inbody', 'activex', 'manual', 'tanita', 'other'], default: 'manual' },
    deviceId:    String,
    rawData:     { type: Schema.Types.Mixed },
    // Core
    weight:              { type: Number, required: true },
    bmi:                 { type: Number, required: true },
    bodyFatPercent:      { type: Number, required: true },
    bodyFatMass:         { type: Number, required: true },
    leanBodyMass:        { type: Number, required: true },
    skeletalMuscleMass:  { type: Number, required: true },
    // Segmental
    segmental: {
      rightArm: SegmentSchema,
      leftArm:  SegmentSchema,
      trunk:    SegmentSchema,
      rightLeg: SegmentSchema,
      leftLeg:  SegmentSchema,
    },
    // Advanced
    visceralFatLevel:    Number,
    visceralFatArea:     Number,
    basalMetabolicRate:  Number,
    totalBodyWater:      Number,
    intracellularWater:  Number,
    extracellularWater:  Number,
    boneMineralContent:  Number,
    proteinMass:         Number,
    mineralMass:         Number,
    // Ratings
    bodyFatRating:  String,
    muscleFatRating:String,
    phaseAngle:     Number,
    ecwRatio:       Number,
    // Anthropometrics
    height:              Number,
    waistCircumference:  Number,
    hipCircumference:    Number,
    notes:       String,
    createdBy:   { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

BodyCompositionSchema.index({ tenantId: 1, memberId: 1, measurementDate: -1 });
BodyCompositionSchema.index({ tenantId: 1, measurementDate: -1 });
BodyCompositionSchema.index({ tenantId: 1, source: 1 });

export default mongoose.model<IBodyComposition>('BodyComposition', BodyCompositionSchema);
