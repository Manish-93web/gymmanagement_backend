import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import EAPSession from '../models/EAPSession.model';
import EAPResource from '../models/EAPResource.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HELPLINES = [
  { name: 'iCall (TISS)',          number: '9152987821',    availability: 'Mon-Sat 8am-10pm', type: 'text_and_call' },
  { name: 'Vandrevala Foundation', number: '1860-2662-345', availability: '24/7',             type: 'call'          },
  { name: 'NIMHANS',               number: '080-46110007',  availability: '24/7',             type: 'call'          },
  { name: 'Snehi',                 number: '044-24640050',  availability: '24/7',             type: 'call'          },
  { name: 'iCall WhatsApp',        number: '9152987821',    availability: 'Mon-Sat 8am-10pm', type: 'whatsapp'      },
];

/**
 * Generate a one-way anonymous ID from memberId + tenantId + salt.
 * The original memberId is NEVER recoverable from this hash.
 */
function generateAnonymousId(memberId: string, tenantId: string): string {
  const salt = process.env.EAP_SALT || 'eap-salt-2026';
  return crypto.createHash('sha256').update(memberId + tenantId + salt).digest('hex');
}

// ─── Resources ────────────────────────────────────────────────────────────────

// GET /eap/resources — list resources (all authenticated users, global — no tenant filter)
router.get(
  '/resources',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filter: any = { isPublic: true };
      if (req.query.category) filter.category = req.query.category;
      if (req.query.type)     filter.type     = req.query.type;
      const resources = await EAPResource.find(filter)
        .sort({ sortOrder: 1, createdAt: -1 })
        .select('-selfAssessmentQuestions')
        .lean();
      return res.json({ success: true, data: resources });
    } catch (err) { next(err); }
  }
);

// GET /eap/resources/:id — get single resource with full body + self-assessment questions
router.get(
  '/resources/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resource = await EAPResource.findOne({ _id: req.params.id, isPublic: true }).lean();
      if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });
      return res.json({ success: true, data: resource });
    } catch (err) { next(err); }
  }
);

// POST /eap/resources — create resource (super_admin only)
router.post(
  '/resources',
  requireAnyRole('super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resource = await EAPResource.create(req.body);
      return res.status(201).json({ success: true, data: resource });
    } catch (err) { next(err); }
  }
);

// ─── Sessions ─────────────────────────────────────────────────────────────────

// POST /eap/sessions/book — book a session (any member role)
// PRIVACY: memberId is NEVER stored. Only the one-way anonymousId is persisted.
router.post(
  '/sessions/book',
  requireAnyRole('member', 'trainer', 'staff', 'branch_manager', 'gym_owner', 'super_admin', 'accountant', 'auditor', 'franchise_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId  = (req as any).tenantId as string;
      const memberId  = ((req as any).user?._id ?? '').toString();
      const { sessionType, counselorType, scheduledAt, isEmergency } = req.body;

      if (!counselorType) {
        return res.status(400).json({ success: false, message: 'counselorType is required' });
      }

      // Generate one-way anonymous ID — memberId is NOT stored
      const anonymousId = generateAnonymousId(memberId, tenantId);

      const session = await EAPSession.create({
        tenantId,
        anonymousId,
        sessionType:   sessionType   || 'chat',
        counselorType,
        scheduledAt:   scheduledAt   ? new Date(scheduledAt) : undefined,
        isEmergency:   isEmergency   ?? false,
        status:        'scheduled',
      });

      return res.status(201).json({
        success: true,
        data: {
          sessionId:    session._id,
          anonymousId,
          scheduledAt:  session.scheduledAt,
          counselorType: session.counselorType,
          sessionType:  session.sessionType,
          status:       session.status,
          message:      'Your session is anonymous. We will never share your details with your employer.',
        },
      });
    } catch (err) { next(err); }
  }
);

// GET /eap/sessions/my — get member's own sessions (by anonymousId, never by memberId)
router.get(
  '/sessions/my',
  requireAnyRole('member', 'trainer', 'staff', 'branch_manager', 'gym_owner', 'super_admin', 'accountant', 'auditor', 'franchise_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const memberId = ((req as any).user?._id ?? '').toString();

      // Derive the same anonymousId — we never store the original memberId
      const anonymousId = generateAnonymousId(memberId, tenantId);

      const sessions = await EAPSession.find({ anonymousId })
        .sort({ scheduledAt: -1, createdAt: -1 })
        .select('-anonymousId -tenantId') // strip identifiers from response
        .lean();

      return res.json({ success: true, data: sessions });
    } catch (err) { next(err); }
  }
);

// PUT /eap/sessions/:id/cancel — cancel own session
router.put(
  '/sessions/:id/cancel',
  requireAnyRole('member', 'trainer', 'staff', 'branch_manager', 'gym_owner', 'super_admin', 'accountant', 'auditor', 'franchise_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;
      const memberId = ((req as any).user?._id ?? '').toString();
      const anonymousId = generateAnonymousId(memberId, tenantId);

      const session = await EAPSession.findOne({ _id: req.params.id, anonymousId });
      if (!session) {
        return res.status(404).json({ success: false, message: 'Session not found or does not belong to you' });
      }
      if (session.status !== 'scheduled') {
        return res.status(400).json({ success: false, message: `Cannot cancel a session with status '${session.status}'` });
      }

      session.status = 'cancelled';
      await session.save();

      return res.json({ success: true, data: { status: 'cancelled' } });
    } catch (err) { next(err); }
  }
);

// PUT /eap/sessions/:id/complete — mark session complete (counselor / super_admin)
router.put(
  '/sessions/:id/complete',
  requireAnyRole('super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { durationMinutes, notes, feedbackRating } = req.body;
      const session = await EAPSession.findById(req.params.id);
      if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

      session.status = 'completed';
      session.completedAt = new Date();
      if (durationMinutes) session.durationMinutes = durationMinutes;
      if (notes)           session.notes           = notes;
      if (feedbackRating)  session.feedbackRating  = feedbackRating;
      await session.save();

      return res.json({ success: true, data: { status: 'completed', completedAt: session.completedAt } });
    } catch (err) { next(err); }
  }
);

// ─── Aggregate Stats (HR / Admin) ─────────────────────────────────────────────

// GET /eap/stats/aggregate — ONLY aggregate stats, NEVER individual data
router.get(
  '/stats/aggregate',
  requireAnyRole('gym_owner', 'super_admin', 'branch_manager', 'franchise_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId as string;

      const now       = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalThisMonth,
        completedThisMonth,
        typeBreakdown,
        durationAgg,
        totalAllTime,
      ] = await Promise.all([
        EAPSession.countDocuments({ tenantId, createdAt: { $gte: monthStart } }),
        EAPSession.countDocuments({ tenantId, status: 'completed', createdAt: { $gte: monthStart } }),
        EAPSession.aggregate([
          { $match: { tenantId, createdAt: { $gte: monthStart } } },
          { $group: { _id: '$counselorType', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        EAPSession.aggregate([
          { $match: { tenantId, status: 'completed', durationMinutes: { $exists: true } } },
          { $group: { _id: null, avg: { $avg: '$durationMinutes' } } },
        ]),
        EAPSession.countDocuments({ tenantId }),
      ]);

      const completionRate = totalThisMonth > 0
        ? Math.round((completedThisMonth / totalThisMonth) * 100)
        : 0;

      const topCounselorTypes = typeBreakdown.map((t: any) => ({ type: t._id, count: t.count }));
      const avgSessionDuration = durationAgg[0]?.avg ? Math.round(durationAgg[0].avg) : 0;

      // Utilization rate: sessions this month per 100 enrolled employees (estimate only)
      const utilizationRate = totalThisMonth; // raw count; caller can compute /employees*100

      return res.json({
        success: true,
        data: {
          // AGGREGATE ONLY — no individual session IDs, anonymousIds, or member data returned
          totalSessionsThisMonth: totalThisMonth,
          completedSessionsThisMonth: completedThisMonth,
          completionRate,
          topCounselorTypes,
          avgSessionDuration,
          utilizationRate,
          totalSessionsAllTime: totalAllTime,
          privacy_notice: 'Individual data is never accessible. Only team-level statistics are shown.',
        },
      });
    } catch (err) { next(err); }
  }
);

// ─── Helplines ─────────────────────────────────────────────────────────────────

// GET /eap/helplines — hardcoded Indian mental health helplines (all authenticated users)
router.get(
  '/helplines',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      return res.json({ success: true, data: HELPLINES });
    } catch (err) { next(err); }
  }
);

// ─── Seed Resources ───────────────────────────────────────────────────────────

// POST /eap/seed-resources — seed initial EAP content (super_admin only)
router.post(
  '/seed-resources',
  requireAnyRole('super_admin'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await EAPResource.countDocuments();
      if (existing > 0) {
        return res.json({ success: true, message: `Seed skipped — ${existing} resources already exist.` });
      }

      const seeds = [
        {
          title: 'Understanding Workplace Anxiety',
          category: 'anxiety',
          type: 'article',
          body: `<h2>What is Workplace Anxiety?</h2>
<p>Workplace anxiety is a persistent feeling of worry, unease, or nervousness related to your job. It is one of the most common mental health challenges faced by employees across all industries.</p>
<h3>Common Triggers</h3>
<ul>
  <li>Excessive workload or tight deadlines</li>
  <li>Fear of making mistakes or being judged</li>
  <li>Interpersonal conflicts with colleagues or managers</li>
  <li>Job insecurity or organisational change</li>
  <li>Lack of clarity about role expectations</li>
</ul>
<h3>Signs to Watch For</h3>
<ul>
  <li>Difficulty concentrating on tasks</li>
  <li>Frequent headaches or muscle tension</li>
  <li>Trouble sleeping the night before work</li>
  <li>Avoiding certain tasks or colleagues</li>
  <li>Feeling irritable or on edge throughout the day</li>
</ul>
<h3>Coping Strategies</h3>
<ol>
  <li><strong>Name the feeling:</strong> Acknowledge that what you feel is anxiety — not weakness.</li>
  <li><strong>Break tasks down:</strong> Large projects feel manageable as a series of small steps.</li>
  <li><strong>Set boundaries:</strong> Define your working hours and communicate them clearly.</li>
  <li><strong>Breathing exercises:</strong> Even 5 minutes of controlled breathing lowers cortisol.</li>
  <li><strong>Talk to someone:</strong> Reach out to a trusted colleague, friend, or our EAP counsellors.</li>
</ol>
<p><em>If anxiety is significantly affecting your daily life, please reach out to an EAP counsellor — it is completely confidential.</em></p>`,
          tags: ['anxiety', 'work', 'stress'],
          sortOrder: 1,
        },
        {
          title: 'Box Breathing Exercise (4-7-8 Technique)',
          category: 'anxiety',
          type: 'exercise',
          duration: 5,
          body: `<h2>Box Breathing — 4-7-8 Technique</h2>
<p>This simple breathing technique activates your parasympathetic nervous system, reducing anxiety and stress within minutes.</p>
<h3>How to Practice</h3>
<ol>
  <li><strong>Exhale completely</strong> through your mouth (push all air out).</li>
  <li><strong>Inhale</strong> quietly through your nose for <strong>4 counts</strong>.</li>
  <li><strong>Hold</strong> your breath for <strong>7 counts</strong>.</li>
  <li><strong>Exhale</strong> completely through your mouth for <strong>8 counts</strong> (make a whoosh sound).</li>
  <li>This is one breath cycle. Repeat <strong>3–4 times</strong>.</li>
</ol>
<h3>Tips</h3>
<ul>
  <li>Sit upright with your back straight</li>
  <li>Place the tip of your tongue behind your upper front teeth</li>
  <li>Practice at least twice daily for best results</li>
  <li>Use before stressful meetings, difficult conversations, or whenever anxiety spikes</li>
</ul>
<p><em>Total time: 5 minutes. Practice daily for maximum benefit.</em></p>`,
          tags: ['breathing', 'anxiety', 'stress relief', 'quick exercise'],
          sortOrder: 2,
        },
        {
          title: 'Signs of Burnout Self-Assessment',
          category: 'burnout',
          type: 'self_assessment',
          body: `<h2>Burnout Self-Assessment</h2>
<p>Answer each question honestly. Your responses are private and never shared with your employer.</p>
<p><strong>Scoring:</strong> 0–10: Low burnout risk | 11–20: Moderate — consider lifestyle changes | 21–30: High — please speak with an EAP counsellor</p>`,
          selfAssessmentQuestions: [
            {
              question: 'How often do you feel emotionally exhausted at the end of your work day?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you feel detached or cynical about your work?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you feel that your work no longer has meaning?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you struggle to concentrate on your tasks?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you feel physical symptoms (headaches, muscle aches) related to work stress?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you dread going to work?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you feel that nothing you do at work matters?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you neglect personal needs (sleep, food, exercise) because of work?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you feel irritable or impatient with people around you?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
            {
              question: 'How often do you feel that you cannot recover your energy even on weekends?',
              options: ['Never', 'Rarely', 'Sometimes', 'Often'],
              scores: [0, 1, 2, 3],
            },
          ],
          tags: ['burnout', 'self-assessment', 'work stress'],
          sortOrder: 3,
        },
        {
          title: 'Dealing with Grief at Work',
          category: 'grief',
          type: 'article',
          body: `<h2>Grief and the Workplace</h2>
<p>Grief is a natural response to loss — the death of a loved one, the end of a relationship, a health diagnosis, or even the loss of a role or career phase. It does not follow a tidy schedule, and it often surfaces at work.</p>
<h3>How Grief Affects Work</h3>
<ul>
  <li>Difficulty concentrating or making decisions</li>
  <li>Reduced productivity or motivation</li>
  <li>Feeling emotionally fragile or tearful unexpectedly</li>
  <li>Withdrawing from colleagues</li>
  <li>Fatigue from the emotional weight of grief</li>
</ul>
<h3>Practical Strategies</h3>
<ol>
  <li><strong>Acknowledge your grief:</strong> Do not try to suppress or rush through it. Grief is not a problem to solve.</li>
  <li><strong>Communicate with your manager:</strong> You do not need to share details, but letting them know you are going through a difficult time can help manage expectations.</li>
  <li><strong>Create a support network:</strong> Identify one or two trusted colleagues you can talk to.</li>
  <li><strong>Use bereavement leave:</strong> Take the time you are entitled to without guilt.</li>
  <li><strong>Seek professional support:</strong> EAP counsellors are trained in grief support and your sessions are 100% confidential.</li>
</ol>
<h3>A Note for Colleagues</h3>
<p>If a colleague is grieving, sometimes the most powerful thing you can do is simply say: "I am so sorry. I am here if you need anything." Do not try to fix it — just be present.</p>`,
          tags: ['grief', 'loss', 'bereavement', 'work'],
          sortOrder: 4,
        },
        {
          title: 'Managing Relationship Stress',
          category: 'relationships',
          type: 'article',
          body: `<h2>Relationship Stress and Mental Health</h2>
<p>Stress from personal relationships — whether with a partner, family member, or close friend — spills over into every area of life, including work performance and physical health.</p>
<h3>Common Relationship Stressors</h3>
<ul>
  <li>Communication breakdowns and recurring arguments</li>
  <li>Financial disagreements</li>
  <li>Parenting differences</li>
  <li>Feeling unsupported or misunderstood</li>
  <li>Distance — geographical or emotional</li>
  <li>Major life transitions (new baby, relocation, retirement)</li>
</ul>
<h3>Building Healthier Patterns</h3>
<ol>
  <li><strong>Active listening:</strong> Focus on understanding, not on preparing your rebuttal.</li>
  <li><strong>Use "I" statements:</strong> "I feel unheard when…" rather than "You always ignore me…"</li>
  <li><strong>Schedule connection time:</strong> Even 20 minutes of undivided attention daily strengthens bonds.</li>
  <li><strong>Manage your own emotional state first:</strong> You cannot have a productive conversation when flooded with emotion. Take a break and return when calm.</li>
  <li><strong>Consider couples or family counselling:</strong> Professional support is not a sign of failure — it is a practical tool.</li>
</ol>
<h3>When to Seek Help</h3>
<p>If you feel unsafe in a relationship, or if relationship stress is causing significant anxiety, depression, or physical symptoms, please reach out to an EAP counsellor. All sessions are completely anonymous.</p>`,
          tags: ['relationships', 'stress', 'family', 'communication'],
          sortOrder: 5,
        },
        {
          title: 'Financial Stress and Mental Health',
          category: 'finance',
          type: 'article',
          body: `<h2>The Mental Health Impact of Financial Stress</h2>
<p>Money worries are among the leading causes of anxiety, depression, and relationship conflict in India and globally. Understanding the link between financial stress and mental health is the first step toward managing both.</p>
<h3>How Financial Stress Affects You</h3>
<ul>
  <li>Persistent worry and difficulty sleeping</li>
  <li>Shame and avoidance behaviours (ignoring bills, not checking bank balance)</li>
  <li>Relationship tension and arguments</li>
  <li>Difficulty concentrating at work</li>
  <li>Physical symptoms: headaches, digestive issues, chest tightness</li>
</ul>
<h3>Breaking the Cycle</h3>
<ol>
  <li><strong>Name the problem:</strong> Write down exactly what is worrying you financially. Vague anxiety is worse than a defined challenge.</li>
  <li><strong>Create a basic budget:</strong> List income vs. essential expenses. Knowing the reality is less frightening than imagining it.</li>
  <li><strong>Prioritise debts:</strong> Focus on high-interest debt first. Small wins build momentum.</li>
  <li><strong>Seek information:</strong> Free financial counselling is available through government schemes like PMJDY and non-profits like Disha (HDFC).</li>
  <li><strong>Talk to someone:</strong> EAP counsellors can help you process the emotional weight of financial stress — not give financial advice, but help you think clearly.</li>
</ol>
<h3>Emergency Resources</h3>
<ul>
  <li>National Legal Services Authority (NALSA): 15100</li>
  <li>PM-CARES for distress relief</li>
  <li>Local district welfare officers for emergency assistance</li>
</ul>`,
          tags: ['finance', 'money', 'stress', 'anxiety', 'debt'],
          sortOrder: 6,
        },
        {
          title: 'Crisis Support Resources',
          category: 'crisis',
          type: 'article',
          body: `<h2>Crisis Support — You Are Not Alone</h2>
<p>If you are experiencing a mental health crisis, please reach out immediately. All helplines below are free and confidential.</p>
<div style="background:#fee2e2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px">
  <strong>If you are in immediate danger, call 112 (Emergency).</strong>
</div>
<h3>Indian Mental Health Helplines</h3>
<table>
  <tr><th>Organisation</th><th>Number</th><th>Hours</th><th>Type</th></tr>
  <tr><td>iCall (TISS)</td><td>9152987821</td><td>Mon–Sat 8am–10pm</td><td>Call &amp; Chat</td></tr>
  <tr><td>Vandrevala Foundation</td><td>1860-2662-345</td><td>24/7</td><td>Call</td></tr>
  <tr><td>NIMHANS</td><td>080-46110007</td><td>24/7</td><td>Call</td></tr>
  <tr><td>Snehi</td><td>044-24640050</td><td>24/7</td><td>Call</td></tr>
  <tr><td>iCall WhatsApp</td><td>9152987821</td><td>Mon–Sat 8am–10pm</td><td>WhatsApp</td></tr>
  <tr><td>AASRA</td><td>9820466627</td><td>24/7</td><td>Call</td></tr>
</table>
<h3>What to Expect When You Call</h3>
<ul>
  <li>A trained counsellor will answer (no robots)</li>
  <li>The call is free and confidential</li>
  <li>You do not need to explain yourself — just say "I need help"</li>
  <li>The counsellor will not judge you or contact anyone without your explicit consent</li>
</ul>
<h3>Supporting a Colleague in Crisis</h3>
<ul>
  <li>Stay with them — do not leave them alone</li>
  <li>Listen without judgement</li>
  <li>Do not promise to keep secrets about safety</li>
  <li>Help them contact a helpline or take them to a hospital if needed</li>
</ul>
<p><em>You can also book an emergency EAP session — select "Emergency" when booking. A counsellor will prioritise your request.</em></p>`,
          tags: ['crisis', 'suicide prevention', 'emergency', 'helplines'],
          sortOrder: 7,
        },
        {
          title: 'Mindful Walking Exercise',
          category: 'general',
          type: 'exercise',
          duration: 10,
          body: `<h2>Mindful Walking — 10-Minute Practice</h2>
<p>Mindful walking combines the physical benefits of movement with the mental benefits of mindfulness. No special equipment needed — just 10 minutes and a space to walk.</p>
<h3>Instructions</h3>
<ol>
  <li><strong>Start standing still (1 minute):</strong> Take three deep breaths. Feel your feet on the ground. Notice your posture.</li>
  <li><strong>Begin walking slowly (2 minutes):</strong> Pay attention to the sensation of each foot lifting, moving forward, and landing. Notice left-right, left-right.</li>
  <li><strong>Expand awareness (3 minutes):</strong> Extend your attention to sounds around you — without judging them. Notice colours, shapes, light.</li>
  <li><strong>Body scan while walking (2 minutes):</strong> Scan from head to toe. Notice any tension — shoulders, jaw, hands. Let them soften.</li>
  <li><strong>Gratitude focus (1 minute):</strong> As you walk, silently name three things you are grateful for today.</li>
  <li><strong>Return to stillness (1 minute):</strong> Slow down. Stop. Take three final deep breaths and notice how you feel compared to when you started.</li>
</ol>
<h3>Tips</h3>
<ul>
  <li>You can practise indoors (in a corridor) or outdoors</li>
  <li>Leave your phone in your pocket or bag — no scrolling</li>
  <li>If your mind wanders, gently return focus to your feet — this is normal and part of the practice</li>
  <li>Daily practice delivers cumulative benefits for stress, focus, and mood</li>
</ul>`,
          tags: ['mindfulness', 'walking', 'general wellness', 'stress relief'],
          sortOrder: 8,
        },
      ];

      const created = await EAPResource.insertMany(seeds as any[]);
      return res.status(201).json({
        success: true,
        message: `${created.length} EAP resources seeded successfully.`,
        data: created.map((r: any) => ({ _id: r._id, title: r.title, category: r.category, type: r.type })),
      });
    } catch (err) { next(err); }
  }
);

export default router;
