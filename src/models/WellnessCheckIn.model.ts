import mongoose, { Schema, Document } from 'mongoose';

export interface IWellnessCheckIn extends Document {
  tenantId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  date: Date;
  dateStr: string; // 'YYYY-MM-DD' for easy querying
  // 1-5 scale for all metrics
  energyLevel: number;       // 1=exhausted, 5=energized
  wellbeingScore: number;    // 1=terrible, 5=excellent
  perceivedStrength: number; // 1=very weak, 5=very strong
  sleepQuality: number;      // 1=terrible night, 5=great sleep
  stressLevel: number;       // 1=very stressed, 5=very calm (inverted for display)
  motivationLevel: number;   // 1=no motivation, 5=highly motivated
  // Optional quantitative
  sleepHours?: number;
  hydrationGlasses?: number;
  // Notes
  note?: string;
  // Derived
  overallScore: number;
  mood: 'terrible' | 'bad' | 'okay' | 'good' | 'great';
  createdAt: Date;
  updatedAt: Date;
}

const WellnessCheckInSchema = new Schema<IWellnessCheckIn>(
  {
    tenantId:          { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    memberId:          { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    date:              { type: Date, required: true },
    dateStr:           { type: String, required: true }, // 'YYYY-MM-DD'
    energyLevel:       { type: Number, min: 1, max: 5, required: true },
    wellbeingScore:    { type: Number, min: 1, max: 5, required: true },
    perceivedStrength: { type: Number, min: 1, max: 5, required: true },
    sleepQuality:      { type: Number, min: 1, max: 5, required: true },
    stressLevel:       { type: Number, min: 1, max: 5, required: true },
    motivationLevel:   { type: Number, min: 1, max: 5, required: true },
    sleepHours:        { type: Number, min: 0, max: 24 },
    hydrationGlasses:  { type: Number, min: 0 },
    note:              { type: String, maxlength: 500 },
    overallScore:      { type: Number },
    mood:              { type: String, enum: ['terrible', 'bad', 'okay', 'good', 'great'] },
  },
  { timestamps: true },
);

// One check-in per member per day per tenant
WellnessCheckInSchema.index({ tenantId: 1, memberId: 1, dateStr: 1 }, { unique: true });
WellnessCheckInSchema.index({ tenantId: 1, memberId: 1, date: -1 });

// Auto-calculate overallScore and mood before save
WellnessCheckInSchema.pre('save', function () {
  const core = [
    this.energyLevel,
    this.wellbeingScore,
    this.perceivedStrength,
    this.sleepQuality,
    this.motivationLevel,
  ];
  const avg = core.reduce((s, v) => s + v, 0) / core.length;
  this.overallScore = Math.round(avg * 10) / 10;

  if (avg < 2)        this.mood = 'terrible';
  else if (avg < 2.5) this.mood = 'bad';
  else if (avg < 3.5) this.mood = 'okay';
  else if (avg < 4.5) this.mood = 'good';
  else                this.mood = 'great';
});

export default mongoose.model<IWellnessCheckIn>('WellnessCheckIn', WellnessCheckInSchema);
