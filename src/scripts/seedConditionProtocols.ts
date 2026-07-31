/**
 * seedConditionProtocols.ts
 *
 * Seeds platform-wide (tenantId = null) nutrition protocols for all 10 health conditions
 * with real Indian food data. Safe to re-run — uses upsert on condition.
 *
 * Run:  npx ts-node -r tsconfig-paths/register src/scripts/seedConditionProtocols.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import ConditionProtocol from '../models/ConditionProtocol.model';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gym-management';

const PROTOCOLS = [
  {
    condition: 'PCOS',
    label: 'PCOS Nutrition Protocol',
    description: 'Anti-inflammatory, low-GI diet to manage insulin resistance, reduce androgens, and support hormonal balance in PCOS.',
    macros: { proteinPercent: 30, carbPercent: 35, fatPercent: 35 },
    calorieAdjustment: -200,
    mealFrequency: '5 small meals every 3 hours to prevent insulin spikes',
    includeFoods: [
      { name: 'Methi (fenugreek) seeds', reason: 'Improves insulin sensitivity; soak overnight, consume in morning' },
      { name: 'Bajra / Jowar roti', reason: 'Low GI millet roti keeps blood sugar stable longer than wheat' },
      { name: 'Sabja / chia seeds', reason: 'Omega-3 and fibre to reduce inflammation and regulate hormones' },
      { name: 'Paneer (low-fat)', reason: 'High-protein, low-carb dairy helps satiety without spiking glucose' },
      { name: 'Palak / spinach', reason: 'Rich in magnesium — a mineral depleted in PCOS; supports ovarian function' },
      { name: 'Rajma / chickpeas', reason: 'Plant protein + resistant starch lowers post-meal glucose response' },
      { name: 'Amla (Indian gooseberry)', reason: 'High vitamin C reduces oxidative stress linked to PCOS' },
      { name: 'Saunf (fennel) water', reason: 'Natural phytoestrogen balancer; helps regularise menstrual cycle' },
    ],
    avoidFoods: [
      { name: 'Maida (refined flour) products — naan, biscuits, white bread', reason: 'High GI causes rapid insulin spike worsening insulin resistance' },
      { name: 'Packaged fruit juices', reason: 'Concentrated fructose without fibre — rapid glucose rise' },
      { name: 'White rice (large portions)', reason: 'High GI; switch to brown rice or reduce quantity + add dal' },
      { name: 'Whole-fat dairy in excess', reason: 'Saturated fat may elevate androgens' },
      { name: 'Alcohol', reason: 'Disrupts hormone clearance in liver; worsens PCOS symptoms' },
    ],
    mealTimingNotes: 'Eat breakfast within 1 hour of waking. Never skip breakfast — morning cortisol spike worsens insulin resistance when fasting is prolonged. Last meal at least 2 hours before bed.',
    indianFoodAlternatives: [
      { original: 'White rice', alternative: 'Brown rice or red matta rice or foxtail millet (kangni) khichdi' },
      { original: 'Wheat roti (maida)', alternative: 'Ragi roti or bajra roti or jowar roti' },
      { original: 'Sugary chai with full-fat milk', alternative: 'Cinnamon tea / spearmint tea / black coffee (unsweetened)' },
      { original: 'Potato sabzi', alternative: 'Sweet potato or lotus stem (kamal kakdi) sabzi' },
      { original: 'Packaged namkeen snacks', alternative: 'Roasted chana, makhana, or a small handful of mixed nuts' },
    ],
    phaseVariants: [
      { phaseName: 'Follicular (Day 1–14)', notes: 'Emphasise iron-rich foods: palak, methi, rajma. Add sesame seeds (til) for phytoestrogen support.' },
      { phaseName: 'Luteal (Day 15–28)', notes: 'Increase magnesium (dark leafy greens, pumpkin seeds) to ease PMS. Reduce salt to prevent bloating.' },
    ],
    disclaimer: 'This protocol is for wellness support, not medical treatment of PCOS. Please consult your gynaecologist or endocrinologist before making significant dietary changes.',
    sortOrder: 1,
  },
  {
    condition: 'Hypothyroidism',
    label: 'Hypothyroid Nutrition Protocol',
    description: 'Thyroid-supportive diet rich in selenium, zinc, and iodine, while avoiding goitrogens that impair thyroid hormone production.',
    macros: { proteinPercent: 30, carbPercent: 40, fatPercent: 30 },
    calorieAdjustment: -150,
    mealFrequency: '3 balanced meals — avoid grazing, as frequent eating can mask satiety signals in hypothyroidism',
    includeFoods: [
      { name: 'Brazil nuts (1–2 daily)', reason: 'Single highest dietary source of selenium — critical for T4→T3 conversion' },
      { name: 'Moong dal / masoor dal', reason: 'High protein, easy to digest, zinc and iron support' },
      { name: 'Eggs (especially yolk)', reason: 'Selenium + iodine; support thyroid hormone synthesis' },
      { name: 'Iodised salt', reason: 'Ensures minimum iodine intake for thyroxine production' },
      { name: 'Pumpkin seeds', reason: 'Zinc and magnesium — cofactors for thyroid enzyme activity' },
      { name: 'Cooked lauki / bottle gourd', reason: 'Low calorie, hydrating, gentle on sluggish metabolism' },
      { name: 'Ginger (adrak) tea', reason: 'Anti-inflammatory; supports gut motility often impaired in hypothyroidism' },
    ],
    avoidFoods: [
      { name: 'Raw goitrogens in large amounts — raw cabbage, raw cauliflower, raw broccoli', reason: 'Block iodine uptake; cooking neutralises 90% of the effect' },
      { name: 'Soy products in excess (soy milk, tofu) within 4 hours of medication', reason: 'May interfere with thyroxine absorption' },
      { name: 'Gluten (if autoimmune/Hashimoto\'s)', reason: 'Molecular mimicry may trigger thyroid antibody flare in Hashimoto\'s' },
      { name: 'Processed / fast food high in sodium', reason: 'Promotes water retention and bloating already common in hypothyroidism' },
    ],
    mealTimingNotes: 'Take thyroid medication (levothyroxine) on empty stomach, 30–60 min before breakfast. Avoid calcium-rich foods or iron supplements within 4 hours of medication.',
    indianFoodAlternatives: [
      { original: 'Raw salad with cabbage / cauliflower', alternative: 'Cooked sabzi of the same vegetables (steaming/boiling removes goitrogens)' },
      { original: 'Soy milk with breakfast', alternative: 'Low-fat cow\'s milk or almond milk' },
      { original: 'Packaged breakfast cereal', alternative: 'Moong dal chilla with vegetables or poha with peanuts' },
      { original: 'Table salt (non-iodised)', alternative: 'Iodised salt (look for "iodised" on packet)' },
    ],
    phaseVariants: [],
    disclaimer: 'Do not stop or modify thyroid medication based on diet alone. Always work with your endocrinologist.',
    sortOrder: 2,
  },
  {
    condition: 'Type2Diabetes',
    label: 'Type 2 Diabetes Nutrition Protocol',
    description: 'Blood-sugar-stabilising diet using the plate method: 50% non-starchy vegetables, 25% quality protein, 25% low-GI carbohydrates.',
    macros: { proteinPercent: 28, carbPercent: 40, fatPercent: 32 },
    calorieAdjustment: -250,
    mealFrequency: '3 main meals + 2 small snacks; avoid gaps > 5 hours to prevent compensatory overeating and glucose swings',
    includeFoods: [
      { name: 'Karela (bitter gourd)', reason: 'Contains charantin and polypeptide-P which mimic insulin action' },
      { name: 'Methi seeds (soaked)', reason: 'Galactomannan fibre slows glucose absorption from gut' },
      { name: 'Ragi (finger millet)', reason: 'Low GI grain; calcium and polyphenols; make roti, porridge, or dosa' },
      { name: 'Moong dal (whole green mung)', reason: 'Protein + fibre combination blunts postprandial glucose spike' },
      { name: 'Amla juice (1 tbsp in warm water)', reason: 'Vitamin C and chromium improve insulin sensitivity' },
      { name: 'Cinnamon (dalchini) in cooking', reason: 'Improves insulin receptor sensitivity; use 1/4 tsp in chai or oatmeal' },
      { name: 'Palak, methi leaves, bhindi (okra)', reason: 'Low-calorie, high-fibre vegetables with negligible carb load' },
      { name: 'Whole lentils (sabut masoor, rajma)', reason: 'Slow digesting protein + resistant starch prevents glucose peaks' },
    ],
    avoidFoods: [
      { name: 'White rice (large portions)', reason: 'GI of 72 causes rapid glucose spike; switch to smaller portion with dal + sabzi' },
      { name: 'Fruit juice / cola / sugary drinks', reason: 'Liquid fructose bypasses satiety signals and hits bloodstream rapidly' },
      { name: 'Maida-based items — samosa, paratha, biscuits', reason: 'High GI, high fat combination; worst combination for blood sugar' },
      { name: 'Mangoes and bananas in excess', reason: 'High fructose fruits; limit to ½ medium portion, always with protein' },
      { name: 'Fried snacks — bhujia, chakli, mixture', reason: 'High calorie, rapid carb absorption, promote insulin resistance' },
    ],
    mealTimingNotes: 'Eat the protein and fat portion of your meal first, then vegetables, then carbohydrates — this simple sequence reduces peak glucose by up to 30%. Do a 10-minute walk after meals.',
    indianFoodAlternatives: [
      { original: 'White rice (1 cup)', alternative: 'Brown rice (½ cup) + dal tadka + vegetable sabzi (plate method)' },
      { original: 'Wheat roti (3 thin rotis)', alternative: 'Ragi/bajra roti (2) with lots of sabzi and curd' },
      { original: 'Mango lassi', alternative: 'Chaas (buttermilk) with cumin or nimbu pani (unsweetened)' },
      { original: 'Halwa or kheer for dessert', alternative: 'Small bowl of mixed berries or 1 guava' },
      { original: 'Potato chips or namkeen', alternative: 'Roasted makhana (foxnuts) or a boiled egg' },
    ],
    phaseVariants: [],
    disclaimer: 'This plan supports blood sugar management — it does not replace diabetes medication or insulin. Monitor your blood glucose regularly and adjust in consultation with your physician.',
    sortOrder: 3,
  },
  {
    condition: 'Hypertension',
    label: 'Hypertension (DASH) Nutrition Protocol',
    description: 'Indian adaptation of the DASH diet — high potassium, magnesium, and calcium; very low sodium; emphasises whole grains, legumes, and vegetables.',
    macros: { proteinPercent: 22, carbPercent: 52, fatPercent: 26 },
    calorieAdjustment: 0,
    mealFrequency: '3 meals + 1–2 potassium-rich snacks; avoid large evening meals (increases overnight BP)',
    includeFoods: [
      { name: 'Banana / banana flower (kela phool)', reason: 'Potassium richest easily available Indian food; counteracts sodium\'s BP-raising effect' },
      { name: 'Coconut water (nariyal pani)', reason: 'Natural electrolyte with potassium and magnesium; replaces sports drinks' },
      { name: 'Flaxseeds (alsi)', reason: 'Omega-3 alpha-linolenic acid reduces arterial stiffness; 1 tbsp ground daily' },
      { name: 'Garlic (lahsun)', reason: 'Allicin has ACE-inhibitor-like effect; raw or lightly cooked most potent' },
      { name: 'Palak / methi leaves', reason: 'Dietary nitrates convert to nitric oxide which dilates blood vessels' },
      { name: 'Low-fat curd (dahi)', reason: 'Calcium and probiotics associated with lower BP in Indian dietary studies' },
      { name: 'Amla / guava', reason: 'High vitamin C reduces arterial inflammation; both very affordable' },
    ],
    avoidFoods: [
      { name: 'Papad, achaar (pickle), salted snacks', reason: 'Extremely high sodium — 1 papad ≈ 400 mg sodium; skip entirely or use low-sodium varieties' },
      { name: 'Packaged dal makhani / curry pastes', reason: 'Hidden salt; 1 serving can exceed daily sodium budget' },
      { name: 'Alcohol', reason: 'Raises BP acutely and chronically; increases risk of stroke' },
      { name: 'Full-fat cheese (processed)', reason: 'High sodium + saturated fat; use paneer in moderation instead' },
      { name: 'Extra salt at table', reason: 'Habit-based salt addition; taste adapts within 2–3 weeks of reduction' },
    ],
    mealTimingNotes: 'Daily sodium target: 1,500–2,000 mg (≈ ¾ tsp iodised salt total from all sources). Read nutrition labels. Limit eating out to 1–2 times per week as restaurant food is very high in sodium.',
    indianFoodAlternatives: [
      { original: 'Regular salt in cooking', alternative: 'Lemon juice + cumin + coriander as flavour base; add minimal salt at end' },
      { original: 'Namkeen / farsan snack', alternative: 'Unsalted makhana, cucumber sticks, or a banana' },
      { original: 'Restaurant dal makhani', alternative: 'Home-made rajma or moong dal with minimal salt' },
      { original: 'Chips / potato wafers', alternative: 'Roasted chana or fresh fruit chaat (no salt)' },
    ],
    phaseVariants: [],
    disclaimer: 'Do not stop antihypertensive medication based on dietary changes alone. Check BP at home daily during the first month and share readings with your doctor.',
    sortOrder: 4,
  },
  {
    condition: 'GERD',
    label: 'GERD / Acid Reflux Nutrition Protocol',
    description: 'Low-acid, low-fat diet that reduces lower oesophageal sphincter relaxation and gastric acid production. Focus on alkaline and non-irritating Indian foods.',
    macros: { proteinPercent: 25, carbPercent: 50, fatPercent: 25 },
    calorieAdjustment: 0,
    mealFrequency: '5–6 small meals; never eat within 3 hours of lying down',
    includeFoods: [
      { name: 'Banana', reason: 'Alkaline, soft — coats stomach lining and neutralises excess acid' },
      { name: 'Lauki (bottle gourd) sabzi', reason: 'Extremely alkaline vegetable; traditionally used in Indian home remedies for acidity' },
      { name: 'Coconut water', reason: 'Alkaline pH ~5.6; naturally soothing for oesophageal irritation' },
      { name: 'Low-fat curd (small quantity)', reason: 'Probiotics improve gut motility and reduce reflux frequency' },
      { name: 'Roti with ghee (small amount)', reason: 'Ghee in moderation actually coats stomach — avoid deep frying' },
      { name: 'Saunf (fennel) seeds after meals', reason: 'Traditional digestive; reduces gas and acidity' },
      { name: 'Aloe vera juice (unsweetened)', reason: 'Reduces inflammation in oesophagus and stomach lining' },
    ],
    avoidFoods: [
      { name: 'Chai / coffee', reason: 'Caffeine relaxes lower oesophageal sphincter; switch to saunf tea or ginger tea' },
      { name: 'Spicy curries, chilli, red chilli powder', reason: 'Irritates oesophageal lining directly; reduce to minimum' },
      { name: 'Tomatoes and tomato-based gravies', reason: 'Acidic; switch to dry sabzi or coconut-based curries' },
      { name: 'Deep-fried foods — samosa, pakoda, puri', reason: 'High fat delays gastric emptying, increases reflux risk' },
      { name: 'Mint (pudina) in large amounts', reason: 'Counterintuitively relaxes lower oesophageal sphincter despite cooling sensation' },
      { name: 'Carbonated drinks including soda water', reason: 'CO₂ bubbles expand in stomach, force acid upward' },
    ],
    mealTimingNotes: 'Sit upright for 30–45 minutes after every meal. Elevate head of bed by 6–8 inches if nocturnal reflux occurs. Eat slowly and chew thoroughly — 20 chews per bite.',
    indianFoodAlternatives: [
      { original: 'Masala chai 3× daily', alternative: 'Chamomile tea or roasted saunf in warm water' },
      { original: 'Tomato-based curries', alternative: 'Coconut milk curries or dry sabzi with minimal spice' },
      { original: 'Spicy bhindi / aloo masala', alternative: 'Lauki dal, ridge gourd (turai) sabzi, or plain steamed vegetables' },
      { original: 'After-meal mint digestive', alternative: 'Saunf (fennel) seeds or mulethi (liquorice) root water' },
    ],
    phaseVariants: [],
    disclaimer: 'Consult a gastroenterologist if symptoms persist >2 weeks despite dietary changes or if you experience difficulty swallowing.',
    sortOrder: 5,
  },
  {
    condition: 'InsulinResistance',
    label: 'Insulin Resistance Nutrition Protocol',
    description: 'Low-glycaemic, high-protein diet to restore insulin sensitivity. Strategic carbohydrate timing around exercise. Rich in fibre and polyphenols.',
    macros: { proteinPercent: 30, carbPercent: 38, fatPercent: 32 },
    calorieAdjustment: -200,
    mealFrequency: '3 meals — avoid snacking to allow insulin to drop between meals and restore sensitivity',
    includeFoods: [
      { name: 'Apple cider vinegar (15 ml before high-carb meal)', reason: 'Acetic acid inhibits carbohydrate-digesting enzymes; reduces postprandial glucose by ~20%' },
      { name: 'Whole eggs', reason: 'High protein + healthy fat; no impact on blood glucose; improves satiety' },
      { name: 'Green tea / black coffee', reason: 'Polyphenols and chlorogenic acid improve insulin signalling' },
      { name: 'Almonds / walnuts (small handful)', reason: 'Magnesium + healthy fat — both improve insulin receptor sensitivity' },
      { name: 'Barley (jau) roti or soup', reason: 'Beta-glucan fibre has strongest evidence for reducing insulin resistance of any grain' },
      { name: 'Vinegar-marinated vegetables', reason: 'Fermented/acidic foods reduce GI of the entire meal' },
    ],
    avoidFoods: [
      { name: 'Snacking between meals', reason: 'Keeps insulin elevated chronically; insulin needs to drop for cells to regain sensitivity' },
      { name: 'Liquid calories — juices, lassi with sugar, soft drinks', reason: 'Fastest route to glucose spike; no fibre to buffer absorption' },
      { name: 'Ultra-processed breakfast foods — cornflakes, instant oats packets', reason: 'Designed to digest quickly; spike glucose immediately' },
    ],
    mealTimingNotes: 'Consume 30 g protein at breakfast within 1 hour of waking — this is the single most impactful change for insulin resistance. Time largest carbohydrate meal around workouts.',
    indianFoodAlternatives: [
      { original: 'Upma (semolina)', alternative: 'Moong dal chilla with vegetables or besan cheela with paneer stuffing' },
      { original: 'White bread sandwich', alternative: 'Ragi roti roll with egg and vegetables' },
      { original: 'Sweet lassi or fruit juice breakfast', alternative: '2 boiled eggs + 1 cup whole-fat curd with no sugar' },
    ],
    phaseVariants: [],
    disclaimer: 'Insulin resistance may progress to pre-diabetes or Type 2 diabetes if unmanaged. Get HbA1c and fasting insulin tested every 6 months.',
    sortOrder: 6,
  },
  {
    condition: 'SkinHealth',
    label: 'Skin Health Nutrition Protocol',
    description: 'Anti-inflammatory, antioxidant-rich diet targeting acne, dullness, and premature ageing. High in zinc, vitamin C, vitamin E, and omega-3.',
    macros: { proteinPercent: 25, carbPercent: 45, fatPercent: 30 },
    calorieAdjustment: 0,
    mealFrequency: '3 balanced meals with emphasis on colourful vegetables at every meal',
    includeFoods: [
      { name: 'Amla (2 raw or 1 tbsp juice)', reason: 'Highest vitamin C density of any Indian food; vitamin C is essential for collagen synthesis' },
      { name: 'Turmeric (haldi) with black pepper', reason: 'Curcumin is anti-inflammatory; black pepper increases bioavailability 2000%' },
      { name: 'Walnuts (5–6 daily)', reason: 'Richest nut source of ALA omega-3; reduces inflammatory skin conditions' },
      { name: 'Pumpkin seeds (kaddu ke beej)', reason: 'Zinc — critical for wound healing, reducing sebum production in acne' },
      { name: 'Sweet potato', reason: 'Beta-carotene (provitamin A) protects against UV damage; orange pigment = skin benefit' },
      { name: 'Green tea', reason: 'EGCG catechin is potent anti-inflammatory and antiglycation agent for skin' },
      { name: 'Cucumber with skin (kheera)', reason: 'Silica + hydration; apply rest on skin as topical if desired' },
    ],
    avoidFoods: [
      { name: 'High-GI foods — maida, white rice, sugar', reason: 'Glucose spikes cause glycation — "sugar-coating" of collagen that causes wrinkles and inflammation' },
      { name: 'Cow\'s milk (if acne-prone)', reason: 'IGF-1 in milk stimulates sebum production and acne; switch to A2 or plant milk to test' },
      { name: 'Iodine-rich foods in excess (seafood, iodised salt excess)', reason: 'High iodine can trigger acne flares in sensitive individuals' },
    ],
    mealTimingNotes: 'Drink 2.5–3 L water daily. Herbal teas count. Skin hydration reflects internal hydration 2 weeks later — consistency matters more than one "skin food" day.',
    indianFoodAlternatives: [
      { original: 'White sugar in chai', alternative: 'Jaggery (½ tsp) or skip entirely' },
      { original: 'Regular cow milk', alternative: 'A2 cow milk or unsweetened almond milk (if acne-prone)' },
      { original: 'Deep-fried pakoda snack', alternative: 'Carrot-cucumber sticks with hummus or roasted makhana' },
    ],
    phaseVariants: [],
    disclaimer: 'Persistent acne, rosacea, or dermatitis may require dermatologist evaluation and topical/prescription treatment alongside dietary changes.',
    sortOrder: 7,
  },
  {
    condition: 'Celiac',
    label: 'Coeliac Disease (Gluten-Free) Protocol',
    description: 'Strictly gluten-free diet — zero tolerance for wheat, barley, rye, and their derivatives. Focus on naturally gluten-free Indian staples.',
    macros: { proteinPercent: 25, carbPercent: 48, fatPercent: 27 },
    calorieAdjustment: 0,
    mealFrequency: '3 main meals — focus on cross-contamination prevention in kitchen',
    includeFoods: [
      { name: 'Ragi (finger millet) roti', reason: 'Naturally gluten-free; highest calcium content of all grains; fibre-rich' },
      { name: 'Bajra (pearl millet) roti', reason: 'Gluten-free; iron and magnesium-rich; excellent chapati substitute' },
      { name: 'Sama (barnyard millet) khichdi', reason: 'Traditionally used in vrat (fasting) — naturally gluten-free' },
      { name: 'Sabudana (tapioca pearls)', reason: 'Pure starch, completely gluten-free; good for quick energy' },
      { name: 'Rice in all forms — poha, idli, dosa', reason: 'Core gluten-free staples; ensure no hidden wheat in spice mixes' },
      { name: 'Rajma, chana, moong dal', reason: 'Protein + iron — important as gluten-free grains can be lower in protein' },
    ],
    avoidFoods: [
      { name: 'Wheat flour (atta), semolina (suji/rawa), maida', reason: 'Direct gluten sources — strict avoidance required' },
      { name: 'Most commercial masala powders and gravies', reason: 'Often contain wheat flour as anti-caking agent or thickener; read labels' },
      { name: 'Barley water / sattu (if wheat-based)', reason: 'Check source; barley sattu contains gluten; roasted chana sattu is safe' },
      { name: 'Soy sauce (most brands)', reason: 'Made with wheat; use tamari or coconut aminos instead' },
      { name: 'Oats (unless certified gluten-free)', reason: 'Contamination risk; only use certified GF oats if tolerated' },
    ],
    mealTimingNotes: 'Use dedicated cookware and utensils for gluten-free cooking. Shared tawa (griddle) used for wheat rotis can contaminate gluten-free rotis. Even breadcrumbs in oil can cause reaction.',
    indianFoodAlternatives: [
      { original: 'Wheat roti / chapati', alternative: 'Ragi roti, bajra roti, or jowar roti' },
      { original: 'Upma (semolina)', alternative: 'Sabudana khichdi or poha with vegetables' },
      { original: 'Atta-based noodles / pasta', alternative: 'Rice noodles or gluten-free pasta' },
      { original: 'Commercial spice mix / MDH masalas', alternative: 'Home-ground fresh masalas with whole spices' },
    ],
    phaseVariants: [],
    disclaimer: 'Coeliac disease requires strict lifelong gluten avoidance. Even trace amounts (10 mg/day) can cause intestinal damage. Confirm diagnosis with TTG-IgA blood test and duodenal biopsy.',
    sortOrder: 8,
  },
  {
    condition: 'LactoseIntolerance',
    label: 'Lactose Intolerance Nutrition Protocol',
    description: 'Dairy-reduced protocol that maintains calcium and protein intake using Indian plant sources and low-lactose dairy alternatives.',
    macros: { proteinPercent: 25, carbPercent: 48, fatPercent: 27 },
    calorieAdjustment: 0,
    mealFrequency: '3 balanced meals; if consuming dairy, pair with solid food to slow lactase demand',
    includeFoods: [
      { name: 'Ragi (finger millet)', reason: 'Highest plant-based calcium source in India — 344 mg/100g vs milk\'s 120 mg/100ml' },
      { name: 'Sesame seeds / til chikki', reason: '975 mg calcium per 100g — more than any dairy; roast and sprinkle on food' },
      { name: 'Amarnath (rajgira) seeds', reason: 'Calcium + protein; gluten-free and good bone health support' },
      { name: 'Low-fat curd / dahi (small amounts)', reason: 'Lactose is partially pre-digested by bacteria in curd; most tolerate 100–200g' },
      { name: 'Hard cheeses (paneer alternatives — aged)', reason: 'Lactose is minimal in aged cheese; paneer itself has low lactose' },
      { name: 'Almonds / almond milk (unsweetened)', reason: 'Calcium-fortified versions replace milk; high in vitamin E' },
    ],
    avoidFoods: [
      { name: 'Full-fat milk (cow/buffalo)', reason: 'Highest lactose content; triggers symptoms in most intolerant individuals' },
      { name: 'Ice cream and milk-based desserts — kheer, rabdi', reason: 'High lactose + high sugar; double gut impact' },
      { name: 'Cream-based gravies (malai-based)', reason: 'Hidden lactose from cream and milk' },
    ],
    mealTimingNotes: 'Test your personal tolerance — lactose intolerance exists on a spectrum. Many people tolerate up to 12g lactose (1 cup milk) if spread across the day with food. Keep a food-symptom diary.',
    indianFoodAlternatives: [
      { original: 'Cow\'s milk (for tea/coffee)', alternative: 'Unsweetened soy milk or oat milk; both steam well for chai' },
      { original: 'Kheer (rice pudding)', alternative: 'Coconut milk kheer or ragi pudding made with coconut milk' },
      { original: 'Paneer (high quantity)', alternative: 'Tofu (same texture in gravies); or reduce paneer quantity and pair with dal' },
      { original: 'Full-fat curd raita', alternative: 'Small portion of low-fat curd or coconut milk raita' },
    ],
    phaseVariants: [],
    disclaimer: 'Do not self-diagnose lactose intolerance. Symptoms may overlap with IBS or other conditions. A hydrogen breath test or lactose elimination trial with GP oversight is recommended.',
    sortOrder: 9,
  },
  {
    condition: 'General',
    label: 'General Wellness Nutrition Protocol',
    description: 'Balanced whole-food Indian diet following the ICMR recommended dietary allowances. Suitable as the default plan for healthy members without specific conditions.',
    macros: { proteinPercent: 20, carbPercent: 55, fatPercent: 25 },
    calorieAdjustment: 0,
    mealFrequency: '3 meals + 1 snack; avoid eating past 8 PM for most people',
    includeFoods: [
      { name: 'Dal (any lentil) daily', reason: 'India\'s most affordable complete protein source; fibre + micronutrients' },
      { name: 'Seasonal vegetables (sabzi) — 2 portions/day', reason: 'Micronutrient diversity; choose local and seasonal for maximum freshness and nutrition' },
      { name: 'Curd / dahi', reason: 'Probiotic; calcium; protein; versatile in Indian cooking' },
      { name: 'Whole fruit (not juice) — 1–2 portions/day', reason: 'Fibre slows sugar absorption; guava, papaya, and amla are best for India' },
      { name: 'Nuts — almonds or walnuts (10–12 daily)', reason: 'Healthy fats, vitamin E, magnesium; Indian snack tradition, healthiest expression' },
      { name: 'Water — 2.5–3 L daily', reason: 'Cognitive and physical performance drop even at 1–2% dehydration' },
    ],
    avoidFoods: [
      { name: 'Ultra-processed packaged foods daily', reason: 'High in refined carbs, trans fats, and sodium; displace nutritious whole foods' },
      { name: 'Sugar-sweetened beverages', reason: 'Empty calories; the single most impactful dietary change for weight management' },
      { name: 'Refined oil in excess (> 3–4 tbsp/day)', reason: 'Indian diets often exceed cooking oil recommendations; monitor quantity' },
    ],
    mealTimingNotes: 'Aim for 8–9 hours of sleep — sleep deprivation increases ghrelin (hunger hormone) and reduces leptin (fullness hormone), making healthy eating far harder the next day.',
    indianFoodAlternatives: [
      { original: 'Packaged biscuits as tea snack', alternative: 'A handful of roasted chana or 1 fruit' },
      { original: 'Sugary chai 4× daily', alternative: 'Chai 1–2× with less sugar; replace others with water, chaas, or nimbu pani' },
      { original: 'Eating out for lunch daily', alternative: 'Packed home lunch 4–5 days/week with dal-rice-sabzi-curd combination' },
    ],
    phaseVariants: [],
    disclaimer: 'This is a general wellness guide. Individual needs vary based on age, activity level, health conditions, and goals. Consult a registered dietitian for personalised advice.',
    sortOrder: 10,
  },
];

const seedConditionProtocols = async () => {
  try {
    console.log('🌱 Seeding condition-specific nutrition protocols...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    let created = 0;
    let updated = 0;

    for (const protocol of PROTOCOLS) {
      const result = await ConditionProtocol.findOneAndUpdate(
        { condition: protocol.condition, tenantId: null } as any,
        { $set: { ...protocol, tenantId: null } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ) as any;
      if (result?.createdAt?.getTime() === result?.updatedAt?.getTime()) {
        created++;
      } else {
        updated++;
      }
    }

    console.log(`✅ Done — ${created} created, ${updated} updated (${PROTOCOLS.length} total protocols)`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedConditionProtocols();
