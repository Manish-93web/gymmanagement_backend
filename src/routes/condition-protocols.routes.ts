import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireAnyRole } from '../middleware/rbac.middleware';
import { tenantContext } from '../middleware/tenant.middleware';
import ConditionProtocol from '../models/ConditionProtocol.model';
import Member from '../models/Member.model';

const router = Router();
router.use(authenticate);
router.use(tenantContext);

// ─── Seed platform-default protocols (super_admin only) ───────────────────────
router.post(
  '/seed-defaults',
  requireAnyRole('super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await ConditionProtocol.countDocuments({ tenantId: null });
      if (existing > 0) {
        return res.json({ success: true, message: `${existing} default protocols already exist. Use force=true to re-seed.`, seeded: 0 });
      }

      const defaults = [
        {
          tenantId: null,
          condition: 'PCOS',
          label: 'PCOS — Hormonal Balance Plan',
          description: 'Designed for members with Polycystic Ovary Syndrome. Focuses on low-GI foods, hormonal balance through anti-inflammatory nutrition, and blood sugar regulation.',
          macros: { proteinPercent: 35, carbPercent: 35, fatPercent: 30 },
          calorieAdjustment: -10,
          mealFrequency: '5-6 small meals/day',
          includeFoods: [
            { name: 'Leafy Greens (Spinach, Methi, Palak)', reason: 'Rich in iron and anti-inflammatory compounds' },
            { name: 'Berries (Blueberries, Strawberries)', reason: 'High antioxidants, low GI' },
            { name: 'Cinnamon (Dalchini)', reason: 'Improves insulin sensitivity' },
            { name: 'Omega-3 Fish (Salmon, Sardines)', reason: 'Reduces androgen levels and inflammation' },
            { name: 'Lentils (Dal, Masoor)', reason: 'High protein, low GI, blood sugar stable' },
            { name: 'Quinoa', reason: 'Complete protein, low GI grain alternative' },
            { name: 'Greek Yogurt', reason: 'Probiotic, protein-rich, supports gut health' },
            { name: 'Walnuts and Almonds', reason: 'Healthy fats, anti-inflammatory omega-3' },
            { name: 'Turmeric (Haldi)', reason: 'Powerful anti-inflammatory, reduces oxidative stress' },
          ],
          avoidFoods: [
            { name: 'Refined Sugar (Sweets, Mithai)', reason: 'Spikes insulin, worsens PCOS symptoms' },
            { name: 'White Bread and Maida Products', reason: 'High GI, causes insulin spikes' },
            { name: 'Processed and Packaged Foods', reason: 'Hidden sugars, inflammatory additives' },
            { name: 'High-GI Fruits (Watermelon, Grapes, Mango in excess)', reason: 'Rapid blood sugar elevation' },
            { name: 'Dairy in excess', reason: 'May increase IGF-1 and androgen production' },
            { name: 'Alcohol', reason: 'Disrupts hormone metabolism' },
          ],
          mealTimingNotes: '5-6 small low-GI meals. Never skip breakfast. Eat every 3 hours to maintain blood sugar. Last meal 2 hours before sleep.',
          indianFoodAlternatives: [
            { original: 'White Rice', alternative: 'Brown Rice or Quinoa or Bajra Roti' },
            { original: 'Maida Chapati', alternative: 'Multigrain Atta Roti or Jowar Roti' },
            { original: 'Full-fat Paneer', alternative: 'Low-fat Paneer or Tofu' },
            { original: 'Sugary Tea (Chai)', alternative: 'Green Tea with Cinnamon' },
          ],
          phaseVariants: [
            {
              phaseName: 'Follicular Phase (Days 1-14)',
              notes: 'Higher complex carbs (brown rice, oats). More iron-rich foods (spinach, pomegranate, dates). Increase vitamin C for iron absorption.',
            },
            {
              phaseName: 'Luteal Phase (Days 15-28)',
              notes: 'Higher magnesium foods (dark chocolate, pumpkin seeds, leafy greens). Anti-inflammatory focus (turmeric, ginger). Reduce sodium to manage bloating.',
            },
          ],
          disclaimer: 'This is a wellness plan, not medical treatment. Consult your gynecologist and dietitian.',
          sortOrder: 1,
        },
        {
          tenantId: null,
          condition: 'Hypothyroidism',
          label: 'Hypothyroidism — Thyroid Support Plan',
          description: 'Nutrition protocol for underactive thyroid. Focuses on selenium, iodine, and zinc-rich foods to support thyroid hormone production while avoiding goitrogens.',
          macros: { proteinPercent: 30, carbPercent: 40, fatPercent: 30 },
          mealFrequency: '3-4 meals/day with consistent timing',
          includeFoods: [
            { name: 'Brazil Nuts', reason: 'Highest food source of selenium — 1-2 nuts/day is sufficient' },
            { name: 'Tuna and Sardines', reason: 'Selenium and iodine-rich for thyroid hormone synthesis' },
            { name: 'Eggs', reason: 'Selenium, iodine, and zinc in one food' },
            { name: 'Seaweed (Nori, Kelp in moderation)', reason: 'Rich in iodine for thyroid function' },
            { name: 'Low-fat Dairy (Milk, Curd)', reason: 'Iodine source; choose iodized dairy' },
            { name: 'Pumpkin Seeds (Kaddu ke Beej)', reason: 'Zinc-rich; supports T4 to T3 conversion' },
            { name: 'Chicken and Turkey', reason: 'Lean protein with zinc for metabolism support' },
            { name: 'Berries', reason: 'Antioxidants help reduce thyroid antibodies in Hashimoto\'s' },
          ],
          avoidFoods: [
            { name: 'Raw Cruciferous Vegetables (Broccoli, Cabbage, Kale, Cauliflower)', reason: 'Goitrogens block iodine uptake — cook them to neutralize' },
            { name: 'Soy Products (Tofu, Soy Milk)', reason: 'Isoflavones may interfere with thyroid hormone absorption' },
            { name: 'Gluten (if Hashimoto\'s diagnosed)', reason: 'Molecular mimicry may worsen autoimmune attack on thyroid' },
            { name: 'Coffee/Tea within 1 hour of thyroid medication', reason: 'Interferes with levothyroxine absorption' },
            { name: 'High-fiber foods near medication time', reason: 'Can bind to thyroid medication and reduce absorption' },
          ],
          mealTimingNotes: 'Take thyroid medication 30-60 minutes before breakfast on an empty stomach. Maintain consistent meal times daily. Avoid high-fiber foods and calcium supplements within 4 hours of medication.',
          indianFoodAlternatives: [
            { original: 'Raw Cabbage Sabzi', alternative: 'Cooked Cabbage Sabzi or Palak Sabzi' },
            { original: 'Soy Milk', alternative: 'Almond Milk or Low-fat Cow Milk' },
            { original: 'Regular Atta', alternative: 'Rice Flour Roti (if gluten-free needed)' },
          ],
          disclaimer: 'This is a wellness plan, not medical treatment. Do not adjust thyroid medication without your endocrinologist\'s guidance.',
          sortOrder: 2,
        },
        {
          tenantId: null,
          condition: 'InsulinResistance',
          label: 'Insulin Resistance — Metabolic Reset Plan',
          description: 'Evidence-based low-GI nutrition plan to improve insulin sensitivity, regulate blood sugar, and prevent progression to Type 2 Diabetes.',
          macros: { proteinPercent: 30, carbPercent: 35, fatPercent: 35 },
          calorieAdjustment: -15,
          mealFrequency: '4-5 meals/day, no snacking on carbs alone',
          includeFoods: [
            { name: 'Oats (Unflavored)', reason: 'Beta-glucan fiber slows glucose absorption' },
            { name: 'Sweet Potato (Shakarkandi)', reason: 'Low GI carb with fiber and antioxidants' },
            { name: 'Legumes (Rajma, Chana, Dal)', reason: 'Low GI, high protein + fiber combination' },
            { name: 'Cinnamon (Dalchini)', reason: 'Clinically shown to improve insulin sensitivity' },
            { name: 'Apple Cider Vinegar (pre-meal)', reason: 'Reduces post-meal blood sugar spikes' },
            { name: 'Leafy Greens (Spinach, Kale, Methi)', reason: 'Magnesium-rich; magnesium deficiency linked to insulin resistance' },
            { name: 'Nuts (Almonds, Walnuts)', reason: 'Healthy fats slow carb absorption, improve insulin response' },
            { name: 'Berries', reason: 'Low GI, high antioxidants reduce oxidative stress' },
          ],
          avoidFoods: [
            { name: 'White Rice', reason: 'High GI (72+); causes rapid blood glucose spike' },
            { name: 'White Bread and Maida', reason: 'Refined carbs with minimal fiber, rapid glucose release' },
            { name: 'Sugary Drinks (Juice, Soda, Energy Drinks)', reason: 'Fructose overloads liver and worsens insulin resistance' },
            { name: 'Fruit Juices (even fresh)', reason: 'No fiber, concentrated sugar causes insulin spike' },
            { name: 'High-GI Snacks (Biscuits, Chips, Crackers)', reason: 'Rapid glucose elevation with no satiety' },
            { name: 'Alcohol', reason: 'Impairs glucose metabolism and liver function' },
          ],
          mealTimingNotes: 'Pair every carbohydrate with protein and healthy fat. Never eat carbs alone. Start meals with vegetables and protein before carbs. 10-minute walk after every meal significantly lowers post-meal glucose.',
          indianFoodAlternatives: [
            { original: 'White Rice', alternative: 'Brown Rice or Millets (Bajra, Jowar, Ragi)' },
            { original: 'Maida Roti', alternative: 'Multigrain Atta or Besan Roti' },
            { original: 'Sugary Chai', alternative: 'Green Tea or Black Coffee (no sugar)' },
            { original: 'Potato Sabzi', alternative: 'Sweet Potato or Cauliflower Sabzi' },
          ],
          disclaimer: 'This is a wellness plan, not medical treatment. If you have prediabetes, work with your doctor on a complete care plan.',
          sortOrder: 3,
        },
        {
          tenantId: null,
          condition: 'Type2Diabetes',
          label: 'Type 2 Diabetes — Blood Sugar Control Plan',
          description: 'Structured meal plan for Type 2 Diabetes management. Emphasizes blood sugar stability, Indian-friendly low-GI foods, and consistent meal timing to minimize HbA1c.',
          macros: { proteinPercent: 28, carbPercent: 42, fatPercent: 30 },
          mealFrequency: '3 main meals + 2 small snacks',
          includeFoods: [
            { name: 'Bitter Gourd (Karela)', reason: 'Contains charantin which mimics insulin action' },
            { name: 'Fenugreek Seeds (Methi Dana)', reason: 'Soluble fiber slows carb absorption; lowers fasting glucose' },
            { name: 'Barley (Jau)', reason: 'Low GI grain with beta-glucan fiber' },
            { name: 'Moong Dal and Masoor Dal', reason: 'High protein, low GI; stabilizes blood sugar' },
            { name: 'Rajma (Kidney Beans)', reason: 'High fiber and protein, very low GI (29)' },
            { name: 'Nuts (Almonds, Walnuts, Peanuts)', reason: 'Slow gastric emptying; reduce post-meal glucose' },
            { name: 'Seeds (Flaxseeds, Chia)', reason: 'Omega-3 fatty acids improve insulin sensitivity' },
            { name: 'Amla (Indian Gooseberry)', reason: 'Rich in vitamin C, chromium; improves insulin receptor sensitivity' },
          ],
          avoidFoods: [
            { name: 'White Rice in large portions', reason: 'High GI triggers blood sugar spikes; limit to 1/3 plate' },
            { name: 'Sweets and Mithai', reason: 'Rapid glucose spike; very high glycemic load' },
            { name: 'Maida (All-Purpose Flour)', reason: 'Refined carb with no fiber; elevates blood sugar rapidly' },
            { name: 'Packaged and Processed Foods', reason: 'Hidden sugars, sodium, and trans fats worsen glycemic control' },
            { name: 'Fruit Juices and Sugary Drinks', reason: 'Liquid carbs absorbed fastest; no fiber buffer' },
            { name: 'Fried Foods (Poori, Samosa, Pakoda)', reason: 'Trans fats worsen insulin resistance' },
          ],
          mealTimingNotes: '3 main meals + 2 small snacks at fixed times daily. Never skip meals — this causes blood sugar instability. Eat at same time every day. Keep snacks to 100-150 kcal. Monitor blood glucose 2 hours after meals.',
          indianFoodAlternatives: [
            { original: 'White Rice', alternative: 'Brown Rice, Millets, or Cauliflower Rice' },
            { original: 'Regular Roti (Maida)', alternative: 'Besan Roti, Ragi Roti, or Multigrain Atta Roti' },
            { original: 'Regular Mithai', alternative: 'Date-based sweets or Sugar-free variants (in moderation)' },
            { original: 'Mango (excess)', alternative: 'Papaya, Jamun, or Guava (lower GI options)' },
            { original: 'Potato', alternative: 'Sweet Potato, Yam, or Raw Banana' },
          ],
          disclaimer: 'This is a wellness plan, not medical treatment. Always coordinate with your diabetologist. Do not adjust medication based on diet changes alone.',
          sortOrder: 4,
        },
        {
          tenantId: null,
          condition: 'Hypertension',
          label: 'Hypertension — DASH Diet Protocol',
          description: 'Based on the clinically validated DASH (Dietary Approaches to Stop Hypertension) protocol. Focuses on potassium, calcium, and magnesium intake while minimizing sodium.',
          macros: { proteinPercent: 20, carbPercent: 55, fatPercent: 25 },
          mealFrequency: '4-5 smaller meals spread evenly',
          includeFoods: [
            { name: 'Banana', reason: 'High potassium (422mg) counteracts sodium effects on blood pressure' },
            { name: 'Sweet Potato (Shakarkandi)', reason: 'Potassium + magnesium + fiber combination' },
            { name: 'Coconut Water', reason: 'Natural potassium and electrolyte balance' },
            { name: 'Low-fat Dairy (Curd, Skimmed Milk)', reason: 'Calcium and protein reduce blood pressure' },
            { name: 'Leafy Greens (Spinach, Palak)', reason: 'Nitrates converted to nitric oxide, dilates blood vessels' },
            { name: 'Oats', reason: 'Beta-glucan fiber reduces LDL and blood pressure' },
            { name: 'Berries', reason: 'Flavonoids improve arterial flexibility' },
            { name: 'Flaxseeds', reason: 'Omega-3 ALA; clinically reduces systolic BP' },
          ],
          avoidFoods: [
            { name: 'Table Salt and Excess Sodium (>1500mg/day)', reason: 'Sodium causes water retention and increases blood pressure' },
            { name: 'Processed Meats (Sausage, Salami)', reason: 'Very high sodium content' },
            { name: 'Pickles (Achar) and Papad', reason: 'Extremely high sodium; common in Indian diets' },
            { name: 'Canned Foods and Packaged Snacks', reason: 'Hidden sodium; often 30-50% daily sodium in one serving' },
            { name: 'Alcohol', reason: 'Directly raises blood pressure; interacts with BP medications' },
            { name: 'Caffeine in excess (>200mg/day)', reason: 'Temporary BP spike; reduce gradually' },
          ],
          mealTimingNotes: 'Spread calorie intake evenly across 4-5 meals. High-fiber breakfast is critical. Avoid heavy dinners after 8 PM. Limit sodium to 1500mg/day (approx 3/4 teaspoon salt total). Drink 8-10 glasses of water.',
          indianFoodAlternatives: [
            { original: 'Regular Salt (in cooking + at table)', alternative: 'Herb seasoning (lemon, coriander, cumin); reduce by 50%' },
            { original: 'Achar (Pickle)', alternative: 'Fresh green chutney (no salt) or Lime' },
            { original: 'Papad', alternative: 'Roasted Chana or Makhana (fox nuts)' },
            { original: 'Salted Lassi', alternative: 'Unsweetened Chaas (buttermilk) with cumin only' },
          ],
          disclaimer: 'This is a wellness plan, not medical treatment. Do not stop or modify blood pressure medication without consulting your cardiologist.',
          sortOrder: 5,
        },
        {
          tenantId: null,
          condition: 'SkinHealth',
          label: 'Skin Health — Anti-Inflammatory Glow Plan',
          description: 'Nutrition protocol targeting skin health through collagen support, anti-inflammatory foods, antioxidants, and hydration. Effective for acne, eczema, and premature aging.',
          macros: { proteinPercent: 25, carbPercent: 45, fatPercent: 30 },
          mealFrequency: '3 meals + 1-2 snacks',
          includeFoods: [
            { name: 'Salmon and Fatty Fish', reason: 'Omega-3 reduces skin inflammation; EPA reduces acne' },
            { name: 'Flaxseeds (Alsi)', reason: 'ALA omega-3; reduces dryness, improves skin barrier' },
            { name: 'Blueberries and Strawberries', reason: 'Anthocyanins protect skin from UV damage' },
            { name: 'Tomatoes', reason: 'Lycopene: natural sun protection and collagen support' },
            { name: 'Bone Broth', reason: 'Hydrolyzed collagen; supports skin elasticity' },
            { name: 'Citrus Fruits (Amla, Lemon, Orange)', reason: 'Vitamin C essential for collagen synthesis' },
            { name: 'Pumpkin Seeds', reason: 'Zinc: regulates sebum, reduces acne bacteria' },
            { name: 'Sweet Potato', reason: 'Beta-carotene (converts to Vitamin A): skin cell renewal' },
            { name: 'Green Tea', reason: 'EGCG antioxidants reduce inflammation and photo-aging' },
          ],
          avoidFoods: [
            { name: 'Dairy (if acne-prone)', reason: 'Whey protein spikes IGF-1 and androgens linked to acne' },
            { name: 'High-Sugar Foods and Refined Carbs', reason: 'Glycation damages collagen; sugar feeds acne bacteria' },
            { name: 'Refined Carbohydrates', reason: 'Rapid insulin spike triggers androgen and sebum production' },
            { name: 'Alcohol', reason: 'Dehydrates skin, disrupts sleep (skin repairs at night), depletes zinc' },
            { name: 'Fried and Processed Foods', reason: 'Trans fats and oxidized oils accelerate skin aging' },
          ],
          mealTimingNotes: '7-day anti-inflammatory rotation plan. Hydration is critical: minimum 3 liters of water per day. Add lemon or cucumber to water for extra skin benefit. Eat collagen-boosting foods with Vitamin C for absorption.',
          indianFoodAlternatives: [
            { original: 'Regular Chai with milk', alternative: 'Turmeric Golden Milk or Green Tea' },
            { original: 'Deep-fried Snacks', alternative: 'Roasted Makhana or Bhuna Chana' },
            { original: 'Packaged Biscuits', alternative: 'Fruit with flaxseeds or Walnuts' },
          ],
          disclaimer: 'This is a wellness plan, not medical treatment. For severe acne or skin conditions, consult a dermatologist.',
          sortOrder: 6,
        },
        {
          tenantId: null,
          condition: 'GERD',
          label: 'GERD — Acid Reflux Management Plan',
          description: 'Dietary guidelines for Gastroesophageal Reflux Disease (GERD) and chronic acid reflux. Focuses on alkaline, low-acid foods and meal timing to reduce esophageal irritation.',
          macros: { proteinPercent: 25, carbPercent: 50, fatPercent: 25 },
          mealFrequency: '5-6 small meals; never large meals',
          includeFoods: [
            { name: 'Oatmeal', reason: 'Alkaline base; absorbs stomach acid; keeps you full' },
            { name: 'Ginger (Adrak)', reason: 'Natural anti-inflammatory; reduces nausea and reflux' },
            { name: 'Aloe Vera Juice (unsweetened)', reason: 'Soothes esophageal lining; reduces inflammation' },
            { name: 'Non-citrus Fruits (Banana, Melon, Apple)', reason: 'Alkaline; gentle on stomach lining' },
            { name: 'Lean Protein (Chicken breast, Fish)', reason: 'Low-fat protein doesn\'t trigger reflux like fatty meats' },
            { name: 'Whole Grains', reason: 'Fiber reduces reflux frequency' },
            { name: 'Coconut Water', reason: 'Alkaline; calms acid reflux naturally' },
          ],
          avoidFoods: [
            { name: 'Spicy Foods (Mirchi, Sambhar, Vindaloo)', reason: 'Capsaicin relaxes lower esophageal sphincter (LES)' },
            { name: 'Citrus Fruits and Juices', reason: 'High acid content directly irritates esophagus' },
            { name: 'Tomatoes and Tomato Products', reason: 'Acidic; triggers reflux in most GERD patients' },
            { name: 'Coffee and Tea', reason: 'Caffeine relaxes LES; promotes acid secretion' },
            { name: 'Alcohol', reason: 'Relaxes LES and stimulates acid production' },
            { name: 'Chocolate (Chocolates, Cocoa)', reason: 'Methylxanthines relax LES; high fat content delays gastric emptying' },
            { name: 'Fatty and Fried Foods', reason: 'Delay gastric emptying; increase reflux pressure' },
            { name: 'Mint and Peppermint', reason: 'Paradoxically worsens reflux by relaxing LES' },
          ],
          mealTimingNotes: 'Eat 2-3 hours before lying down. Never eat within 2 hours of bedtime. Small frequent meals prevent stomach overfilling. Elevate head of bed by 6-8 inches. Avoid tight clothing after meals.',
          indianFoodAlternatives: [
            { original: 'Spicy Curry', alternative: 'Mild Dal Tadka (no chili, minimal spice)' },
            { original: 'Chai', alternative: 'Ginger and Licorice Herbal Tea' },
            { original: 'Tomato-based Sabzi', alternative: 'Lauki (Bottle Gourd) or Tinda Sabzi' },
            { original: 'Sambhar', alternative: 'Mild Moong Dal Soup with cumin' },
          ],
          disclaimer: 'This is a wellness plan, not medical treatment. If symptoms persist or worsen, consult a gastroenterologist.',
          sortOrder: 7,
        },
        {
          tenantId: null,
          condition: 'Celiac',
          label: 'Celiac Disease — Strict Gluten-Free Protocol',
          description: 'Medically necessary strict gluten-free nutrition plan for Celiac Disease. Cross-contamination prevention is as critical as food choices. Includes Indian gluten-free staple alternatives.',
          macros: { proteinPercent: 25, carbPercent: 50, fatPercent: 25 },
          mealFrequency: '3 meals + 2 snacks',
          includeFoods: [
            { name: 'Rice (all varieties)', reason: 'Naturally gluten-free staple' },
            { name: 'Quinoa', reason: 'Complete protein, naturally gluten-free super grain' },
            { name: 'Millet (Bajra, Jowar, Ragi)', reason: 'Indian gluten-free grains; highly nutritious' },
            { name: 'Amaranth (Rajgira)', reason: 'Gluten-free; high calcium and protein' },
            { name: 'Sorghum (Jowar)', reason: 'Traditional Indian GF grain; antioxidant-rich' },
            { name: 'Potato and Sweet Potato', reason: 'Versatile gluten-free carbohydrate source' },
            { name: 'All Dal and Legumes', reason: 'Naturally gluten-free; complete nutrition' },
            { name: 'Corn (Makka)', reason: 'Gluten-free grain; versatile in Indian cooking' },
          ],
          avoidFoods: [
            { name: 'Wheat (Gehun) and Atta', reason: 'Primary gluten source; causes intestinal damage in Celiac' },
            { name: 'Barley (Jau)', reason: 'Contains hordein (a form of gluten)' },
            { name: 'Rye', reason: 'Secalin form of gluten' },
            { name: 'Regular Oats', reason: 'Cross-contaminated with wheat; only certified GF oats allowed' },
            { name: 'Maida (All-Purpose Flour)', reason: 'Refined wheat flour; highly glutinous' },
            { name: 'Sooji/Semolina (Rava)', reason: 'Made from durum wheat; contains gluten' },
            { name: 'Regular Atta', reason: 'Wheat-based; must be replaced with GF alternatives' },
          ],
          mealTimingNotes: 'Always read ingredient labels — gluten hides in sauces, spice mixes, and processed foods. Use dedicated GF cookware to prevent cross-contamination. Supplement with Vitamin D, calcium, iron, and B12 as Celiac impairs absorption.',
          indianFoodAlternatives: [
            { original: 'Wheat Roti (Chapati)', alternative: 'Jowar Roti, Bajra Roti, or Rice Flour Roti' },
            { original: 'Poha', alternative: 'Verify it\'s certified GF; some brands add wheat' },
            { original: 'Upma (Sooji)', alternative: 'Quinoa Upma or Millet Upma' },
            { original: 'Bread', alternative: 'Certified GF Bread or Rice Bread' },
            { original: 'Pasta', alternative: 'Rice Noodles or Certified GF Pasta' },
          ],
          disclaimer: 'Celiac Disease is a medical condition requiring lifelong gluten-free diet. Even trace amounts cause intestinal damage. Consult your gastroenterologist regularly.',
          sortOrder: 8,
        },
        {
          tenantId: null,
          condition: 'LactoseIntolerance',
          label: 'Lactose Intolerance — Dairy-Free Calcium Plan',
          description: 'Dairy-free nutrition protocol maintaining adequate calcium and vitamin D through plant-based and lactose-free alternatives. Prevents bone density loss common in dairy avoiders.',
          macros: { proteinPercent: 25, carbPercent: 50, fatPercent: 25 },
          mealFrequency: '3 meals + 1-2 snacks',
          includeFoods: [
            { name: 'Almond Milk (fortified)', reason: 'Low calorie dairy alternative; fortified with calcium and D3' },
            { name: 'Soy Milk (fortified)', reason: 'Closest to cow milk in protein; calcium-fortified' },
            { name: 'Lactose-free Dairy', reason: 'Same nutrition as regular dairy, enzyme pre-treated' },
            { name: 'Fortified Plant Milks (Oat, Rice, Coconut)', reason: 'Good calcium alternatives; choose fortified versions' },
            { name: 'Ragi (Finger Millet)', reason: 'Highest plant source of calcium (344mg per 100g)' },
            { name: 'Sesame Seeds (Til)', reason: 'Very high calcium; used in Indian cooking naturally' },
            { name: 'Leafy Greens (Palak, Methi, Amaranth)', reason: 'Calcium-rich; enhanced with vitamin K' },
            { name: 'Hard Aged Cheese (in small amounts)', reason: 'Aging reduces lactose; often tolerated better' },
          ],
          avoidFoods: [
            { name: 'Milk (Regular)', reason: 'High lactose content (12g per cup); causes symptoms' },
            { name: 'Cream and Heavy Cream', reason: 'High lactose; causes bloating, diarrhea' },
            { name: 'Butter (in large amounts)', reason: 'Lower lactose but still problematic for sensitive individuals' },
            { name: 'Paneer', reason: 'Fresh cheese; higher lactose than aged cheese' },
            { name: 'Soft Cheeses (Cottage Cheese, Ricotta)', reason: 'High moisture = high lactose content' },
            { name: 'Ice Cream', reason: 'High lactose + high sugar' },
          ],
          mealTimingNotes: 'Supplement calcium (1000mg/day) from food sources + supplement if needed. Take Vitamin D3 (1000-2000 IU/day) with fat for absorption. Spread calcium intake across meals for better absorption. If using lactase enzyme supplements, take just before consuming dairy.',
          indianFoodAlternatives: [
            { original: 'Regular Milk in Chai', alternative: 'Oat Milk or Almond Milk Chai' },
            { original: 'Paneer in Curries', alternative: 'Tofu (Firm) as 1:1 replacement' },
            { original: 'Dahi (Yogurt)', alternative: 'Coconut Yogurt or Soy Yogurt' },
            { original: 'Ghee', alternative: 'Cold-pressed Coconut Oil or Avocado Oil' },
            { original: 'Kheer', alternative: 'Ragi Kheer with almond milk' },
          ],
          disclaimer: 'Lactose intolerance is different from milk allergy. Lactase enzyme supplements can allow moderate dairy consumption. Consult your doctor about calcium supplementation.',
          sortOrder: 9,
        },
        {
          tenantId: null,
          condition: 'General',
          label: 'General Wellness — Balanced Nutrition Plan',
          description: 'Balanced whole foods nutrition plan for members without specific medical conditions. Promotes long-term health, energy, and optimal body composition.',
          macros: { proteinPercent: 25, carbPercent: 50, fatPercent: 25 },
          mealFrequency: '3 main meals + 1-2 healthy snacks',
          includeFoods: [
            { name: 'Whole Grains (Brown Rice, Oats, Quinoa)', reason: 'Sustained energy, fiber, and micronutrients' },
            { name: 'Lean Protein (Dal, Eggs, Chicken, Fish)', reason: 'Muscle maintenance and satiety' },
            { name: 'Rainbow Vegetables', reason: 'Diverse phytonutrients, fiber, and vitamins' },
            { name: 'Seasonal Fruits (2-3 servings/day)', reason: 'Natural sugars, antioxidants, vitamin C' },
            { name: 'Healthy Fats (Nuts, Seeds, Avocado)', reason: 'Brain health, hormone production, fat-soluble vitamins' },
            { name: 'Fermented Foods (Curd, Dosa, Idli)', reason: 'Probiotic support for gut and immune health' },
          ],
          avoidFoods: [
            { name: 'Ultra-processed Foods', reason: 'Low nutrient density, high in additives' },
            { name: 'Sugary Beverages', reason: 'Empty calories without satiety' },
            { name: 'Trans Fats (Vanaspati, Dalda)', reason: 'Increase LDL, inflammation risk' },
            { name: 'Excessive Refined Carbs', reason: 'Blood sugar instability, energy crashes' },
          ],
          mealTimingNotes: 'Follow the plate method: 1/2 plate vegetables, 1/4 protein, 1/4 complex carbs. Eat mindfully without distractions. Stay hydrated with 2.5-3L water/day. Limit sugar to <25g/day as per WHO guidelines.',
          indianFoodAlternatives: [
            { original: 'Maida Products', alternative: 'Whole Wheat or Multigrain alternatives' },
            { original: 'Deep-fried Snacks', alternative: 'Roasted, baked, or air-fried versions' },
          ],
          disclaimer: 'This is a wellness plan, not medical treatment. Individual needs vary. Consult a registered dietitian for a personalized plan.',
          sortOrder: 10,
        },
      ];

      await ConditionProtocol.insertMany(defaults);
      return res.status(201).json({
        success: true,
        message: `${defaults.length} default protocols seeded successfully.`,
        seeded: defaults.length,
      });
    } catch (err) { next(err); }
  }
);

// ─── Get protocols for a specific member based on their conditions ─────────────
router.get(
  '/member/:memberId/recommendations',
  requireAnyRole('gym_owner', 'branch_manager', 'trainer', 'staff', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const { memberId } = req.params;

      const member = await Member.findOne({ _id: memberId, tenantId })
        .select('firstName lastName healthInfo')
        .lean();

      if (!member) {
        return res.status(404).json({ success: false, message: 'Member not found' });
      }

      const conditions: string[] = (member as any).healthInfo?.medicalConditions ?? [];

      if (!conditions.length) {
        return res.json({
          success: true,
          data: {
            member: { firstName: (member as any).firstName, lastName: (member as any).lastName },
            conditions: [],
            protocols: [],
          },
        });
      }

      // Fetch tenant overrides + platform defaults
      const [tenantProtocols, defaultProtocols] = await Promise.all([
        ConditionProtocol.find({ tenantId, condition: { $in: conditions } as any, isActive: true }).lean(),
        ConditionProtocol.find({ tenantId: null, condition: { $in: conditions } as any, isActive: true }).lean(),
      ]);

      // Merge: tenant override wins per condition
      const tenantConditionSet = new Set(tenantProtocols.map((p: any) => p.condition));
      const merged = [
        ...tenantProtocols,
        ...defaultProtocols.filter((p: any) => !tenantConditionSet.has(p.condition)),
      ];

      return res.json({
        success: true,
        data: {
          member: { firstName: (member as any).firstName, lastName: (member as any).lastName },
          conditions,
          protocols: merged,
        },
      });
    } catch (err) { next(err); }
  }
);

// ─── List all protocols (merged tenant + platform defaults) ───────────────────
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;

    const [tenantProtocols, defaultProtocols] = await Promise.all([
      ConditionProtocol.find({ tenantId, isActive: true }).sort({ sortOrder: 1 }).lean(),
      ConditionProtocol.find({ tenantId: null, isActive: true }).sort({ sortOrder: 1 }).lean(),
    ]);

    // Merge: tenant protocol overrides platform default for same condition
    const tenantConditionSet = new Set(tenantProtocols.map((p: any) => p.condition));
    const merged = [
      ...tenantProtocols,
      ...defaultProtocols.filter((p: any) => !tenantConditionSet.has(p.condition)),
    ].sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return res.json({ success: true, data: merged });
  } catch (err) { next(err); }
});

// ─── Get protocol by condition name ──────────────────────────────────────────
router.get('/:condition', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = (req as any).tenantId;
    const { condition } = req.params;

    // Try tenant override first, then fall back to platform default
    let protocol = await ConditionProtocol.findOne({ tenantId, condition: condition as any, isActive: true }).lean();
    if (!protocol) {
      protocol = await ConditionProtocol.findOne({ tenantId: null, condition: condition as any, isActive: true }).lean();
    }

    if (!protocol) {
      return res.status(404).json({ success: false, message: `No protocol found for condition: ${condition}` });
    }

    return res.json({ success: true, data: protocol });
  } catch (err) { next(err); }
});

// ─── Create / override a protocol for this tenant ────────────────────────────
router.post(
  '/',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const protocol = await ConditionProtocol.create({ ...req.body, tenantId });
      return res.status(201).json({ success: true, data: protocol });
    } catch (err) { next(err); }
  }
);

// ─── Update a protocol ────────────────────────────────────────────────────────
router.put(
  '/:id',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      // Allow super_admin to update platform defaults (tenantId: null)
      const isSuperAdmin = (req as any).user?.role === 'super_admin';
      const filter = isSuperAdmin
        ? { _id: req.params.id }
        : { _id: req.params.id, tenantId };

      const updated = await ConditionProtocol.findOneAndUpdate(
        filter,
        { $set: req.body },
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Protocol not found or access denied' });
      }

      return res.json({ success: true, data: updated });
    } catch (err) { next(err); }
  }
);

// ─── Delete tenant override (restores platform default) ───────────────────────
router.delete(
  '/:id',
  requireAnyRole('gym_owner', 'super_admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = (req as any).tenantId;
      const isSuperAdmin = (req as any).user?.role === 'super_admin';
      const filter = isSuperAdmin
        ? { _id: req.params.id }
        : { _id: req.params.id, tenantId };

      const deleted = await ConditionProtocol.findOneAndDelete(filter);
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Protocol not found or access denied' });
      }

      return res.json({ success: true, message: 'Protocol deleted. Platform default will be used.' });
    } catch (err) { next(err); }
  }
);

export default router;
