import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import Facility from '../models/Facility.model';
import FacilitySlot from '../models/FacilitySlot.model';
import Member from '../models/Member.model';

const router = Router();

router.use(authenticate);
router.use(tenantContext);

// ─── Helper: generate time slots for a facility on a given date ───────────────

function generateSlots(
  facility: any,
  dateStr: string,
): Array<{ startTime: string; endTime: string }> {
  const slots: Array<{ startTime: string; endTime: string }> = [];
  const [startH, startM] = facility.operatingHours.start.split(':').map(Number);
  const [endH, endM] = facility.operatingHours.end.split(':').map(Number);
  let current = startH * 60 + startM;
  const end = endH * 60 + endM;
  const dur = facility.slotDurationMinutes || 60;
  while (current + dur <= end) {
    const sh = Math.floor(current / 60);
    const sm = current % 60;
    const eh = Math.floor((current + dur) / 60);
    const em = (current + dur) % 60;
    slots.push({
      startTime: `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
      endTime: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`,
    });
    current += dur;
  }
  return slots;
}

// ─── Facilities ───────────────────────────────────────────────────────────────

// GET /api/facility-booking/facilities — list active facilities for tenant
router.get('/facilities', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { type } = req.query;
    const filter: any = { tenantId, isActive: true };
    if (type) filter.facilityType = type;
    const facilities = await Facility.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: facilities });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/facility-booking/facilities — admin: create facility
router.post(
  '/facilities',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const facility = await Facility.create({ ...req.body, tenantId });
      res.status(201).json({ success: true, data: facility });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// PUT /api/facility-booking/facilities/:id — admin: update facility
router.put(
  '/facilities/:id',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const facility = await Facility.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { $set: req.body },
        { new: true },
      );
      if (!facility) {
        res.status(404).json({ success: false, message: 'Facility not found' });
        return;
      }
      res.json({ success: true, data: facility });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// DELETE /api/facility-booking/facilities/:id — admin: soft delete (isActive=false)
router.delete(
  '/facilities/:id',
  requireAnyRole('gym_owner', 'branch_manager', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const facility = await Facility.findOneAndUpdate(
        { _id: req.params.id, tenantId },
        { $set: { isActive: false } },
        { new: true },
      );
      if (!facility) {
        res.status(404).json({ success: false, message: 'Facility not found' });
        return;
      }
      res.json({ success: true, data: facility });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── Slots ────────────────────────────────────────────────────────────────────

// GET /api/facility-booking/slots?facilityId=&date=  — get or auto-generate slots for date
router.get('/slots', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const { facilityId, date } = req.query as { facilityId?: string; date?: string };

    if (!facilityId || !date) {
      res.status(400).json({ success: false, message: 'facilityId and date are required' });
      return;
    }

    const dateObj = new Date(date);
    const dateStart = new Date(dateObj);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(dateObj);
    dateEnd.setUTCHours(23, 59, 59, 999);

    // Check existing slots
    let slots = await FacilitySlot.find({
      tenantId,
      facilityId: new mongoose.Types.ObjectId(facilityId),
      date: { $gte: dateStart, $lte: dateEnd },
    })
      .populate('bookedBy', 'firstName lastName')
      .sort({ startTime: 1 })
      .lean();

    // Auto-generate if none exist for this date
    if (slots.length === 0) {
      const facility = await Facility.findOne({ _id: facilityId, tenantId }).lean();
      if (!facility) {
        res.status(404).json({ success: false, message: 'Facility not found' });
        return;
      }

      // Check if date is an operating day
      const dayOfWeek = dateObj.getDay(); // 0=Sun,1=Mon,...
      const operatingDays: number[] = (facility as any).operatingDays ?? [1, 2, 3, 4, 5, 6];
      if (!operatingDays.includes(dayOfWeek)) {
        res.json({ success: true, data: [], message: 'Facility is closed on this day' });
        return;
      }

      const slotTimes = generateSlots(facility, date);
      const slotDocs = slotTimes.map(s => ({
        tenantId,
        facilityId: new mongoose.Types.ObjectId(facilityId),
        date: dateStart,
        startTime: s.startTime,
        endTime: s.endTime,
        status: 'available' as const,
        amount: (facility as any).pricePerSlot ?? 0,
        paymentStatus: 'unpaid' as const,
      }));

      try {
        await FacilitySlot.insertMany(slotDocs, { ordered: false });
      } catch {
        // May fail on duplicate key if race condition — fetch existing instead
      }

      slots = await FacilitySlot.find({
        tenantId,
        facilityId: new mongoose.Types.ObjectId(facilityId),
        date: { $gte: dateStart, $lte: dateEnd },
      })
        .populate('bookedBy', 'firstName lastName')
        .sort({ startTime: 1 })
        .lean();
    }

    res.json({ success: true, data: slots });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/facility-booking/slots/generate — admin: pre-generate slots for a date range
router.post(
  '/slots/generate',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { facilityId, fromDate, toDate } = req.body;

      if (!facilityId || !fromDate || !toDate) {
        res.status(400).json({ success: false, message: 'facilityId, fromDate and toDate are required' });
        return;
      }

      const facility = await Facility.findOne({ _id: facilityId, tenantId }).lean();
      if (!facility) {
        res.status(404).json({ success: false, message: 'Facility not found' });
        return;
      }

      const from = new Date(fromDate);
      const to = new Date(toDate);
      const operatingDays: number[] = (facility as any).operatingDays ?? [1, 2, 3, 4, 5, 6];

      let created = 0;
      const current = new Date(from);
      current.setUTCHours(0, 0, 0, 0);

      while (current <= to) {
        const dayOfWeek = current.getDay();
        if (operatingDays.includes(dayOfWeek)) {
          const slotTimes = generateSlots(facility, current.toISOString().split('T')[0]);
          const slotDocs = slotTimes.map(s => ({
            tenantId,
            facilityId: new mongoose.Types.ObjectId(facilityId),
            date: new Date(current),
            startTime: s.startTime,
            endTime: s.endTime,
            status: 'available' as const,
            amount: (facility as any).pricePerSlot ?? 0,
            paymentStatus: 'unpaid' as const,
          }));
          try {
            const result = await FacilitySlot.insertMany(slotDocs, { ordered: false });
            created += result.length;
          } catch { /* skip duplicates */ }
        }
        current.setDate(current.getDate() + 1);
      }

      res.json({ success: true, data: { created }, message: `${created} slots generated` });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── Booking ──────────────────────────────────────────────────────────────────

// POST /api/facility-booking/book — book a slot
router.post('/book', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?._id;
    const { facilityId, date, startTime } = req.body;

    if (!facilityId || !date || !startTime) {
      res.status(400).json({ success: false, message: 'facilityId, date and startTime are required' });
      return;
    }

    // Find member record for this user
    const member = await Member.findOne({ userId, tenantId }).lean();
    if (!member) {
      res.status(404).json({ success: false, message: 'Member profile not found' });
      return;
    }

    const dateObj = new Date(date);
    const dateStart = new Date(dateObj);
    dateStart.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(dateObj);
    dateEnd.setUTCHours(23, 59, 59, 999);

    const slot = await FacilitySlot.findOne({
      tenantId,
      facilityId: new mongoose.Types.ObjectId(facilityId),
      date: { $gte: dateStart, $lte: dateEnd },
      startTime,
      status: 'available',
    });

    if (!slot) {
      res.status(409).json({ success: false, message: 'Slot is not available or does not exist' });
      return;
    }

    slot.status = 'booked';
    slot.bookedBy = (member as any)._id;
    slot.bookedAt = new Date();
    await slot.save();

    const populated = await FacilitySlot.findById(slot._id)
      .populate('facilityId', 'name facilityType')
      .populate('bookedBy', 'firstName lastName')
      .lean();

    res.json({ success: true, data: populated, message: 'Slot booked successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Cancel ───────────────────────────────────────────────────────────────────

// POST /api/facility-booking/slots/:id/cancel — member cancels own / admin cancels any
router.post('/slots/:id/cancel', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?._id;
    const userRole = (req as any).user?.role;

    const slot = await FacilitySlot.findOne({ _id: req.params.id, tenantId });
    if (!slot) {
      res.status(404).json({ success: false, message: 'Slot not found' });
      return;
    }
    if (slot.status !== 'booked') {
      res.status(400).json({ success: false, message: 'Slot is not booked' });
      return;
    }

    const isAdmin = ['gym_owner', 'branch_manager', 'staff', 'super_admin'].includes(userRole);

    if (!isAdmin) {
      // Members can only cancel their own bookings
      const member = await Member.findOne({ userId, tenantId }).lean();
      if (!member || !slot.bookedBy?.equals((member as any)._id)) {
        res.status(403).json({ success: false, message: 'You can only cancel your own bookings' });
        return;
      }
    }

    slot.status = 'cancelled';
    slot.cancelledAt = new Date();
    await slot.save();

    res.json({ success: true, data: slot, message: 'Booking cancelled' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Block ────────────────────────────────────────────────────────────────────

// POST /api/facility-booking/slots/:id/block — admin: block a slot
router.post(
  '/slots/:id/block',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { notes } = req.body;
      const slot = await FacilitySlot.findOneAndUpdate(
        { _id: req.params.id, tenantId, status: 'available' },
        { $set: { status: 'blocked', notes } },
        { new: true },
      );
      if (!slot) {
        res.status(404).json({ success: false, message: 'Slot not found or not available' });
        return;
      }
      res.json({ success: true, data: slot });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── Member: My Bookings ──────────────────────────────────────────────────────

// GET /api/facility-booking/my-bookings — member's upcoming bookings
router.get('/my-bookings', async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?._id;

    const member = await Member.findOne({ userId, tenantId }).lean();
    if (!member) {
      res.json({ success: true, data: [] });
      return;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const bookings = await FacilitySlot.find({
      tenantId,
      bookedBy: (member as any)._id,
      status: 'booked',
      date: { $gte: today },
    })
      .populate('facilityId', 'name facilityType pricePerSlot')
      .sort({ date: 1, startTime: 1 })
      .lean();

    res.json({ success: true, data: bookings });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Admin: All Bookings ──────────────────────────────────────────────────────

// GET /api/facility-booking/admin/bookings — all upcoming bookings with member info
router.get(
  '/admin/bookings',
  requireAnyRole('gym_owner', 'branch_manager', 'staff', 'super_admin'),
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenantId;
      const { facilityId, date } = req.query;

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const filter: any = { tenantId, status: 'booked', date: { $gte: today } };
      if (facilityId) filter.facilityId = new mongoose.Types.ObjectId(facilityId as string);
      if (date) {
        const d = new Date(date as string);
        const dStart = new Date(d);
        dStart.setUTCHours(0, 0, 0, 0);
        const dEnd = new Date(d);
        dEnd.setUTCHours(23, 59, 59, 999);
        filter.date = { $gte: dStart, $lte: dEnd };
      }

      const bookings = await FacilitySlot.find(filter)
        .populate('facilityId', 'name facilityType')
        .populate({
          path: 'bookedBy',
          select: 'firstName lastName mobile email membershipNumber',
        })
        .sort({ date: 1, startTime: 1 })
        .lean();

      res.json({ success: true, data: bookings });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

export default router;
