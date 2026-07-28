import mongoose, { Schema, Document } from 'mongoose';

export interface IComplaintThread {
  message: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  timestamp: Date;
  isInternal?: boolean;
}

export interface IComplaint extends Document {
  tenantId: string;
  memberId: string;
  memberName: string;
  memberPhone?: string;
  memberEmail?: string;
  category: 'equipment' | 'staff' | 'cleanliness' | 'billing' | 'class' | 'app' | 'safety' | 'other';
  subject: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  assignedToName?: string;
  thread: IComplaintThread[];
  resolutionNote?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  closedAt?: Date;
  reopenedAt?: Date;
  escalated: boolean;
  escalatedAt?: Date;
  slaBreached: boolean;
  slaDeadline?: Date;
  satisfaction?: 1 | 2 | 3 | 4 | 5;
  satisfactionComment?: string;
  ticketNumber: string;
  source: 'member_app' | 'web' | 'whatsapp' | 'phone' | 'walk_in';
  createdAt: Date;
  updatedAt: Date;
}

const ComplaintThreadSchema = new Schema<IComplaintThread>(
  {
    message: { type: String, required: true },
    authorId: { type: String, required: true },
    authorName: { type: String, required: true },
    authorRole: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    isInternal: { type: Boolean, default: false },
  },
  { _id: false }
);

const ComplaintSchema = new Schema<IComplaint>(
  {
    tenantId: { type: String, required: true, index: true },
    memberId: { type: String, required: true },
    memberName: { type: String, required: true },
    memberPhone: { type: String },
    memberEmail: { type: String },
    category: {
      type: String,
      enum: ['equipment', 'staff', 'cleanliness', 'billing', 'class', 'app', 'safety', 'other'],
      default: 'other',
    },
    subject: { type: String, required: true },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed', 'reopened'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    assignedTo: { type: String },
    assignedToName: { type: String },
    thread: { type: [ComplaintThreadSchema], default: [] },
    resolutionNote: { type: String },
    resolvedAt: { type: Date },
    resolvedBy: { type: String },
    closedAt: { type: Date },
    reopenedAt: { type: Date },
    escalated: { type: Boolean, default: false },
    escalatedAt: { type: Date },
    slaBreached: { type: Boolean, default: false },
    slaDeadline: { type: Date },
    satisfaction: { type: Number, enum: [1, 2, 3, 4, 5], min: 1, max: 5 },
    satisfactionComment: { type: String },
    ticketNumber: { type: String, unique: true, sparse: true },
    source: {
      type: String,
      enum: ['member_app', 'web', 'whatsapp', 'phone', 'walk_in'],
      default: 'member_app',
    },
  },
  { timestamps: true }
);

// Compound indexes
ComplaintSchema.index({ tenantId: 1, status: 1 });
ComplaintSchema.index({ tenantId: 1, memberId: 1 });
ComplaintSchema.index({ tenantId: 1, priority: 1 });
ComplaintSchema.index({ tenantId: 1, assignedTo: 1 });

// SLA hours per priority
const SLA_HOURS: Record<string, number> = {
  low: 48,
  medium: 24,
  high: 8,
  urgent: 2,
};

// Counter collection for ticket sequence
const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.ComplaintCounter || mongoose.model('ComplaintCounter', CounterSchema);

// Pre-save hook: auto-generate ticketNumber + compute slaDeadline
ComplaintSchema.pre('save', async function (next) {
  try {
    // Generate ticketNumber only on new documents
    if (this.isNew && !this.ticketNumber) {
      const year = new Date().getFullYear();
      const counterId = `complaint_${year}`;
      const counter = await Counter.findByIdAndUpdate(
        counterId,
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );
      const seq = String(counter.seq).padStart(4, '0');
      this.ticketNumber = `CMP-${year}${seq}`;
    }

    // Compute slaDeadline on new documents or if priority changed
    if (this.isNew || this.isModified('priority')) {
      const hours = SLA_HOURS[this.priority] ?? 24;
      const base = this.createdAt ? new Date(this.createdAt) : new Date();
      this.slaDeadline = new Date(base.getTime() + hours * 60 * 60 * 1000);
    }

    next();
  } catch (err: any) {
    next(err);
  }
});

export default mongoose.model<IComplaint>('Complaint', ComplaintSchema);
