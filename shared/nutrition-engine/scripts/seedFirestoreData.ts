/**
 * سكربت بذر بيانات مرجعية لمرة واحدة على Firestore الحقيقي — يعادل seed_default_recipes()،
 * seed_default_levels()، seed_default_milestones()، seed_default_tips() بايثون مجتمعة (لم تُنقل
 * كمنطق أعمال، هذا سكربت تشغيل يدوي واحد بدل ذلك). Idempotent: لا يكتب فوگ لو المجموعة فيها
 * بيانات أصلًا. شغّله بـ: npx vite-node shared/nutrition-engine/scripts/seedFirestoreData.ts
 */
import "dotenv/config";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../db/firestoreRepository.js";

const db = getFirestore(getFirebaseApp());

// ---- نفس CATEGORIES_SEED/RECIPES_SEED بالضبط من nutrition_ai/recipes_seed.py ----
const CATEGORIES_SEED = [
  { name: "فطور", icon: "🍳", order_index: 1 },
  { name: "غداء", icon: "🍗", order_index: 2 },
  { name: "عشاء", icon: "🌙", order_index: 3 },
  { name: "سناك", icon: "🥗", order_index: 4 },
  { name: "حلويات", icon: "🍰", order_index: 5 },
  { name: "مشروبات حارة", icon: "☕", order_index: 6 },
  { name: "مشروبات باردة", icon: "🧊", order_index: 7 },
];

const RECIPES_SEED = [
  {
    name: "بيض بالطماطة", slug: "eggs-tomato", category: "فطور",
    description: "فطور عراقي بسيط وسريع، غني بالبروتين.",
    prep_time_min: 5, cook_time_min: 10, servings: 1, difficulty: "easy",
    calories: 320, protein: 18, carbs: 12, fat: 22,
    match_keywords: ["بيض بالطماطة", "بيض وطماطة"],
    ingredients: [
      { name: "بيضة", quantity: "2", unit: "حبة" },
      { name: "طماطة", quantity: "1", unit: "حبة متوسطة" },
      { name: "بصل", quantity: "نص", unit: "حبة" },
      { name: "زيت زيتون", quantity: "1", unit: "ملعقة" },
      { name: "ملح وبهار", quantity: null, unit: "حسب الرغبة" },
    ],
    steps: [
      { instruction: "قطّع الطماطة والبصل لقطع صغيرة.", duration: null, temperature: null, tip: null, warning: null },
      { instruction: "حط ملعقة الزيت بمقلاة على نار متوسطة وقلّب البصل لين يذبل.", duration: "3 دقايق", temperature: "نار متوسطة", tip: null, warning: null },
      { instruction: "زيد الطماطة وخليها تنطبخ لين تطري.", duration: "4-5 دقايق", temperature: null, tip: null, warning: null },
      { instruction: "اكسر البيضتين فوگ الخليط وحرّك بهدوء لين تستوي.", duration: null, temperature: null, tip: "لا تحرّك بقوة حتى تظل البيضة طرية.", warning: null },
      { instruction: "رشّ الملح والبهار، وقدّمها ساخنة مع خبز أو صمون.", duration: null, temperature: null, tip: null, warning: null },
    ],
    substitutions: { "زيت زيتون": "تقدر تستخدم أي زيت طبخ عادي بدله، الفرق البسيط بالسعرات مو مهم.", "بصل": "إذا ما عندك بصل، احذفه، الطعم يختلف شوي بس الوصفة تنجح برضو." },
  },
  {
    name: "دجاج مشوي مع سلطة", slug: "grilled-chicken-salad", category: "غداء",
    description: "وجبة غداء عالية البروتين ومنخفضة الدهون.",
    prep_time_min: 10, cook_time_min: 15, servings: 1, difficulty: "medium",
    calories: 380, protein: 40, carbs: 10, fat: 18,
    match_keywords: ["دجاج مشوي", "دجاج بالخضار", "سلطة دجاج"],
    ingredients: [
      { name: "صدر دجاج", quantity: "1", unit: "قطعة" },
      { name: "خس وخيار وطماطة", quantity: null, unit: "للسلطة" },
      { name: "زيت زيتون", quantity: "1", unit: "ملعقة" },
      { name: "ليمون", quantity: null, unit: "حسب الرغبة" },
      { name: "ملح وبهار", quantity: null, unit: "حسب الرغبة" },
    ],
    steps: [
      { instruction: "تبّل الدجاج بالملح والبهار والليمون واتركه يرتاح.", duration: "10 دقايق", temperature: null, tip: null, warning: null },
      { instruction: "اشوي الدجاج على نار متوسطة كل وجه لين يستوي زين.", duration: "6-7 دقايق لكل وجه", temperature: "نار متوسطة", tip: null, warning: "تأكد الدجاج مستوي بالكامل بالنص قبل ما تقطعه." },
      { instruction: "قطّع الخضار وحضّر السلطة بملعقة زيت زيتون وليمون.", duration: null, temperature: null, tip: null, warning: null },
      { instruction: "قطّع الدجاج المشوي وحطه فوگ السلطة، قدّمها فورًا.", duration: null, temperature: null, tip: null, warning: null },
    ],
    substitutions: { "ليمون": "إذا ما عندك ليمون، تكدر تستخدم خل أبيض بكمية أقل." },
  },
  {
    name: "شوربة عدس", slug: "lentil-soup", category: "عشاء",
    description: "عشاء خفيف ودافئ، غني بالألياف.",
    prep_time_min: 10, cook_time_min: 25, servings: 2, difficulty: "easy",
    calories: 220, protein: 12, carbs: 32, fat: 5,
    match_keywords: ["عدس", "شوربة عدس"],
    ingredients: [
      { name: "عدس أصفر", quantity: "1", unit: "كوب" },
      { name: "بصل", quantity: "1", unit: "حبة" },
      { name: "جزر", quantity: "1", unit: "حبة" },
      { name: "زيت", quantity: "1", unit: "ملعقة" },
      { name: "ملح وكمون", quantity: null, unit: "حسب الرغبة" },
    ],
    steps: [
      { instruction: "اغسل العدس زين وصفّيه.", duration: null, temperature: null, tip: null, warning: null },
      { instruction: "قلّب البصل والجزر المفروم بالزيت لين يطري.", duration: "5 دقايق", temperature: null, tip: null, warning: null },
      { instruction: "زيد العدس و4 أكواب مي واتركه يغلي لين ينضج.", duration: "20 دقيقة تقريبًا", temperature: null, tip: null, warning: null },
      { instruction: "اخفقه بالخلاط أو اتركه كثيف حسب الرغبة، رشّ الملح والكمون.", duration: null, temperature: null, tip: "الخفق يخليها أنعم، بس تنجح الوصفة بدونه برضو.", warning: null },
    ],
    substitutions: { "جزر": "تقدر تسويها بدون جزر، الطعم يتغير بسيط بس تظل شوربة زينة." },
  },
  {
    name: "مشروب بارد بالليمون", slug: "cold-lemon-drink", category: "مشروبات باردة",
    description: "مشروب منعش وقليل السعرات بديل عن المشروبات الغازية.",
    prep_time_min: 5, cook_time_min: 0, servings: 1, difficulty: "easy",
    calories: 60, protein: 1, carbs: 14, fat: 0,
    match_keywords: ["مشروب بارد", "شاي مثلج", "ليمون بارد"],
    ingredients: [
      { name: "ماي بارد أو شاي مثلج بدون سكر", quantity: "1", unit: "كوب" },
      { name: "ليمون", quantity: "نص", unit: "حبة" },
    ],
    steps: [
      { instruction: "اعصر الليمون بالماي البارد أو الشاي المثلج.", duration: null, temperature: null, tip: "بدون سكر يخليه سعرات قليلة جدًا.", warning: null },
      { instruction: "قدّمه بارد فورًا.", duration: null, temperature: null, tip: null, warning: null },
    ],
    substitutions: {},
  },
];

// ---- نفس DEFAULT_MILESTONES بالضبط من nutrition_ai/streaks.py ----
const DEFAULT_MILESTONES = [
  { days: 1, xp_reward: 5, label: "أول يوم 🔥" },
  { days: 3, xp_reward: 10, label: "3 أيام متتالية" },
  { days: 7, xp_reward: 20, label: "أسبوع كامل 🔥" },
  { days: 14, xp_reward: 35, label: "أسبوعين" },
  { days: 30, xp_reward: 75, label: "شهر كامل 💪" },
  { days: 60, xp_reward: 120, label: "شهرين" },
  { days: 100, xp_reward: 200, label: "100 يوم 🏆" },
  { days: 365, xp_reward: 500, label: "سنة كاملة 🏆" },
];

// ---- نفس منحنى/العناوين بالضبط من nutrition_ai/levels.py ----
const SPECIAL_TITLES: Record<number, string> = { 1: "البداية", 5: "ملتزم", 10: "مستمر", 20: "منضبط", 30: "محترف" };

// ---- نفس TIPS_SEED بالضبط من nutrition_ai/tips_seed.py ----
const TIPS_SEED = [
  { id: "protein_1", category: "protein", text: "حاول تضيف مصدر بروتين لكل وجبة (بيض، دجاج، لبن) حتى تحس بشبع أطول." },
  { id: "protein_2", category: "protein", text: "البروتين يساعدك تحافظ على العضل خصوصًا إذا هدفك تنزيل وزن." },
  { id: "protein_3", category: "protein", text: "لو وجبتك اليوم قليلة بروتين، جرب تضيف بيض أو لبن بالوجبة الجاية." },
  { id: "balance_1", category: "balance", text: "وجبة متوازنة = بروتين + خضار + كارب. جرب تكمّل وجباتك بهالتركيبة قد ما تكدر." },
  { id: "balance_2", category: "balance", text: "إذا الوجبة كانت دسمة، خلي الوجبة الجاية أخف وتحتوي خضار وبروتين خفيف." },
  { id: "balance_3", category: "balance", text: "إضافة سلطة صغيرة لأي وجبة يزيد الألياف ويخليك تحس بشبع أسرع." },
  { id: "water_1", category: "hydration", text: "لا تنسى الماي اليوم — الماي يساعد بالهضم وبيعطيك طاقة أفضل." },
  { id: "water_2", category: "hydration", text: "أحيانًا نحس بجوع وإحنا فعليًا عطشانين. جرب تشرب ماي قبل ما تاكل سناك زيادة." },
  { id: "water_3", category: "hydration", text: "شرب الماي قبل الوجبة بشوي يساعدك ما تاكل أكثر من اللازم." },
  { id: "loss_1", category: "weight_loss", text: "نزول الوزن يحتاج وقت — الاستمرارية أهم من الكمال بكل وجبة." },
  { id: "loss_2", category: "weight_loss", text: "قلل المشروبات الغازية والسكرية تدريجيًا، هذا وحده يفرق بالسعرات اليومية." },
  { id: "gain_1", category: "weight_gain", text: "للتضخيم، حاول توزع سعراتك على 4-5 وجبات بدل وجبتين كبار." },
  { id: "gain_2", category: "weight_gain", text: "المكسرات والحليب مصادر جيدة لزيادة السعرات بدون ما تحس إنك تحشي نفسك." },
  { id: "portion_1", category: "portion_control", text: "صحن أصغر شوي يخليك تاكل كمية مناسبة بدون ما تحس بالحرمان." },
  { id: "portion_2", category: "portion_control", text: "جرب تاكل ببطء أكثر — الجسم يحتاج وقت حتى يحس بالشبع." },
  { id: "iraqi_1", category: "iraqi_food", text: "أكلات بيتنا العراقية تكدر تكون صحية إذا انتبهت لكمية الدهن والزيت المستخدم بالطبخ." },
  { id: "iraqi_2", category: "iraqi_food", text: "جرب تقلل كمية التمن شوي وتعوضها بسلطة أو خضار، الوجبة تظل تشبع وتوفر سعرات." },
  { id: "home_food_1", category: "home_food", text: "أكل البيت غالبًا أفضل من برا لأنك تتحكم بكمية الزيت والملح المستخدمة." },
  { id: "consistency_1", category: "consistency", text: "يوم واحد ما يحدد رحلتك، المهم ترجع للخطة باليوم الجاي." },
  { id: "consistency_2", category: "consistency", text: "الالتزام لأسبوع كامل أهم بكثير من يوم مثالي واحد." },
  { id: "motivation_1", category: "motivation", text: "كل وجبة تسجلها هي خطوة أقرب لهدفك، حتى لو صغيرة." },
  { id: "motivation_2", category: "motivation", text: "التقدم البطيء أفضل من عدم التقدم — استمر كابتن." },
  { id: "high_cal_1", category: "high_calorie_meal", text: "وجبة عالية السعرات مرة وحدة مو نهاية العالم — خلي الوجبة الجاية أخف وكمل." },
  { id: "high_cal_2", category: "high_calorie_meal", text: "بدل ما تحذف وجبة كاملة تعويضًا، وزّع الباقي على وجبات أخف بدل الحرمان المفاجئ." },
  { id: "low_cal_1", category: "low_calorie_meal", text: "وجبة خفيفة بالسعرات لازم تكون غنية بالبروتين والألياف حتى تشبعك فعليًا." },
  { id: "breakfast_1", category: "breakfast", text: "فطور فيه بروتين (بيض مثلًا) يخليك أقل جوع طول اليوم." },
  { id: "breakfast_2", category: "breakfast", text: "لا تتجاهل الفطور بالكامل — حتى وجبة خفيفة أفضل من الجوع الشديد بعد الظهر." },
  { id: "lunch_1", category: "lunch", text: "غداء متوازن يساعدك توصل للعصر بطاقة أفضل بدل الخمول." },
  { id: "dinner_1", category: "dinner", text: "عشاء خفيف نسبيًا قبل النوم يخلي هضمك أرتاح بالليل." },
  { id: "dinner_2", category: "dinner", text: "إذا باقيلك سعرات قليلة بالليل، جرب لبن أو سلطة بدل وجبة ثقيلة." },
  { id: "target_1", category: "daily_target", text: "أنت قريب جدًا من هدفك اليوم — استمر بنفس المستوى 🔥" },
  { id: "carbs_1", category: "carbs", text: "التمن والخبز مو أعداء — المهم الكمية المناسبة لهدفك، مو حذفهم بالكامل." },
  { id: "fat_1", category: "fat", text: "الدهون الصحية (زيت زيتون، مكسرات) مهمة للجسم — بس بكمية معقولة لأنها عالية بالسعرات." },
  { id: "fiber_1", category: "fiber", text: "زيادة الألياف (خضار، خبز أسمر) تخليك تحس بشبع أطول وتساعد الهضم." },
  { id: "vegetables_1", category: "vegetables", text: "جرب تضيف طبق خضار صغير مع كل وجبة رئيسية، يفرق بالشبع والفيتامينات." },
  { id: "fruits_1", category: "fruits", text: "الفواكه خيار زين للسناك بدل الحلويات، بس لا تكثر منها إذا هدفك تنزيل وزن." },
  { id: "meal_timing_1", category: "meal_timing", text: "توزيع وجباتك بأوقات منتظمة يساعدك تتحكم بالجوع أكثر من وجبة وحدة كبيرة." },
  { id: "healthy_swaps_1", category: "healthy_swaps", text: "جرب تبدل المشروبات الغازية بماي أو شاي بدون سكر، فرق كبير بالسعرات بدون ما تحس." },
  { id: "healthy_swaps_2", category: "healthy_swaps", text: "خبز أسمر بدل الأبيض يزيدك ألياف مع نفس تقريبًا السعرات." },
  { id: "cooking_1", category: "cooking", text: "طبخ أكلتك بنفسك يخليك تتحكم بالزيت والملح أكثر من أي مطعم." },
  { id: "eating_out_1", category: "eating_out", text: "إذا تاكل برا، اختار المشوي بدل المقلي قد ما تكدر — الفرق بالسعرات كبير." },
  { id: "fast_food_1", category: "fast_food", text: "الفاست فود مو ممنوع بالكامل، بس خله استثناء مو عادة يومية." },
  { id: "sugary_drinks_1", category: "sugary_drinks", text: "المشروبات السكرية تضيف سعرات كبيرة بدون ما تشبعك فعليًا — انتبه لعددها باليوم." },
  { id: "soft_drinks_1", category: "soft_drinks", text: "جرب النسخة الدايت من مشروبك المفضل، توفرلك سعرات كبيرة بنفس الطعم تقريبًا." },
  { id: "desserts_1", category: "desserts", text: "الحلويات تكدر تدخل بخطتك بحصة صغيرة ومحسوبة، مو حرمان كامل ولا إفراط." },
  { id: "pre_workout_1", category: "pre_workout", text: "وجبة خفيفة فيها كارب قبل التمرين بساعة أو ساعتين تعطيك طاقة أفضل بالتمرين." },
  { id: "post_workout_1", category: "post_workout", text: "بعد التمرين، بروتين + كارب بسيط يساعد العضل يتعافى أسرع." },
  { id: "recovery_1", category: "recovery", text: "النوم الكافي جزء من الاستشفاء تمامًا متل الأكل — لا تهمله." },
  { id: "sleep_1", category: "sleep", text: "قلة النوم تزيد الشهية وتخليك تحس جوع أكثر بالنهار — النوم الكافي يساعد بالتحكم بالأكل." },
  { id: "healthy_habits_1", category: "healthy_habits", text: "عادات صغيرة ثابتة (ماي، خضار، مشي) تفرق أكثر من رجيم قاسي قصير." },
  { id: "food_variety_1", category: "food_variety", text: "تنويع مصادر البروتين والخضار يخلي وجباتك أغنى بالفيتامينات وأقل ملل." },
  { id: "satiety_1", category: "satiety", text: "الوجبات الغنية بالبروتين والألياف تشبعك لمدة أطول من نفس السعرات بس كارب وسكر." },
  { id: "meal_prep_1", category: "meal_preparation", text: "تحضير وجبات ليومين-ثلاثة مقدمًا يقلل احتمال إنك تاكل فاست فود وقت الاستعجال." },
];

async function seedIfEmpty(collection: string, seedFn: () => Promise<void>) {
  const existing = await db.collection(collection).limit(1).get();
  if (!existing.empty) {
    console.log(`  ⏭️  ${collection}: فيه بيانات أصلًا، تخطّي.`);
    return;
  }
  await seedFn();
  console.log(`  ✅ ${collection}: انزرع.`);
}

async function main() {
  console.log("بذر البيانات المرجعية على Firestore...");

  await seedIfEmpty("recipe_categories", async () => {
    const batch = db.batch();
    for (const c of CATEGORIES_SEED) {
      batch.set(db.collection("recipe_categories").doc(), c);
    }
    await batch.commit();
  });

  // نحتاج معرّفات التصنيفات دائمًا (حتى لو انزرعت بتشغيل سابق) لربط الوصفات بيها
  const categoriesSnap = await db.collection("recipe_categories").get();
  const categoryIdByName: Record<string, string> = {};
  categoriesSnap.docs.forEach((d) => { categoryIdByName[d.data().name] = d.id; });

  await seedIfEmpty("recipes", async () => {
    for (const r of RECIPES_SEED) {
      const categoryId = categoryIdByName[r.category];
      if (!categoryId) {
        console.warn(`  ⚠️ تصنيف غير موجود: ${r.category}، تخطّي وصفة ${r.name}`);
        continue;
      }
      await db.collection("recipes").doc().set({
        name: r.name, slug: r.slug, description: r.description, category_id: categoryId,
        active: true, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat,
        fiber: null, prep_time_min: r.prep_time_min, cook_time_min: r.cook_time_min,
        servings: r.servings, difficulty: r.difficulty, match_keywords: r.match_keywords.join("|"),
        ingredients: r.ingredients,
        steps: r.steps.map((s, i) => ({ ...s, step_number: i + 1 })),
        substitutions: Object.entries(r.substitutions).map(([ingredient_name, replacement]) => ({ ingredient_name, replacement })),
      });
    }
  });

  await seedIfEmpty("streak_milestones", async () => {
    const batch = db.batch();
    for (const m of DEFAULT_MILESTONES) {
      batch.set(db.collection("streak_milestones").doc(), { ...m, active: true });
    }
    await batch.commit();
  });

  await seedIfEmpty("levels", async () => {
    const batch = db.batch();
    for (let level = 1; level <= 30; level++) {
      const requiredXp = level > 1 ? Math.round(50 * Math.pow(level, 1.6)) : 0;
      const title = SPECIAL_TITLES[level] ?? `مستوى ${level}`;
      batch.set(db.collection("levels").doc(String(level)), { level, required_xp: requiredXp, title, reward: null });
    }
    await batch.commit();
  });

  await seedIfEmpty("nutrition_tips", async () => {
    const batch = db.batch();
    for (const t of TIPS_SEED) {
      batch.set(db.collection("nutrition_tips").doc(t.id), {
        text: t.text, category: t.category, active: true, priority: 0,
        meal_type: null, goal: null, time_period: null, difficulty: "easy", created_by: null,
      });
    }
    await batch.commit();
  });

  console.log("\n🎉 خلص البذر.");
}

main().catch((err) => {
  console.error("فشل البذر:", err);
  process.exit(1);
});
