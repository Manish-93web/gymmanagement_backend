import { Router, Request, Response } from 'express';
import { redis } from '../config/redis';

const router = Router();

// POST /api/trial-claim/send-otp
// Public: send OTP to phone for free trial claim
router.post('/send-otp', async (req: Request, res: Response) => {
  try {
    const { phone, gymSlug } = req.body;

    if (!phone || !gymSlug) {
      return res.status(400).json({ success: false, message: 'Phone and gymSlug are required' });
    }

    // Normalise phone: strip country code prefix and keep last 10 digits
    const normalised = phone.replace(/\D/g, '').slice(-10);
    if (normalised.length !== 10) {
      return res.status(400).json({ success: false, message: 'Invalid phone number — must be 10 digits' });
    }

    // Find gym by slug
    const Tenant = require('../models/Tenant.model').default;
    const tenant = await Tenant.findOne({ slug: gymSlug, isActive: true });
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Gym not found' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in Redis with 5-minute expiry
    const key = `trial_otp:${gymSlug}:${normalised}`;
    const expiry = 5 * 60; // 5 minutes in seconds
    await redis.setex(key, expiry, otp);

    // Send OTP via WhatsApp — non-blocking
    setImmediate(async () => {
      try {
        const whatsAppService = require('../services/whatsapp.service').default;
        await whatsAppService.sendMessage({
          to: `+91${normalised}`,
          message: `Your OTP for free trial at ${tenant.name}: ${otp}. Valid for 5 minutes.`,
        });
      } catch {
        // Fallback: log to console for dev
        console.log(`[TRIAL OTP] ${normalised}: ${otp}`);
      }
    });

    return res.json({
      success: true,
      message: 'OTP sent to your WhatsApp',
      gymName: tenant.name,
      expiresIn: 300,
    });
  } catch (err: any) {
    console.error('[trial-claim/send-otp]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/trial-claim/verify
// Public: verify OTP and create free trial inquiry
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { phone, otp, gymSlug, name } = req.body;

    if (!phone || !otp || !gymSlug) {
      return res.status(400).json({ success: false, message: 'phone, otp and gymSlug are required' });
    }

    const normalised = phone.replace(/\D/g, '').slice(-10);
    if (normalised.length !== 10) {
      return res.status(400).json({ success: false, message: 'Invalid phone number' });
    }

    // Retrieve OTP from Redis
    const key = `trial_otp:${gymSlug}:${normalised}`;
    const storedOtp = await redis.get(key);

    if (!storedOtp || storedOtp !== otp.toString().trim()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    }

    // Find gym
    const Tenant = require('../models/Tenant.model').default;
    const tenant = await Tenant.findOne({ slug: gymSlug, isActive: true });
    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Gym not found' });
    }

    // Check if this phone already has a trial for this gym in the last 30 days
    const Inquiry = require('../models/Inquiry.model').default;
    const existingTrial = await Inquiry.findOne({
      tenantId: tenant._id,
      phone: normalised,
      notes: { $regex: 'Free trial claimed via gym public profile', $options: 'i' },
      createdAt: { $gte: new Date(Date.now() - 30 * 86400000) },
    });

    if (existingTrial) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active trial at this gym',
      });
    }

    // Build trial expiry (1 day from now)
    const trialExpiryDate = new Date(Date.now() + 86400000);
    const memberName = name?.trim() || `Trial Visitor (${normalised.slice(-4)})`;

    // Create inquiry record (fields beyond the schema are silently ignored by Mongoose
    // strict mode; the notes field carries all trial-specific metadata)
    const inquiry = await Inquiry.create({
      tenantId: tenant._id,
      name: memberName,
      phone: normalised,
      source: 'website_trial',
      status: 'new',
      notes: [
        `Free trial claimed via gym public profile.`,
        `Valid until ${trialExpiryDate.toLocaleDateString('en-IN')}.`,
        `Trial expires: ${trialExpiryDate.toISOString()}`,
      ].join(' '),
      trialExpiryDate,
      isTrialClaim: true,
    });

    // Notify gym owner via WhatsApp — non-blocking
    setImmediate(async () => {
      try {
        const whatsAppService = require('../services/whatsapp.service').default;
        const ownerPhone = tenant.ownerMobile || tenant.contactInfo?.phone;
        if (ownerPhone) {
          await whatsAppService.sendMessage({
            to: ownerPhone,
            message: `New free trial claim! ${memberName} (${normalised}) claimed a trial from your public profile. Valid for 1 day.`,
          });
        }
      } catch {
        console.log(`[TRIAL NOTIFY] New trial for ${tenant.name} from ${normalised}`);
      }
    });

    // Delete OTP from Redis so it cannot be reused
    await redis.del(key);

    return res.json({
      success: true,
      message: 'Your free trial is confirmed!',
      data: {
        gymName: tenant.name,
        trialExpiresAt: trialExpiryDate,
        memberName: inquiry.name,
      },
    });
  } catch (err: any) {
    console.error('[trial-claim/verify]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/trial-claim/gym-info/:gymSlug
// Public: fetch basic gym info for the trial claim landing page
router.get('/gym-info/:gymSlug', async (req: Request, res: Response) => {
  try {
    const { gymSlug } = req.params;

    const Tenant = require('../models/Tenant.model').default;
    const tenant = await Tenant.findOne({ slug: gymSlug, isActive: true }).select(
      'name branding contactInfo'
    );

    if (!tenant) {
      return res.status(404).json({ success: false, message: 'Gym not found' });
    }

    return res.json({
      success: true,
      data: {
        gymName: tenant.name,
        city: tenant.contactInfo?.city || '',
        description: '',
        logo: tenant.branding?.logo || null,
        bannerImage: null,
        trialEnabled: true,
      },
    });
  } catch (err: any) {
    console.error('[trial-claim/gym-info]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
