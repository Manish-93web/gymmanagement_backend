import mongoose, { Schema, Document } from 'mongoose';

export type ExerciseType =
  | 'squat'
  | 'pushup'
  | 'plank'
  | 'shoulder_press'
  | 'lunge'
  | 'bicep_curl'
  | 'deadlift';

export interface IErrorFlag {
  errorType: string;
  count: number;
  description: string;
}

export interface IFormSession extends Document {
  tenantId: string;
  memberId: mongoose.Types.ObjectId;
  exerciseName: string;
  exerciseType: ExerciseType;
  repCount: number;
  setCount: number;
  durationSeconds: number;
  avgFormScore: number;
  peakFormScore: number;
  errorFlags: IErrorFlag[];
  feedback: string[];
  improvements: string[];
  sessionAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ErrorFlagSchema = new Schema<IErrorFlag>(
  {
    errorType: { type: String, required: true },
    count: { type: Number, default: 1 },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const FormSessionSchema: Schema = new Schema<IFormSession>(
  {
    tenantId: { type: String, required: true, index: true },
    memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
    exerciseName: { type: String, required: true },
    exerciseType: {
      type: String,
      required: true,
      enum: ['squat', 'pushup', 'plank', 'shoulder_press', 'lunge', 'bicep_curl', 'deadlift'],
    },
    repCount: { type: Number, default: 0 },
    setCount: { type: Number, default: 1 },
    durationSeconds: { type: Number, default: 0 },
    avgFormScore: { type: Number, min: 0, max: 100, default: 0 },
    peakFormScore: { type: Number, min: 0, max: 100, default: 0 },
    errorFlags: { type: [ErrorFlagSchema], default: [] },
    feedback: { type: [String], default: [] },
    improvements: { type: [String], default: [] },
    sessionAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound indexes
FormSessionSchema.index({ tenantId: 1, memberId: 1, sessionAt: -1 });
FormSessionSchema.index({ tenantId: 1, exerciseType: 1 });

export default mongoose.model<IFormSession>('FormSession', FormSessionSchema);
