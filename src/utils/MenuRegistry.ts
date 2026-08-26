/**
 * Canonical registry of every gateable sidebar (web) / drawer (mobile) menu
 * item, keyed by a stable string used by Tenant.allowedMenuKeys. Each entry
 * declares which platform(s) it actually appears on, since the web Sidebar
 * (~96 items with submenus) and the mobile drawer (~59 flat items) are not
 * 1:1 — a Super Admin's single selection filters whichever platform(s) an
 * item applies to. Core items (Dashboard, Settings, Account Security,
 * Notifications) are intentionally absent — they're always visible and
 * never gated, so a tenant with nothing else granted still has a usable
 * shell. Regenerated from Sidebar.tsx NavItems + DrawerNavigator.tsx
 * DRAWER_ITEMS; keep in sync if either nav structure changes.
 */

export type MenuPlatform = 'web' | 'mobile';

export interface MenuRegistryEntry {
  key: string;
  label: string;
  category: string;
  platforms: MenuPlatform[];
}

export const MENU_CATEGORIES = [
  'Members & CRM',
  'Attendance & Check-in',
  'Classes & Events',
  'Trainers & Staff',
  'Finance & Billing',
  'Reports & Revenue',
  'Health & Fitness',
  'Community & Gamification',
  'AI',
  'Franchise & Corporate',
  'Support & Notifications',
  'Settings & Admin'
];

export const MENU_REGISTRY: MenuRegistryEntry[] = [
  // ── Members & CRM ───────────────────────────────────────────────
  { key: 'crm.bot', label: 'Bot Flow Editor', category: 'Members & CRM', platforms: ['web'] },
  { key: 'members.bulk-ops', label: 'Bulk Member Ops', category: 'Members & CRM', platforms: ['web'] },
  { key: 'marketing.analytics', label: 'Conversion analytics', category: 'Members & CRM', platforms: ['web'] },
  { key: 'members.coupon-redemption', label: 'Coupon Redemption', category: 'Members & CRM', platforms: ['web'] },
  { key: 'crm-sales-marketing', label: 'CRM, SALES & MARKETING', category: 'Members & CRM', platforms: ['web', 'mobile'] },
  { key: 'marketing.discounts', label: 'Discount campaigns', category: 'Members & CRM', platforms: ['web'] },
  { key: 'marketing.campaigns', label: 'Email campaigns', category: 'Members & CRM', platforms: ['web'] },
  { key: 'crm.followups', label: 'Follow-ups Queue', category: 'Members & CRM', platforms: ['web'] },
  { key: 'members.schedule', label: 'Gym Schedule', category: 'Members & CRM', platforms: ['web'] },
  { key: 'inquiries', label: 'Inquiries', category: 'Members & CRM', platforms: ['web', 'mobile'] },
  { key: 'crm.leads.intake', label: 'Lead Intake Studio', category: 'Members & CRM', platforms: ['web'] },
  { key: 'marketing', label: 'Marketing', category: 'Members & CRM', platforms: ['mobile'] },
  { key: 'members.health-profiles', label: 'Member Health Profile', category: 'Members & CRM', platforms: ['web', 'mobile'] },
  { key: 'members.renewal', label: 'Member Renewal', category: 'Members & CRM', platforms: ['web', 'mobile'] },
  { key: 'members', label: 'Members', category: 'Members & CRM', platforms: ['web'] },
  { key: 'membership-transfers', label: 'Membership Transfer', category: 'Members & CRM', platforms: ['web', 'mobile'] },
  { key: 'marketing.referrals', label: 'Referral programs', category: 'Members & CRM', platforms: ['web'] },
  { key: 'retention', label: 'Retention', category: 'Members & CRM', platforms: ['web', 'mobile'] },
  { key: 'crm.dashboard', label: 'Sales Funnel Hub', category: 'Members & CRM', platforms: ['web'] },
  // ── Attendance & Check-in ───────────────────────────────────────
  { key: 'attendance.biometric.reports.active_members', label: 'Active Members', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance', label: 'Attendance', category: 'Attendance & Check-in', platforms: ['web', 'mobile'] },
  { key: 'dashboard.biometric', label: 'Biometric Devices', category: 'Attendance & Check-in', platforms: ['web', 'mobile'] },
  { key: 'attendance.biometric.reports.branch', label: 'Branch Comparison', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance.checkin-panel', label: 'Check-In Panel', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance.biometric.reports.daily', label: 'Daily Attendance', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance.biometric.reports.device_uptime', label: 'Device Uptime', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance.biometric.reports.inactive', label: 'Inactive Members', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance.live', label: 'Live Check-In', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance.biometric.reports.monthly', label: 'Monthly Visits', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance.biometric.reports.peak_hours', label: 'Peak Hour Chart', category: 'Attendance & Check-in', platforms: ['web'] },
  { key: 'attendance.biometric.reports.frequent', label: 'Top Visitors', category: 'Attendance & Check-in', platforms: ['web'] },
  // ── Classes & Events ────────────────────────────────────────────
  { key: 'classes', label: 'Classes', category: 'Classes & Events', platforms: ['web'] },
  { key: 'facilities', label: 'Facility Booking', category: 'Classes & Events', platforms: ['web', 'mobile'] },
  { key: 'events', label: 'Fitness Events', category: 'Classes & Events', platforms: ['web', 'mobile'] },
  // ── Trainers & Staff ────────────────────────────────────────────
  { key: 'staff.attendance-calendar', label: 'Attendance Calendar', category: 'Trainers & Staff', platforms: ['web'] },
  { key: 'staff.logs', label: 'Call & WhatsApp logs', category: 'Trainers & Staff', platforms: ['web'] },
  { key: 'staff.deduction-settings', label: 'Deduction Settings', category: 'Trainers & Staff', platforms: ['web'] },
  { key: 'trainer', label: 'My Trainer Dashboard', category: 'Trainers & Staff', platforms: ['web', 'mobile'] },
  { key: 'staff', label: 'Staff', category: 'Trainers & Staff', platforms: ['mobile'] },
  { key: 'staff.attendance', label: 'Staff Attendance', category: 'Trainers & Staff', platforms: ['web'] },
  { key: 'staff.trainers', label: 'Trainer Management', category: 'Trainers & Staff', platforms: ['web', 'mobile'] },
  // ── Finance & Billing ───────────────────────────────────────────
  { key: 'dashboard.subscription', label: 'Billing & Plan', category: 'Finance & Billing', platforms: ['web'] },
  { key: 'cafeteria', label: 'Cafeteria POS', category: 'Finance & Billing', platforms: ['web', 'mobile'] },
  { key: 'finance.credit-notes', label: 'Credit Notes', category: 'Finance & Billing', platforms: ['web'] },
  { key: 'finance.gst-settings', label: 'GST Settings', category: 'Finance & Billing', platforms: ['web'] },
  { key: 'marketplace', label: 'Marketplace', category: 'Finance & Billing', platforms: ['web', 'mobile'] },
  { key: 'finance', label: 'Payments', category: 'Finance & Billing', platforms: ['web', 'mobile'] },
  { key: 'pos', label: 'POS / Store', category: 'Finance & Billing', platforms: ['web'] },
  { key: 'finance.refund-policy', label: 'Refund Policy', category: 'Finance & Billing', platforms: ['web'] },
  { key: 'finance.refund-requests', label: 'Refund Requests', category: 'Finance & Billing', platforms: ['web', 'mobile'] },
  // ── Reports & Revenue ───────────────────────────────────────────
  { key: 'analytics', label: 'Analytics', category: 'Reports & Revenue', platforms: ['mobile'] },
  { key: 'reports.irregular-members', label: 'Irregular Members', category: 'Reports & Revenue', platforms: ['web', 'mobile'] },
  { key: 'reports.plan-reports', label: 'Plan Reports', category: 'Reports & Revenue', platforms: ['web'] },
  { key: 'dynamic-pricing.simulator', label: 'Pricing Simulator', category: 'Reports & Revenue', platforms: ['web'] },
  { key: 'reports', label: 'Reports', category: 'Reports & Revenue', platforms: ['web', 'mobile'] },
  { key: 'admin.revenue', label: 'Revenue', category: 'Reports & Revenue', platforms: ['web'] },
  { key: 'dynamic-pricing', label: 'Smart Pricing', category: 'Reports & Revenue', platforms: ['web', 'mobile'] },
  { key: 'reports.trial-conversion', label: 'Trial Conversion', category: 'Reports & Revenue', platforms: ['web', 'mobile'] },
  // ── Health & Fitness ────────────────────────────────────────────
  { key: 'abha', label: 'ABHA Health ID', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'form-sessions.live', label: 'AI Form Correction', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'body-composition', label: 'BMI Machine / InBody', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'nutrition.condition-filter', label: 'Condition Nutrition Filter', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'condition-protocols', label: 'Condition Protocols', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'content.hub', label: 'Content Hub', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'wellness-plans', label: 'Digital Wellness Plans', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'eap', label: 'EAP Mental Health', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'eating-out', label: 'Eating Out Advisor', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'nutrition.favourites', label: 'Favourite Meals', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'diet.library', label: 'Food Library', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'health.articles', label: 'Health Articles Admin', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'health.calculators', label: 'Health Calculators', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'health.feed', label: 'Health Feed', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'health-hub', label: 'Health Hub', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'health.risk-assessment', label: 'Health Risk & AI Profile', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'content.web-stories', label: 'Health Stories', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'health-wallet', label: 'Health Wallet', category: 'Health & Fitness', platforms: ['mobile'] },
  { key: 'insurance', label: 'Insurance & Wellness', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'health-checkups', label: 'Lab Health Checkups', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'health', label: 'My Health', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'diet', label: 'Nutrition Hub', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'pharmacy-vouchers', label: 'Pharmacy Vouchers', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'health.data-export', label: 'Share with Doctor', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'tele-consultation', label: 'Tele-Consultation', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'health.video-library', label: 'Video Library & Wellness', category: 'Health & Fitness', platforms: ['web'] },
  { key: 'progress.wellness-checkin', label: 'Wellness Check-In', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  { key: 'fitness', label: 'Workout Studio', category: 'Health & Fitness', platforms: ['web', 'mobile'] },
  // ── Community & Gamification ────────────────────────────────────
  { key: 'gamification.challenge-678', label: '6-7-8 Challenge', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  { key: 'community', label: 'Community', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  { key: 'community.friend-challenges', label: 'Friend Challenges', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  { key: 'gamification', label: 'Gamification', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  { key: 'reviews', label: 'Gym Reviews', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  { key: 'gamification.habit-challenges', label: 'Habit Challenges', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  { key: 'gamification.monthly-challenges', label: 'Monthly Challenges', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  { key: 'gamification.points-expiry', label: 'Points Expiry', category: 'Community & Gamification', platforms: ['web'] },
  { key: 'progressive-challenges', label: 'Progressive Challenges', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  { key: 'step-challenges', label: 'Step Challenges', category: 'Community & Gamification', platforms: ['web', 'mobile'] },
  // ── AI ──────────────────────────────────────────────────────────
  { key: 'ai-hub', label: 'AI Intelligence Hub', category: 'AI', platforms: ['web', 'mobile'] },
  // ── Franchise & Corporate ───────────────────────────────────────
  { key: 'corporate', label: 'Corporate Wellness', category: 'Franchise & Corporate', platforms: ['web'] },
  { key: 'franchise', label: 'Franchise Intel', category: 'Franchise & Corporate', platforms: ['web', 'mobile'] },
  // ── Support & Notifications ─────────────────────────────────────
  { key: 'whatsapp.bot-config', label: 'AI Sales Bot', category: 'Support & Notifications', platforms: ['web'] },
  { key: 'announcements', label: 'Announcements', category: 'Support & Notifications', platforms: ['mobile'] },
  { key: 'support.complaints', label: 'Complaints', category: 'Support & Notifications', platforms: ['web', 'mobile'] },
  { key: 'whatsapp.groups', label: 'WA Community Groups', category: 'Support & Notifications', platforms: ['web', 'mobile'] },
  { key: 'whatsapp', label: 'WhatsApp', category: 'Support & Notifications', platforms: ['mobile'] },
  { key: 'whatsapp.digest', label: 'WhatsApp Digest', category: 'Support & Notifications', platforms: ['web'] },
  // ── Settings & Admin ────────────────────────────────────────────
  { key: 'admin', label: 'Admin Dashboard', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'settings.automation', label: 'Automation Rules', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'security.devices', label: 'Device Enforcement', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'equipment', label: 'Equipment Maintenance', category: 'Settings & Admin', platforms: ['web', 'mobile'] },
  { key: 'settings.google-business', label: 'Google Business Profile', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'admin.gyms', label: 'Gym Management', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'settings.gym-profile', label: 'Gym Public Profile', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'settings.qr-code', label: 'Gym QR Code', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'security', label: 'Security Dashboard', category: 'Settings & Admin', platforms: ['web', 'mobile'] },
  { key: 'settings.trial-claim', label: 'Trial Claim Settings', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'settings.website', label: 'Website Content', category: 'Settings & Admin', platforms: ['web'] },
  { key: 'white-label', label: 'White-Label App Studio', category: 'Settings & Admin', platforms: ['web'] },
];

export const MENU_REGISTRY_KEYS = new Set(MENU_REGISTRY.map(e => e.key));
