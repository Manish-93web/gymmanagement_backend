/**
 * seedHealthArticles.ts
 *
 * Seeds 9 starter health articles (platform-wide, tenantId = null) across all
 * 8 HealthArticle categories. Safe to re-run — upserts on slug.
 *
 * Run:  npx ts-node -r tsconfig-paths/register src/scripts/seedHealthArticles.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import HealthArticle from '../models/HealthArticle.model';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-management';

const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const ARTICLES = [
  // ── Workouts ──────────────────────────────────────────────────────────────
  {
    title: 'The 5 Compound Exercises Every Beginner Should Master First',
    category: 'Workouts',
    author: 'Gym.OS Fitness Team',
    authorRole: 'Certified Strength & Conditioning Specialists',
    excerpt: 'Forget isolation exercises. These five movement patterns build strength, burn calories, and build muscle faster than anything else you can do in the gym.',
    body: `<h2>Why Compound Movements Win</h2>
<p>Compound exercises recruit multiple muscle groups simultaneously, giving you the most return on your training time. For a beginner, they also train the nervous system to coordinate muscle groups — a skill that accelerates all future progress.</p>

<h2>The Big 5</h2>
<h3>1. Squat — The King of Leg Exercises</h3>
<p>Targets: Quadriceps, hamstrings, glutes, core, and back. Start with a bodyweight squat until you can do 20 with perfect form (chest up, knees tracking over toes, hips below parallel). Then add a goblet squat with a dumbbell, then progress to barbell back squat.</p>

<h3>2. Hip Hinge / Deadlift</h3>
<p>Targets: Hamstrings, glutes, lower back, traps, and core. The hip hinge is a fundamental human movement pattern. Start with a Romanian deadlift (RDL) using light dumbbells. Key cue: push your hips back to a wall behind you, keep back flat, then squeeze glutes to stand.</p>

<h3>3. Push-Up / Bench Press</h3>
<p>Targets: Chest, shoulders, and triceps. A perfect push-up (body like a plank, elbows at 45°, chest touching floor) is more useful than a sloppy bench press. Once you can do 20 push-ups, you're ready for the bench.</p>

<h3>4. Row (Dumbbell or Cable)</h3>
<p>Targets: Lats, rhomboids, rear deltoids, and biceps. Every push needs a pull. The single-arm dumbbell row is the easiest to learn. Drive your elbow behind your body, squeeze at the top, and control the descent.</p>

<h3>5. Overhead Press</h3>
<p>Targets: Anterior deltoid, lateral deltoid, triceps, and upper traps. Press a dumbbell from shoulder height to full arm extension overhead. Brace your core to prevent lower back arch. Progress to a barbell overhead press as strength increases.</p>

<h2>How to Structure These Movements</h2>
<p>A full-body workout using all 5 movements, 3× per week, with progressive overload (adding a small amount of weight or reps each session), will produce measurable results in 8–12 weeks for any beginner.</p>`,
    tags: ['beginner', 'strength training', 'compound exercises', 'gym basics'],
    readTimeMinutes: 5,
    isFeatured: true,
    status: 'published',
  },

  // ── Nutrition ─────────────────────────────────────────────────────────────
  {
    title: 'High-Protein Indian Meals: 20 Foods That Hit 20g Protein Per Serving',
    category: 'Nutrition',
    author: 'Gym.OS Nutrition Team',
    authorRole: 'Registered Dietitian',
    excerpt: 'Protein doesn\'t require expensive supplements or chicken breast. These 20 Indian foods deliver 20g+ protein per serving — and most are already in your kitchen.',
    body: `<h2>Why 20g Per Serving Matters</h2>
<p>Research consistently shows that 20–40g protein per meal maximises muscle protein synthesis. Below this threshold, some stimulus is wasted. Spreading protein across 3–4 meals beats one large protein hit.</p>

<h2>The List</h2>
<h3>Animal Sources</h3>
<ul>
  <li><strong>3 whole eggs:</strong> 18g protein — nearly at 20g, add 1 egg white to reach it</li>
  <li><strong>100g chicken breast (cooked):</strong> 31g — best per-rupee animal protein</li>
  <li><strong>150g fish (rohu, surmai, or tuna):</strong> 24–28g depending on species</li>
  <li><strong>1 cup low-fat dahi (curd):</strong> 10g — pair 2 cups with a meal for 20g</li>
  <li><strong>100g paneer:</strong> 18g + high fat; keep portions moderate if losing weight</li>
  <li><strong>2 cups skimmed milk:</strong> 16g — add to protein smoothie to reach 20g</li>
</ul>

<h3>Plant Sources</h3>
<ul>
  <li><strong>1 cup cooked rajma:</strong> 15g — pair with 50g paneer or an egg to reach 20g</li>
  <li><strong>1 cup cooked chana dal:</strong> 14g — combine with rice for complete amino profile</li>
  <li><strong>1.5 cups cooked moong dal:</strong> 20g — one of the fastest-digesting plant proteins</li>
  <li><strong>100g roasted chana (dal):</strong> 22g — best portable high-protein Indian snack</li>
  <li><strong>3 tbsp peanut butter:</strong> 21g — pair with roti for a high-protein snack</li>
  <li><strong>150g firm tofu:</strong> 18g — marinate in spices and pan-fry as paneer substitute</li>
  <li><strong>1 cup cooked edamame:</strong> 17g — frozen bags available in Indian metro cities</li>
  <li><strong>4 tbsp hemp seeds:</strong> 20g — add to curd, smoothies, or chutneys</li>
</ul>

<h2>Practical 20g Protein Meal Ideas</h2>
<p><strong>Breakfast:</strong> 3 eggs + 2 egg whites scrambled with vegetables (26g protein)</p>
<p><strong>Lunch:</strong> Rajma (1 cup) + brown rice + curd (28g combined)</p>
<p><strong>Post-workout:</strong> Dahi smoothie with 1 scoop protein powder or extra moong dal chilla (25g)</p>
<p><strong>Dinner:</strong> Grilled fish (150g) + sabzi + small roti (30g)</p>`,
    tags: ['protein', 'indian diet', 'nutrition', 'muscle gain', 'vegetarian protein'],
    readTimeMinutes: 6,
    isFeatured: true,
    status: 'published',
  },

  // ── Yoga ──────────────────────────────────────────────────────────────────
  {
    title: '10-Minute Morning Yoga Flow for Gym Members Who "Don\'t Do Yoga"',
    category: 'Yoga',
    author: 'Sunita Joshi',
    authorRole: 'Senior Yoga Instructor, 200-hr RYT',
    excerpt: 'You don\'t need to be flexible to start yoga. This 10-minute sequence is specifically designed for gym members — it fixes the posture and mobility problems that heavy lifting creates.',
    body: `<h2>Why Strength Trainers Need Yoga</h2>
<p>Repeated heavy lifting creates tight hip flexors, internally rotated shoulders, and a tight thoracic spine. This "lifter's posture" increases injury risk and actually limits your strength by restricting range of motion. This morning sequence corrects exactly those patterns.</p>

<h2>The 10-Minute Sequence (Hold Each Pose 45–60 Seconds)</h2>

<h3>1. Cat-Cow (Marjaryasana-Bitilasana) — 1 minute</h3>
<p>On all fours, inhale while arching spine (belly drops), exhale while rounding spine (back rises). Lubricates spinal discs and reverses the compression from yesterday's squats and deadlifts.</p>

<h3>2. Downward Dog (Adho Mukha Svanasana) — 45 seconds</h3>
<p>Hamstring stretch + thoracic extension + shoulder opener in one pose. Push through palms, lift hips high, pedal feet to warm up calves. Most gym members find this very challenging at first — that's fine.</p>

<h3>3. Low Lunge with Twist (Anjaneyasana Variation) — 45 seconds each side</h3>
<p>Front knee over ankle, back knee down. Drop hips toward floor to stretch hip flexor. Add a twist toward front knee for thoracic mobility. Counteracts seated desk work and heavy squats.</p>

<h3>4. Pigeon Pose (Kapotasana) — 60 seconds each side</h3>
<p>The most impactful hip flexor and external rotator stretch for lifters. Front shin parallel to mat edge, sink hips toward floor. Gym members with tight hips should use a block under the front hip.</p>

<h3>5. Supine Spinal Twist (Supta Matsyendrasana) — 45 seconds each side</h3>
<p>Lying on back, draw one knee to chest and drop it across body. Extend opposite arm. Decompresses lumbar spine and stretches the IT band — common tight spots after leg day.</p>

<h3>6. Shoulder Thread-the-Needle — 30 seconds each side</h3>
<p>On all fours, slide one arm under the body until shoulder touches floor. Releases thoracic rotation and rear deltoid tightness from rows and pressing movements.</p>

<h2>When and How Often</h2>
<p>Every morning before coffee — this takes exactly 10 minutes. After 4 weeks, expect 15–20° improvement in shoulder flexion and hip external rotation, and noticeably easier overhead squats.</p>`,
    tags: ['yoga', 'flexibility', 'morning routine', 'mobility', 'recovery'],
    readTimeMinutes: 5,
    isFeatured: false,
    status: 'published',
  },

  // ── HealthTips ────────────────────────────────────────────────────────────
  {
    title: 'The Sleep-Muscle Connection: Why 7 Hours Is Non-Negotiable for Gym Progress',
    category: 'HealthTips',
    author: 'Gym.OS Wellness Team',
    authorRole: 'Health & Performance Coaches',
    excerpt: 'You don\'t grow muscle in the gym. You grow it while sleeping. Understand the science and 5 practical habits that immediately improve your sleep quality.',
    body: `<h2>What Actually Happens During Sleep</h2>
<p>During deep sleep (NREM Stage 3), the pituitary gland releases a pulse of growth hormone — this is the primary driver of muscle protein synthesis and fat mobilisation. Short sleepers miss this pulse entirely. A study at the University of Chicago found that restricting sleep to 5.5 hours reduced muscle mass gains by 55% despite identical training and diet.</p>

<h2>The Cortisol Problem</h2>
<p>Poor sleep elevates cortisol (stress hormone) the next day. Chronically elevated cortisol breaks down muscle tissue (catabolism) and promotes fat storage around the abdomen. You can't out-train a chronically elevated cortisol response.</p>

<h2>5 Sleep Habits That Work for Gym Members</h2>

<h3>1. No screens 60 minutes before bed</h3>
<p>Blue light from phones and laptops suppresses melatonin by up to 3 hours. Use Night Shift mode or blue-light glasses if you must use devices. The real solution: put the phone outside the bedroom.</p>

<h3>2. Keep the room cold (18–21°C)</h3>
<p>Core body temperature must drop 1–2°C for sleep onset. Air conditioning or a fan helps. Many gym members sleep poorly in India's heat because their core temperature stays elevated from evening training.</p>

<h3>3. Train at least 3 hours before bedtime</h3>
<p>Exercise elevates cortisol and adrenaline. Morning or afternoon training gives the body time to downregulate. Late-night training delays sleep onset by 45–90 minutes in most people.</p>

<h3>4. Consistent wake time (yes, even weekends)</h3>
<p>Your circadian rhythm is anchored to wake time, not sleep time. Inconsistent wake times (social jet lag) disrupt sleep architecture. Set a fixed alarm 7 days a week.</p>

<h3>5. Magnesium glycinate before bed</h3>
<p>200–400 mg magnesium glycinate improves sleep quality in people deficient in magnesium — which includes most gym-goers who sweat heavily. It reduces cortisol and activates GABA receptors, promoting relaxation. Avoid magnesium oxide (poor absorption).</p>`,
    tags: ['sleep', 'recovery', 'muscle growth', 'hormones', 'health tips'],
    readTimeMinutes: 5,
    isFeatured: false,
    status: 'published',
  },

  // ── WeightManagement ──────────────────────────────────────────────────────
  {
    title: 'Why the Scale Lies: 5 Better Metrics to Track Fat Loss Progress',
    category: 'WeightManagement',
    author: 'Gym.OS Fitness Team',
    authorRole: 'Body Composition Specialists',
    excerpt: 'Body weight fluctuates 1–3 kg daily based on water, food, and hormones. These 5 measurements give you the truth about fat loss and muscle gain that the scale hides.',
    body: `<h2>The Scale's Fatal Flaw</h2>
<p>Bodyweight reflects everything: fat, muscle, water, food in your digestive tract, and glycogen. During a well-designed fat loss phase, you might gain 0.5 kg of muscle while losing 1.5 kg of fat — the scale shows you "only" lost 1 kg. You'd feel discouraged, but your body composition improved dramatically.</p>

<h2>5 Better Metrics</h2>

<h3>1. Waist Circumference</h3>
<p>Measure at the narrowest point (usually 2cm above navel) every Sunday morning, before eating, after using the bathroom. This directly measures visceral fat loss — the metabolically dangerous fat. A 1cm reduction in waist circumference is clinically meaningful regardless of scale weight.</p>

<h3>2. Progress Photos (Same Conditions)</h3>
<p>Same lighting, same time of day, same clothes (or none), same angle. Once weekly is enough. Side-by-side comparisons over 8–12 weeks reveal body composition changes the scale completely misses.</p>

<h3>3. Gym Performance Numbers</h3>
<p>If your 5-rep-max on the squat increases from 80 kg to 95 kg during a "diet," you've built muscle while losing fat. This is the holy grail of body recomposition. Track these numbers every session.</p>

<h3>4. Body Fat Percentage (DEXA or Navy Method)</h3>
<p>DEXA scan is gold standard — available at many diagnostic centres in Indian cities for ₹2,000–5,000. The Navy circumference method (free, uses tape measure and our calculator) is accurate within 3%. Retest every 8 weeks for meaningful change.</p>

<h3>5. How Clothes Fit</h3>
<p>The simplest and most motivating metric. Pick one pair of jeans or one shirt and try it on every 4 weeks. Clothing doesn't lie about fat loss even when the scale does.</p>

<h2>How to Use These Together</h2>
<p>Weigh yourself daily (average across 7 days — this removes noise), take waist measurement weekly, progress photos every 2 weeks, gym performance every session, DEXA every 8–12 weeks. Together these metrics give you a complete, accurate picture that no single number provides.</p>`,
    tags: ['fat loss', 'weight management', 'body composition', 'tracking', 'progress'],
    readTimeMinutes: 5,
    isFeatured: true,
    status: 'published',
  },

  // ── Lifestyle ─────────────────────────────────────────────────────────────
  {
    title: 'Walking 10,000 Steps Daily: What the Science Actually Says',
    category: 'Lifestyle',
    author: 'Gym.OS Research Team',
    authorRole: 'Evidence-Based Fitness Researchers',
    excerpt: 'The 10,000-step goal was invented by a Japanese pedometer company in 1965, not scientists. Here\'s what the actual research says — and why the number still matters.',
    body: `<h2>Where 10,000 Steps Came From</h2>
<p>In 1965, a Japanese company launched a pedometer called "Manpo-Kei" — which literally translates to "10,000 steps meter." The number was chosen for marketing, not evidence. It stuck, spread globally, and became the accepted gold standard — all without a single clinical trial behind it.</p>

<h2>What Research Actually Shows</h2>
<p>A 2019 Harvard study of 16,741 older women found that mortality risk dropped significantly up to about 7,500 steps/day — then plateaued. A 2021 study in JAMA Network Open found similar results across all age groups, with most cardiovascular benefit achieved between 6,000–8,000 steps.</p>

<p>More importantly: <strong>any increase from your current baseline reduces risk.</strong> Going from 2,000 to 5,000 steps is far more beneficial than going from 8,000 to 10,000.</p>

<h2>Why Steps Still Matter Despite All This</h2>
<p>NEAT (Non-Exercise Activity Thermogenesis) — the calories burned through all movement outside of formal exercise — contributes 15–30% of total daily energy expenditure. For sedentary office workers, this has collapsed. Steps are a proxy for NEAT. Increasing daily steps from 4,000 to 8,000 can create a 200–400 kcal/day deficit without a single gym session.</p>

<h2>The Indian Context</h2>
<p>Urban Indians average 4,000–6,000 steps daily (lower than global averages due to auto/car dependency). Adding a 30-minute walk after dinner is the single most impactful low-barrier intervention for metabolic health, particularly given the high rate of Type 2 diabetes and insulin resistance in South Asians.</p>

<h2>Practical Targets</h2>
<ul>
  <li><strong>Sedentary baseline (&lt;5,000 steps):</strong> Target 7,000 steps — this is where most mortality benefit occurs</li>
  <li><strong>Moderately active (5,000–8,000 steps):</strong> Aim for 10,000 to optimise NEAT caloric burn</li>
  <li><strong>Already walking 10,000+:</strong> Focus on 20+ minutes of brisk walking (>100 steps/minute) for cardiovascular intensity benefit</li>
</ul>`,
    tags: ['walking', 'daily steps', 'lifestyle', 'NEAT', 'cardiovascular health'],
    readTimeMinutes: 5,
    isFeatured: false,
    status: 'published',
  },

  // ── MentalWellness ────────────────────────────────────────────────────────
  {
    title: 'Exercise and Mental Health: What 150+ Studies Tell Us About Mood and Anxiety',
    category: 'MentalWellness',
    author: 'Dr. Sanjana Rao',
    authorRole: 'Sports Psychologist & Mindfulness Coach',
    excerpt: 'Exercise is one of the most effective interventions for depression and anxiety — comparable to medication in mild-to-moderate cases, with no side effects and lifelong benefits.',
    body: `<h2>The Science of Exercise and Mood</h2>
<p>A 2016 Cochrane Review — the gold standard in medical evidence — analysed 39 randomised controlled trials and found exercise significantly reduced symptoms of depression. For mild-to-moderate depression, exercise effects were comparable to antidepressant medications. The effect was sustained with regular exercise, not just acute bouts.</p>

<h2>The Neurochemistry</h2>
<p><strong>Endorphins:</strong> Released during moderate-to-high intensity exercise, create the "runner's high." They are the body's own opioid peptides — natural pain relief and euphoria.</p>
<p><strong>BDNF (Brain-Derived Neurotrophic Factor):</strong> Exercise dramatically increases BDNF — sometimes called "Miracle-Gro for the brain." BDNF promotes neurogenesis (new brain cell growth) in the hippocampus — the memory and emotional regulation centre — and is strongly correlated with reduced depression and improved learning.</p>
<p><strong>Serotonin and norepinephrine:</strong> These mood-regulating neurotransmitters are naturally elevated during exercise and remain elevated for hours afterward.</p>

<h2>Which Type of Exercise Works Best</h2>
<p>All types work — aerobic, resistance training, yoga, and walking all show significant mood benefits. The key variable is <strong>consistency over intensity.</strong> Three moderate 30-minute sessions per week produce greater long-term mood benefits than one intense weekly session, largely because of the cumulative neurochemical effect.</p>

<h2>Anxiety: Exercise as a "Stress Inoculation"</h2>
<p>Regular aerobic exercise physically changes how the body responds to stress. Regular exercisers show blunted cortisol responses to psychological stressors — their HPA (hypothalamic-pituitary-adrenal) axis becomes more resilient. Think of it as stress training for your nervous system.</p>

<h2>For the Indian Context</h2>
<p>India has one of the highest rates of depression and anxiety globally (WHO, 2023), yet mental health stigma remains high. Exercise is a barrier-free entry point — no prescription needed, available to all, and it works. A daily 30-minute walk has evidence comparable to SSRI medications in mild cases. This matters enormously in a context where access to mental health professionals is limited.</p>`,
    tags: ['mental health', 'depression', 'anxiety', 'exercise psychology', 'BDNF'],
    readTimeMinutes: 6,
    isFeatured: false,
    status: 'published',
  },

  // ── RecoveryAndSleep ──────────────────────────────────────────────────────
  {
    title: 'DOMS Explained: Why You\'re Sore, How Long It Lasts, and What Actually Helps',
    category: 'RecoveryAndSleep',
    author: 'Gym.OS Performance Team',
    authorRole: 'Sports Medicine & Strength Coaches',
    excerpt: 'Delayed onset muscle soreness peaks 24–48 hours after training. Understanding why it happens helps you train smarter, recover faster, and stop confusing soreness with effectiveness.',
    body: `<h2>What Is DOMS?</h2>
<p>Delayed Onset Muscle Soreness (DOMS) is the pain, stiffness, and tenderness that develops 12–48 hours after unfamiliar or high-intensity exercise, peaking around 24–48 hours. It is NOT lactic acid — that myth has been thoroughly debunked. DOMS results from microscopic muscle fibre damage and the subsequent inflammatory repair response.</p>

<h2>What Actually Causes It</h2>
<p>Eccentric contractions — the lowering phase of movement — cause the most damage. This is why walking down stairs hurts more than up after leg day, and why the negative phase of a bicep curl (lowering the weight) generates more soreness than the lifting phase. The damage triggers an inflammatory cascade: damaged fibres release cytokines, fluid accumulates, and nerve endings are sensitised.</p>

<h2>Does Soreness = Growth?</h2>
<p>No. This is one of the most persistent myths in fitness. Soreness is a byproduct of novelty and volume, not a signal of productive training. As you become more trained, DOMS decreases dramatically even as strength and muscle continue to increase. Experienced athletes often feel minimal DOMS from workouts that are objectively progressing their physiques.</p>

<h2>What Actually Speeds Recovery</h2>

<h3>What works (evidence-based):</h3>
<ul>
  <li><strong>Active recovery:</strong> Light walking, swimming, or easy cycling increases blood flow and removes inflammatory byproducts 20–30% faster than complete rest</li>
  <li><strong>Sleep:</strong> The most powerful recovery tool available — growth hormone released during NREM Stage 3 drives muscle repair</li>
  <li><strong>Protein:</strong> 40g protein post-workout maximises muscle protein synthesis in damaged tissue</li>
  <li><strong>Cold water immersion:</strong> 10–15 minutes in cold water (12–15°C) reduces inflammatory markers and perceived soreness</li>
  <li><strong>Tart cherry juice or watermelon juice:</strong> Both have anti-inflammatory polyphenols with RCT evidence for DOMS reduction</li>
</ul>

<h3>What doesn't work:</h3>
<ul>
  <li>Foam rolling for DOMS (helps perceived tightness, not actual DOMS severity)</li>
  <li>Stretching before or after (no evidence for DOMS prevention)</li>
  <li>NSAIDs (ibuprofen) — reduce soreness but may blunt the muscle adaptation signal</li>
</ul>

<h2>When DOMS Becomes a Problem</h2>
<p>Soreness that lasts beyond 72 hours, involves significant swelling, weakness, or dark-coloured urine may indicate rhabdomyolysis — a serious condition requiring medical attention. This can occur with extremely intense first-time exercise (e.g., a very hard first CrossFit class). See a doctor immediately if urine is brown or cola-coloured after exercise.</p>`,
    tags: ['recovery', 'DOMS', 'muscle soreness', 'training science', 'sleep'],
    readTimeMinutes: 6,
    isFeatured: false,
    status: 'published',
  },

  // ── Workouts (second article) ─────────────────────────────────────────────
  {
    title: 'Progressive Overload: The Only Principle You Need to Keep Making Gains',
    category: 'Workouts',
    author: 'Gym.OS Fitness Team',
    authorRole: 'Certified Strength & Conditioning Specialists',
    excerpt: 'Most gym members plateau because they stop applying progressive overload. Here\'s what it is, why it\'s the #1 driver of results, and 6 ways to apply it that most people miss.',
    body: `<h2>The #1 Law of Training</h2>
<p>Progressive overload is the gradual increase of stress placed upon the body during exercise training. It is the single most important principle in all of resistance training and the primary driver of both strength and muscle gains. Without it, the body has no reason to adapt — you'll maintain what you have, but never improve.</p>

<h2>The Science Behind It</h2>
<p>When you subject a muscle to a level of stress it hasn't encountered before, it responds by repairing and rebuilding slightly stronger to handle that stress next time. This is called the SAID principle: Specific Adaptation to Imposed Demands. Remove the demand — or keep the demand the same — and adaptation stops.</p>

<h2>6 Ways to Apply Progressive Overload</h2>

<h3>1. Add Weight (Most Common)</h3>
<p>Increase the load by the smallest increment available. For barbells: 2.5 kg per side. For dumbbells: 2 kg. This is "double progression" — achieve the top of a rep range, then add weight.</p>

<h3>2. Add Reps</h3>
<p>If your target is 3×8, get to 3×10 before increasing weight. Going from 8 reps to 10 reps at the same weight is measurable progression.</p>

<h3>3. Add Sets</h3>
<p>Go from 3 sets to 4 sets of the same weight and reps. Volume (sets × reps × weight) is the primary driver of hypertrophy.</p>

<h3>4. Reduce Rest Time</h3>
<p>Completing the same work in less time is density progression. Rest 3 minutes between sets initially; over weeks, reduce to 2 minutes, then 90 seconds. Same workout, more done in less time = improvement.</p>

<h3>5. Increase Range of Motion</h3>
<p>Go deeper on a squat, achieve more shoulder flexion on an overhead press, get fuller stretch on a pulldown. More range of motion at the same weight is genuine progress.</p>

<h3>6. Improve Technique</h3>
<p>A squat with perfect depth and bracing is harder than a sloppy half-squat. Improving technique while maintaining the same weight is a valid and often overlooked form of progressive overload.</p>

<h2>Tracking Is Non-Negotiable</h2>
<p>You cannot apply progressive overload without records. Use the Gym.OS workout tracker or a notebook: date, exercise, sets, reps, weight. Review last week's session before starting this week's. No record = no progression = no results.</p>`,
    tags: ['progressive overload', 'strength training', 'muscle growth', 'training principles'],
    readTimeMinutes: 5,
    isFeatured: false,
    status: 'published',
  },
];

const seedHealthArticles = async () => {
  try {
    console.log('🌱 Seeding starter health articles...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let created = 0;
    let updated = 0;

    for (const article of ARTICLES) {
      const slug = slugify(article.title);
      const words = article.body.replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
      const readTimeMinutes = Math.max(1, Math.ceil(words / 200));

      const result = await HealthArticle.findOneAndUpdate(
        { slug, tenantId: null },
        {
          $set: {
            ...article,
            slug,
            tenantId: null,
            readTimeMinutes,
            publishedAt: article.status === 'published' ? new Date() : undefined,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (!result) {
        created++;
      } else {
        const diff = new Date().getTime() - (result as any).createdAt?.getTime();
        if (diff < 5000) created++;
        else updated++;
      }
      console.log(`  ✓ ${article.category} — "${article.title.slice(0, 55)}..."`);
    }

    console.log(`\n✅ Done — ${ARTICLES.length} articles seeded (${created} created, ${updated} updated)`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedHealthArticles();
