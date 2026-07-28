import mongoose, { Document, Schema } from 'mongoose';

export interface IHealthRiskAssessment extends Document {
  tenantId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  assessmentDate: Date;
  // Step 1: Family History
  familyHistory: {
    diabetes: boolean;
    hypertension: boolean;
    heartDisease: boolean;
    cancer: boolean;
    obesity: boolean;
    thyroid: boolean;
    notes?: string;
  };
  // Step 2: Current Vitals (self-reported)
  currentVitals: {
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    fastingBloodGlucose?: number;   // mg/dL
    knownConditions: string[];       // e.g. ['PCOS', 'hypothyroidism', 'pre-diabetes']
    currentMedications: string[];
  };
  // Step 3: Lifestyle
  lifestyle: {
    sleepHoursPerNight: number;
    stressLevel: 1 | 2 | 3 | 4 | 5;          // 1 = very low, 5 = very high
    smokingStatus: 'never' | 'former' | 'current';
    alcoholFrequency: 'never' | 'occasional' | 'weekly' | 'daily';
    screenTimeHoursPerDay?: number;
    occupationType: 'sedentary' | 'light_active' | 'moderate_active' | 'heavy_active';
  };
  // Step 4: Dietary Profile
  dietary: {
    preference: 'non_vegetarian' | 'vegetarian' | 'vegan' | 'jain' | 'sattvic';
    allergies: string[];
    restrictions: string[];
    mealsPerDay: number;
    snackingFrequency: 'rarely' | 'sometimes' | 'often' | 'always';
    waterIntakeLiters?: number;
    eatOutFrequency: 'rarely' | 'weekly' | 'daily';
  };
  // Step 5: Fitness Profile
  fitness: {
    experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'athlete';
    currentExerciseFrequencyPerWeek: number;
    primaryGoal: 'weight_loss' | 'muscle_gain' | 'endurance' | 'flexibility' | 'general_health' | 'condition_management';
    injuries: string[];
    preferredActivities: string[];
  };
  // Computed output
  riskScore: number;               // 0–100
  riskCategory: 'low' | 'moderate' | 'high';
  flaggedConditionProtocols: string[];  // e.g. ['diabetes', 'hypertension'] — to suggest ConditionProtocol entries
  recommendations: string[];
  nextAssessmentDue: Date;         // 6 months from assessmentDate
  createdAt: Date;
  updatedAt: Date;
}

const HealthRiskAssessmentSchema = new Schema<IHealthRiskAssessment>(
  {
    tenantId:  { type: Schema.Types.ObjectId, required: true },
    memberId:  { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    assessmentDate: { type: Date, required: true, default: Date.now },
    familyHistory: {
      diabetes:     { type: Boolean, default: false },
      hypertension: { type: Boolean, default: false },
      heartDisease: { type: Boolean, default: false },
      cancer:       { type: Boolean, default: false },
      obesity:      { type: Boolean, default: false },
      thyroid:      { type: Boolean, default: false },
      notes:        String,
    },
    currentVitals: {
      bloodPressureSystolic:  Number,
      bloodPressureDiastolic: Number,
      fastingBloodGlucose:    Number,
      knownConditions:   [{ type: String }],
      currentMedications:[{ type: String }],
    },
    lifestyle: {
      sleepHoursPerNight:  { type: Number, required: true },
      stressLevel:         { type: Number, enum: [1, 2, 3, 4, 5], required: true },
      smokingStatus:       { type: String, enum: ['never', 'former', 'current'], required: true },
      alcoholFrequency:    { type: String, enum: ['never', 'occasional', 'weekly', 'daily'], required: true },
      screenTimeHoursPerDay: Number,
      occupationType:      { type: String, enum: ['sedentary', 'light_active', 'moderate_active', 'heavy_active'], required: true },
    },
    dietary: {
      preference:       { type: String, enum: ['non_vegetarian', 'vegetarian', 'vegan', 'jain', 'sattvic'], required: true },
      allergies:        [{ type: String }],
      restrictions:     [{ type: String }],
      mealsPerDay:      { type: Number, default: 3 },
      snackingFrequency:{ type: String, enum: ['rarely', 'sometimes', 'often', 'always'] },
      waterIntakeLiters: Number,
      eatOutFrequency:  { type: String, enum: ['rarely', 'weekly', 'daily'] },
    },
    fitness: {
      experienceLevel:                { type: String, enum: ['beginner', 'intermediate', 'advanced', 'athlete'], required: true },
      currentExerciseFrequencyPerWeek:{ type: Number, default: 0 },
      primaryGoal:                    { type: String, enum: ['weight_loss', 'muscle_gain', 'endurance', 'flexibility', 'general_health', 'condition_management'] },
      injuries:          [{ type: String }],
      preferredActivities:[{ type: String }],
    },
    riskScore:                  { type: Number, default: 0 },
    riskCategory:               { type: String, enum: ['low', 'moderate', 'high'], default: 'low' },
    flaggedConditionProtocols:  [{ type: String }],
    recommendations:            [{ type: String }],
    nextAssessmentDue:          Date,
  },
  { timestamps: true }
);

HealthRiskAssessmentSchema.index({ tenantId: 1, memberId: 1 });
HealthRiskAssessmentSchema.index({ tenantId: 1, memberId: 1, assessmentDate: -1 });

// Auto-calculate risk score on save
HealthRiskAssessmentSchema.pre('save', function () {
  let score = 0;
  const fh = this.familyHistory;
  const ls = this.lifestyle;
  const cv = this.currentVitals;

  // Family history (up to 25 points)
  if (fh.diabetes)     score += 5;
  if (fh.hypertension) score += 5;
  if (fh.heartDisease) score += 8;
  if (fh.cancer)       score += 4;
  if (fh.obesity)      score += 3;

  // Current conditions (up to 30 points)
  if (cv.bloodPressureSystolic && cv.bloodPressureSystolic > 130) score += 10;
  if (cv.fastingBloodGlucose && cv.fastingBloodGlucose > 100)    score += 10;
  score += Math.min(15, (cv.knownConditions?.length ?? 0) * 5);

  // Lifestyle (up to 25 points)
  if (ls.smokingStatus === 'current')  score += 10;
  if (ls.smokingStatus === 'former')   score += 3;
  if (ls.alcoholFrequency === 'daily') score += 5;
  if (ls.stressLevel >= 4)             score += 5;
  if (ls.sleepHoursPerNight < 6)       score += 5;

  // Fitness (up to 10 points)
  const freq = this.fitness.currentExerciseFrequencyPerWeek;
  if (freq === 0)     score += 10;
  else if (freq <= 1) score += 5;

  this.riskScore = Math.min(100, score);
  this.riskCategory = score < 30 ? 'low' : score < 60 ? 'moderate' : 'high';

  // Flag relevant condition protocols
  const flags: string[] = [];
  if (fh.diabetes || (cv.fastingBloodGlucose && cv.fastingBloodGlucose > 100)) flags.push('diabetes');
  if (fh.hypertension || (cv.bloodPressureSystolic && cv.bloodPressureSystolic > 130)) flags.push('hypertension');
  if (cv.knownConditions?.includes('PCOS')) flags.push('pcos');
  if (fh.thyroid || cv.knownConditions?.includes('hypothyroidism') || cv.knownConditions?.includes('hyperthyroidism')) flags.push('thyroid');
  this.flaggedConditionProtocols = flags;

  // Set next assessment due date (6 months)
  const due = new Date(this.assessmentDate);
  due.setMonth(due.getMonth() + 6);
  this.nextAssessmentDue = due;
});

export default mongoose.model<IHealthRiskAssessment>('HealthRiskAssessment', HealthRiskAssessmentSchema);
