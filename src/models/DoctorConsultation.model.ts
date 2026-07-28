import mongoose, { Schema, Document } from 'mongoose';

export interface IDoctorConsultation extends Document {
  tenantId: string;
  memberId: mongoose.Types.ObjectId;
  specialty: 'general_physician' | 'nutritionist' | 'sports_medicine' | 'orthopedics' | 'dermatologist' | 'psychiatrist' | 'cardiologist' | 'physiotherapist' | 'gynecologist' | 'ent_specialist';
  providerName: string;
  doctorName?: string;
  doctorId?: string;
  appointmentDate: Date;
  appointmentTime: string;
  durationMinutes: number;
  consultationType: 'video' | 'audio' | 'chat' | 'in_person';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  consultationFee: number;
  paymentStatus: 'unpaid' | 'paid' | 'covered_by_plan';
  meetingLink?: string;
  chiefComplaint: string;
  symptoms?: string[];
  prescriptionNotes?: string;
  followUpDate?: Date;
  rating?: number;
  feedback?: string;
  externalBookingId?: string;
}

const DoctorConsultationSchema = new Schema<IDoctorConsultation>({
  tenantId: { type: String, required: true },
  memberId: { type: Schema.Types.ObjectId, ref: 'Member', required: true },
  specialty: {
    type: String,
    enum: ['general_physician', 'nutritionist', 'sports_medicine', 'orthopedics', 'dermatologist', 'psychiatrist', 'cardiologist', 'physiotherapist', 'gynecologist', 'ent_specialist'],
    required: true,
  },
  providerName: { type: String, default: 'Internal' },
  doctorName: { type: String },
  doctorId: { type: String },
  appointmentDate: { type: Date, required: true },
  appointmentTime: { type: String, required: true },
  durationMinutes: { type: Number, default: 20 },
  consultationType: { type: String, enum: ['video', 'audio', 'chat', 'in_person'], default: 'video' },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled', 'no_show'], default: 'scheduled' },
  consultationFee: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'covered_by_plan'], default: 'unpaid' },
  meetingLink: { type: String },
  chiefComplaint: { type: String, required: true },
  symptoms: [{ type: String }],
  prescriptionNotes: { type: String },
  followUpDate: { type: Date },
  rating: { type: Number, min: 1, max: 5 },
  feedback: { type: String },
  externalBookingId: { type: String },
}, { timestamps: true });

DoctorConsultationSchema.index({ tenantId: 1, memberId: 1 });
DoctorConsultationSchema.index({ tenantId: 1, specialty: 1 });
DoctorConsultationSchema.index({ tenantId: 1, appointmentDate: 1 });
DoctorConsultationSchema.index({ tenantId: 1, status: 1 });

export default mongoose.model<IDoctorConsultation>('DoctorConsultation', DoctorConsultationSchema);
