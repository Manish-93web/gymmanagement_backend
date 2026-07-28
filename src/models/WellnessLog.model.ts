import mongoose, { Document, Schema } from 'mongoose';

export interface IWellnessLog extends Document {
  tenantId: mongoose.Types.ObjectId;
  memberId: mongoose.Types.ObjectId;
  date: Date;
  mood: 1 | 2 | 3 | 4 | 5; // 1=terrible, 5=great
  energyLevel: 1 | 2 | 3 | 4 | 5;
  stressLevel: 1 | 2 | 3 | 4 | 5;
  sleepQuality: 1 | 2 | 3 | 4 | 5;
  sleepHours?: number;
  notes?: string;
  activitiesDone?: string[]; // meditation, breathing, yoga, etc.
  videoWatched?: mongoose.Types.ObjectId;
  gratitudeEntry?: string;
  affirmation?: string;
}

const WellnessLogSchema = new Schema<IWellnessLog>(
  {
    tenantId:   { type: Schema.Types.ObjectId, required: true },
    memberId:   { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    date:       { type: Date, required: true, default: Date.now },
    mood:       { type: Number, min: 1, max: 5, required: true },
    energyLevel:    { type: Number, min: 1, max: 5, required: true },
    stressLevel:    { type: Number, min: 1, max: 5, required: true },
    sleepQuality:   { type: Number, min: 1, max: 5, required: true },
    sleepHours:     Number,
    notes:          String,
    activitiesDone: [String],
    videoWatched:   { type: Schema.Types.ObjectId, ref: 'VideoContent' },
    gratitudeEntry: String,
    affirmation:    String,
  },
  { timestamps: true }
);

WellnessLogSchema.index({ tenantId: 1, memberId: 1, date: -1 });

export default mongoose.model<IWellnessLog>('WellnessLog', WellnessLogSchema);
