import DigestSettings from '../models/DigestSettings.model';

// Try to import models — handle missing ones gracefully
let Member: any, Attendance: any, Payment: any, Subscription: any, Tenant: any;
try { Member = require('../models/Member.model').default; } catch {}
try { Attendance = require('../models/Attendance.model').default; } catch {}
try { Payment = require('../models/Payment.model').default; } catch {}
try { Subscription = require('../models/Subscription.model').default; } catch {}
try { Tenant = require('../models/Tenant.model').default; } catch {}

// Try to get WhatsApp service
let whatsappService: any;
try { whatsappService = require('./whatsapp.service'); } catch {}

export async function generateAndSendDigest(tenantId: string): Promise<string> {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const start = new Date(yesterday.setHours(0, 0, 0, 0));
  const end = new Date(yesterday.setHours(23, 59, 59, 999));
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let newMembers = 0, checkIns = 0, revenue = 0, expiring = 0, activeMembers = 0;

  try {
    if (Member) newMembers = await Member.countDocuments({ tenantId, createdAt: { $gte: start, $lte: end } });
    if (Attendance) checkIns = await Attendance.countDocuments({ tenantId, checkInTime: { $gte: start, $lte: end } });
    if (Payment) {
      const rev = await Payment.aggregate([
        { $match: { tenantId, createdAt: { $gte: start, $lte: end }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]);
      revenue = rev[0]?.total || 0;
    }
    if (Subscription) {
      expiring = await Subscription.countDocuments({ tenantId, endDate: { $gte: now, $lte: sevenDaysFromNow }, status: 'active' });
      activeMembers = await Subscription.countDocuments({ tenantId, status: 'active' });
    }
  } catch (e) {
    console.error('[DigestService] Error fetching stats:', e);
  }

  const dateStr = start.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const message = `🏋️ *Good Morning! Daily Gym Report*\n📅 *Date:* ${dateStr}\n\n📊 *Yesterday's Summary*\n👥 New Members: ${newMembers}\n✅ Check-ins: ${checkIns}\n💰 Revenue: ₹${revenue.toLocaleString('en-IN')}\n\n⚠️ *Renewals Due This Week:* ${expiring}\n🏃 *Total Active Members:* ${activeMembers}\n\n_Sent by Gym Management System_`;

  return message;
}

export async function sendDigestNow(tenantId: string): Promise<{ success: boolean; message: string }> {
  try {
    const settings = await DigestSettings.findOne({ tenantId });
    if (!settings || !settings.enabled) {
      return { success: false, message: 'Digest not enabled for this tenant' };
    }

    const message = await generateAndSendDigest(tenantId);

    if (whatsappService?.sendMessage) {
      await whatsappService.sendMessage(settings.phoneNumber, message);
    } else {
      console.log(`[DigestService] WhatsApp not available. Message for ${settings.phoneNumber}:\n${message}`);
    }

    await DigestSettings.findOneAndUpdate({ tenantId }, { lastSentAt: new Date() });
    return { success: true, message };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
}

export function scheduleDailyDigest(): void {
  // Run every 5 minutes, check if any tenant needs their digest
  const checkAndSend = async () => {
    try {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Find tenants whose sendTime matches current hour:minute (within 5 min window)
      const allSettings = await DigestSettings.find({ enabled: true });
      for (const settings of allSettings) {
        const [sendHour, sendMinute] = settings.sendTime.split(':').map(Number);
        if (currentHour === sendHour && Math.abs(currentMinute - sendMinute) < 5) {
          // Check if already sent today
          const lastSent = settings.lastSentAt;
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          if (!lastSent || lastSent < todayStart) {
            console.log(`[DigestService] Sending digest for tenant ${settings.tenantId}`);
            await sendDigestNow(settings.tenantId);
          }
        }
      }
    } catch (e) {
      console.error('[DigestService] Schedule check error:', e);
    }
  };

  // Check every 5 minutes
  setInterval(checkAndSend, 5 * 60 * 1000);
  console.log('[DigestService] Daily WhatsApp digest scheduler started');
}
