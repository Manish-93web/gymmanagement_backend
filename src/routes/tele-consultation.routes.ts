import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import DoctorConsultation from '../models/DoctorConsultation.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── Static Data ──────────────────────────────────────────────────────────────

const SPECIALTIES = [
  { key: 'general_physician',  name: 'General Physician',         emoji: '🩺', description: 'Common illnesses, preventive care',      avgWaitTime: '5 mins',  priceRange: '₹299–₹499'  },
  { key: 'nutritionist',       name: 'Nutritionist / Dietician',  emoji: '🥗', description: 'Diet plans, weight management',           avgWaitTime: '10 mins', priceRange: '₹399–₹799'  },
  { key: 'sports_medicine',    name: 'Sports Medicine',           emoji: '🏃', description: 'Sports injuries, performance',            avgWaitTime: '15 mins', priceRange: '₹499–₹899'  },
  { key: 'orthopedics',        name: 'Orthopedics',               emoji: '🦴', description: 'Bone and joint issues',                   avgWaitTime: '20 mins', priceRange: '₹599–₹999'  },
  { key: 'dermatologist',      name: 'Dermatologist',             emoji: '✨', description: 'Skin, hair and nail care',                avgWaitTime: '15 mins', priceRange: '₹399–₹699'  },
  { key: 'psychiatrist',       name: 'Psychiatrist / Psychologist', emoji: '🧠', description: 'Mental health and wellbeing',          avgWaitTime: '10 mins', priceRange: '₹799–₹1499' },
  { key: 'cardiologist',       name: 'Cardiologist',              emoji: '❤️', description: 'Heart health monitoring',                 avgWaitTime: '20 mins', priceRange: '₹699–₹1199' },
  { key: 'physiotherapist',    name: 'Physiotherapist',           emoji: '💪', description: 'Rehabilitation, pain relief',             avgWaitTime: '10 mins', priceRange: '₹499–₹899'  },
  { key: 'gynecologist',       name: 'Gynecologist',              emoji: '🌸', description: "Women's health",                          avgWaitTime: '15 mins', priceRange: '₹499–₹999'  },
  { key: 'ent_specialist',     name: 'ENT Specialist',            emoji: '👂', description: 'Ear, nose and throat',                    avgWaitTime: '10 mins', priceRange: '₹399–₹699'  },
];

const MOCK_DOCTORS: Record<string, any[]> = {
  general_physician: [
    { id: 'mock_gp1',    name: 'Dr. Priya Sharma',  experience: '12 years', rating: 4.8, fee: 299, availableToday: true,  qualification: 'MBBS, MD'             },
    { id: 'mock_gp2',    name: 'Dr. Rakesh Kumar',  experience: '8 years',  rating: 4.6, fee: 349, availableToday: true,  qualification: 'MBBS'                 },
  ],
  nutritionist: [
    { id: 'mock_nut1',   name: 'Dr. Anita Patel',   experience: '10 years', rating: 4.9, fee: 399, availableToday: true,  qualification: 'PhD Nutrition'        },
    { id: 'mock_nut2',   name: 'Ms. Kavya Reddy',   experience: '6 years',  rating: 4.7, fee: 349, availableToday: false, qualification: 'M.Sc Dietetics'       },
  ],
  sports_medicine: [
    { id: 'mock_sm1',    name: 'Dr. Arjun Singh',   experience: '15 years', rating: 4.8, fee: 599, availableToday: true,  qualification: 'MBBS, DNB Sports Medicine' },
  ],
  orthopedics: [
    { id: 'mock_orth1',  name: 'Dr. Suresh Nair',   experience: '18 years', rating: 4.7, fee: 699, availableToday: false, qualification: 'MS Orthopaedics'      },
  ],
  dermatologist: [
    { id: 'mock_derm1',  name: 'Dr. Meera Joshi',   experience: '9 years',  rating: 4.8, fee: 499, availableToday: true,  qualification: 'MD Dermatology'       },
  ],
  psychiatrist: [
    { id: 'mock_psy1',   name: 'Dr. Ravi Verma',    experience: '14 years', rating: 4.9, fee: 999, availableToday: true,  qualification: 'MD Psychiatry'        },
  ],
  cardiologist: [
    { id: 'mock_card1',  name: 'Dr. Amit Gupta',    experience: '20 years', rating: 4.9, fee: 899, availableToday: false, qualification: 'DM Cardiology'        },
  ],
  physiotherapist: [
    { id: 'mock_physio1', name: 'Dr. Sneha Iyer',   experience: '7 years',  rating: 4.7, fee: 499, availableToday: true,  qualification: 'MPT Sports'           },
  ],
  gynecologist: [
    { id: 'mock_gyn1',   name: 'Dr. Pooja Mehta',   experience: '11 years', rating: 4.8, fee: 599, availableToday: true,  qualification: 'MS Gynecology'        },
  ],
  ent_specialist: [
    { id: 'mock_ent1',   name: 'Dr. Rajiv Bhat',    experience: '13 years', rating: 4.6, fee: 499, availableToday: true,  qualification: 'MS ENT'               },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateMockSlots(dateStr: string): string[] {
  const slots: string[] = [];
  const now = new Date();
  const selectedDate = new Date(dateStr);
  const isToday =
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate();

  for (let h = 9; h <= 17; h++) {
    for (const m of [0, 30]) {
      if (h === 17 && m === 30) continue;
      if (isToday) {
        const slotTime = new Date(selectedDate);
        slotTime.setHours(h, m, 0, 0);
        if (slotTime <= now) continue;
      }
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
}

function generateMeetingLink(): string {
  const id = Math.random().toString(36).substring(2, 10);
  return `https://meet.gymmanage.io/consult-${id}`;
}

async function getMemberByUserId(userId: string, tenantId: string) {
  return Member.findOne({ userId, tenantId }).lean();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /tele-consultation/specialties
router.get(
  '/specialties',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json({ success: true, data: SPECIALTIES });
    } catch (err) { next(err); }
  }
);

// GET /tele-consultation/doctors?specialty=
router.get(
  '/doctors',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const specialty = String(req.query.specialty || '');
      const apiUrl = process.env.TELECONSULT_API_URL;

      if (apiUrl) {
        const resp = await axios.get(`${apiUrl}/doctors`, {
          params: { specialty },
          headers: { 'x-api-key': process.env.TELECONSULT_API_KEY || '' },
          timeout: 8000,
        });
        return res.json({ success: true, data: resp.data?.data ?? resp.data ?? [] });
      }

      const doctors = MOCK_DOCTORS[specialty] ?? [];
      return res.json({ success: true, data: doctors, source: 'mock' });
    } catch (err) { next(err); }
  }
);

// GET /tele-consultation/slots?doctorId=&date=
router.get(
  '/slots',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { doctorId, date } = req.query;
      if (!doctorId || !date) {
        return res.status(400).json({ success: false, message: 'doctorId and date are required' });
      }

      const apiUrl = process.env.TELECONSULT_API_URL;
      if (apiUrl) {
        const resp = await axios.get(`${apiUrl}/slots`, {
          params: { doctorId, date },
          headers: { 'x-api-key': process.env.TELECONSULT_API_KEY || '' },
          timeout: 8000,
        });
        return res.json({ success: true, data: resp.data?.data ?? resp.data ?? [] });
      }

      const slots = generateMockSlots(String(date));
      return res.json({ success: true, data: slots, source: 'mock' });
    } catch (err) { next(err); }
  }
);

// POST /tele-consultation/book
router.post(
  '/book',
  requireAnyRole('member', 'trainer', 'staff', 'gym_owner', 'branch_manager', 'super_admin', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user._id;

      const member = await getMemberByUserId(String(userId), tenantId);
      if (!member) {
        return res.status(404).json({ success: false, message: 'Member profile not found' });
      }

      const {
        specialty, doctorId, doctorName, appointmentDate, appointmentTime,
        durationMinutes = 20, consultationType = 'video', chiefComplaint,
        symptoms = [], consultationFee = 0, paymentStatus = 'unpaid',
      } = req.body;

      if (!specialty || !appointmentDate || !appointmentTime || !chiefComplaint) {
        return res.status(400).json({ success: false, message: 'specialty, appointmentDate, appointmentTime, chiefComplaint are required' });
      }

      const meetingLink = consultationType === 'video' || consultationType === 'audio'
        ? generateMeetingLink()
        : undefined;

      let externalBookingId: string | undefined;
      const apiUrl = process.env.TELECONSULT_API_URL;
      if (apiUrl) {
        try {
          const resp = await axios.post(`${apiUrl}/bookings`, {
            doctorId, appointmentDate, appointmentTime, chiefComplaint,
          }, {
            headers: { 'x-api-key': process.env.TELECONSULT_API_KEY || '' },
            timeout: 8000,
          });
          externalBookingId = resp.data?.bookingId || resp.data?.id;
        } catch {
          // non-fatal — we still save locally
        }
      }

      const consultation = await DoctorConsultation.create({
        tenantId,
        memberId: member._id,
        specialty,
        providerName: apiUrl ? 'External' : 'Internal',
        doctorId,
        doctorName,
        appointmentDate: new Date(appointmentDate),
        appointmentTime,
        durationMinutes,
        consultationType,
        status: 'scheduled',
        consultationFee,
        paymentStatus,
        meetingLink,
        chiefComplaint,
        symptoms,
        externalBookingId,
      });

      return res.status(201).json({ success: true, data: consultation });
    } catch (err) { next(err); }
  }
);

// GET /tele-consultation/my-consultations
router.get(
  '/my-consultations',
  requireAnyRole('member', 'trainer', 'staff', 'gym_owner', 'branch_manager', 'super_admin', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user._id;

      const member = await getMemberByUserId(String(userId), tenantId);
      if (!member) {
        return res.json({ success: true, data: [] });
      }

      const consultations = await DoctorConsultation.find({
        tenantId,
        memberId: member._id,
      })
        .sort({ appointmentDate: -1 })
        .lean();

      const now = new Date();
      const upcoming = consultations.filter(c => new Date(c.appointmentDate) >= now && c.status === 'scheduled');
      const past = consultations.filter(c => new Date(c.appointmentDate) < now || c.status !== 'scheduled');

      return res.json({ success: true, data: { upcoming, past, total: consultations.length } });
    } catch (err) { next(err); }
  }
);

// PUT /tele-consultation/:id/cancel
router.put(
  '/:id/cancel',
  requireAnyRole('member', 'trainer', 'staff', 'gym_owner', 'branch_manager', 'super_admin', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user._id;
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid consultation ID' });
      }

      const consultation = await DoctorConsultation.findOne({ _id: id, tenantId });
      if (!consultation) {
        return res.status(404).json({ success: false, message: 'Consultation not found' });
      }

      // Members can only cancel their own; admins can cancel any
      const user = (req as any).user;
      const isAdmin = ['gym_owner', 'branch_manager', 'super_admin', 'admin', 'staff'].includes(user.role);
      if (!isAdmin) {
        const member = await getMemberByUserId(String(userId), tenantId);
        if (!member || consultation.memberId.toString() !== member._id.toString()) {
          return res.status(403).json({ success: false, message: 'Not authorized to cancel this consultation' });
        }
      }

      if (consultation.status === 'completed') {
        return res.status(400).json({ success: false, message: 'Cannot cancel a completed consultation' });
      }

      consultation.status = 'cancelled';
      await consultation.save();

      return res.json({ success: true, data: consultation });
    } catch (err) { next(err); }
  }
);

// PUT /tele-consultation/:id/complete — admin/staff
router.put(
  '/:id/complete',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'admin', 'staff', 'trainer'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const { id } = req.params;
      const { prescriptionNotes, followUpDate } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid consultation ID' });
      }

      const consultation = await DoctorConsultation.findOne({ _id: id, tenantId });
      if (!consultation) {
        return res.status(404).json({ success: false, message: 'Consultation not found' });
      }

      consultation.status = 'completed';
      if (prescriptionNotes) consultation.prescriptionNotes = prescriptionNotes;
      if (followUpDate) consultation.followUpDate = new Date(followUpDate);
      await consultation.save();

      return res.json({ success: true, data: consultation });
    } catch (err) { next(err); }
  }
);

// POST /tele-consultation/:id/rate — member
router.post(
  '/:id/rate',
  requireAnyRole('member', 'trainer', 'staff', 'gym_owner', 'branch_manager', 'super_admin', 'admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user._id;
      const { id } = req.params;
      const { rating, feedback } = req.body;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid consultation ID' });
      }

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
      }

      const consultation = await DoctorConsultation.findOne({ _id: id, tenantId });
      if (!consultation) {
        return res.status(404).json({ success: false, message: 'Consultation not found' });
      }

      const member = await getMemberByUserId(String(userId), tenantId);
      if (!member || consultation.memberId.toString() !== member._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized to rate this consultation' });
      }

      if (consultation.status !== 'completed') {
        return res.status(400).json({ success: false, message: 'Can only rate completed consultations' });
      }

      consultation.rating = rating;
      if (feedback) consultation.feedback = feedback;
      await consultation.save();

      return res.json({ success: true, data: consultation });
    } catch (err) { next(err); }
  }
);

// GET /tele-consultation/stats — admin
router.get(
  '/stats',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'admin', 'staff'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        total,
        thisMonth,
        active,
        specialtyStats,
        ratingAgg,
        statusStats,
      ] = await Promise.all([
        DoctorConsultation.countDocuments({ tenantId }),
        DoctorConsultation.countDocuments({ tenantId, createdAt: { $gte: startOfMonth } }),
        DoctorConsultation.countDocuments({ tenantId, status: 'scheduled' }),
        DoctorConsultation.aggregate([
          { $match: { tenantId } },
          { $group: { _id: '$specialty', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ]),
        DoctorConsultation.aggregate([
          { $match: { tenantId, rating: { $exists: true } } },
          { $group: { _id: null, avgRating: { $avg: '$rating' }, ratedCount: { $sum: 1 } } },
        ]),
        DoctorConsultation.aggregate([
          { $match: { tenantId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
      ]);

      const popularSpecialty = specialtyStats[0]?._id ?? null;
      const avgRating = ratingAgg[0]?.avgRating ? +ratingAgg[0].avgRating.toFixed(1) : null;

      return res.json({
        success: true,
        data: {
          total,
          thisMonth,
          active,
          popularSpecialty,
          avgRating,
          specialtyBreakdown: specialtyStats,
          statusBreakdown: statusStats,
          apiStatus: process.env.TELECONSULT_API_URL ? 'connected' : 'mock',
        },
      });
    } catch (err) { next(err); }
  }
);

// GET /tele-consultation — admin: all consultations
router.get(
  '/',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin', 'admin', 'staff'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const filter: any = { tenantId };
      if (req.query.status) filter.status = req.query.status;
      if (req.query.specialty) filter.specialty = req.query.specialty;

      const [consultations, total] = await Promise.all([
        DoctorConsultation.find(filter)
          .populate('memberId', 'firstName lastName email membershipNumber')
          .sort({ appointmentDate: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        DoctorConsultation.countDocuments(filter),
      ]);

      return res.json({ success: true, data: consultations, total, page, limit });
    } catch (err) { next(err); }
  }
);

export default router;
