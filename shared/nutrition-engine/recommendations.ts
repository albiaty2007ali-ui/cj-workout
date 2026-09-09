/**
 * منفذ حرفي من nutrition_ai/recommendations.py — يبحث بقاعدة الأكل المحلية (foods.sqlite) حسب
 * السعرات المتبقية/الهدف/البروتين الناقص، ولا يخترع أي وجبة أبدًا.
 */
import { getFoodDb, queryAll, queryOne } from "./db/foodDb.js";
import { computeFood } from "./calculator.js";
import { getPortionsFor } from "./foodSearch.js";
import { pyRound } from "./pyRound.js";

interface CandidateRow {
  name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  portion_name: string | null;
  grams: number | null;
}

async function candidates(remainingCalories: number) {
  const db = await getFoodDb();
  const rows = queryAll(
    db,
    `SELECT f.name, fn.calories_per_100g, fn.protein_per_100g, fp.portion_name, fp.grams
     FROM foods f JOIN food_nutrients fn ON fn.food_id=f.id
     LEFT JOIN food_portions fp ON fp.food_id=f.id
     GROUP BY f.id`,
  ) as unknown as CandidateRow[];

  const out: { name: string; calories: number; protein: number; portion: string | null }[] = [];
  for (const r of rows) {
    const grams = r.grams || 100;
    const cal = pyRound((r.calories_per_100g * grams) / 100);
    const protein = pyRound((r.protein_per_100g * grams) / 100, 1);
    if (cal > 0 && cal <= Math.max(remainingCalories, 1)) {
      out.push({ name: r.name, calories: cal, protein, portion: r.portion_name });
    }
  }
  return out;
}

/** يقترح ضمن الباقي من السعرات، مرجّح لصالح البروتين إذا المستخدم ناقصه اليوم. */
export async function suggestMealWithin(remainingCalories: number, proteinNeeded = 0): Promise<string> {
  if (remainingCalories <= 0) {
    return "خلصت سعراتك اليوم، بس اذا لسا جوعان جرب سلطة أو خضار قليلة السعرات جدًا.";
  }

  const list = await candidates(remainingCalories);
  if (list.length === 0) {
    return `باقيلك ${remainingCalories} سعرة تقريبًا — جرب وجبة خفيفة زي سلطة أو خضار.`;
  }

  list.sort((a, b) => b.protein - a.protein || a.calories - b.calories);
  const top = list.slice(0, 3);
  const lines = top.map((c) => `• ${c.name} (${c.portion || "حصة"}) — ~${c.calories} kcal`);
  let prefix = `بما إن باقيلك تقريبًا ${remainingCalories} سعرة`;
  if (proteinNeeded > 0) prefix += " وناقصك بروتين اليوم";
  return `${prefix}، أقترحلك:\n${lines.join("\n")}`;
}

/** للحالة: "اريد وجبة 500 سعرة" — يبحث عن أقرب الأطعمة الحقيقية لهذا الرقم. */
export async function suggestMealNearTarget(targetCalories: number): Promise<string> {
  const db = await getFoodDb();
  const rows = queryAll(
    db,
    `SELECT f.name, fn.calories_per_100g, fp.portion_name, fp.grams
     FROM foods f JOIN food_nutrients fn ON fn.food_id=f.id
     LEFT JOIN food_portions fp ON fp.food_id=f.id
     GROUP BY f.id`,
  ) as unknown as CandidateRow[];

  const scored: [number, string, number, string | null][] = [];
  for (const r of rows) {
    const grams = r.grams || 100;
    const cal = pyRound((r.calories_per_100g * grams) / 100);
    if (cal <= 0) continue;
    const diff = Math.abs(cal - targetCalories);
    if (diff <= Math.max(150, targetCalories * 0.3)) {
      scored.push([diff, r.name, cal, r.portion_name]);
    }
  }
  scored.sort((a, b) => a[0] - b[0]);
  const top = scored.slice(0, 3);
  if (top.length === 0) {
    return `ما لقيت وجبة قريبة من ${targetCalories} سعرة بقاعدة بياناتي الحالية. جرب رقم مختلف أو اذكر أكلة معينة.`;
  }
  const lines = top.map(([, name, cal, portion]) => `• ${name} (${portion || "حصة"}) — تقريبًا ${cal} kcal`);
  return `هذي أقرب خيارات لـ${targetCalories} سعرة تقريبًا:\n${lines.join("\n")}`;
}

/**
 * يقترح كميات حقيقية من طعام محدد بالاسم (مثلاً "شكد آكل من الدولمة؟" أو "شكد آكل من الرز؟") —
 * يعتمد فقط على getPortionsFor/computeFood الحقيقيين، صفر اختراع أرقام. يعرض كل الوحدات الحقيقية
 * المعروفة لهذا الطعام (ملعقة/خاشوقة/كوب/صحن/حبة...، أيًا كانت الوحدات المسجّلة له بقاعدة
 * البيانات) بدل اقتراح وحدة وحدة بس — حتى المستخدم يشوف الخيارات ويختار الأنسب إله.
 */
export async function suggestPortionForFood(foodId: number, foodName: string, remainingCalories: number): Promise<string> {
  const portions = await getPortionsFor(foodId);
  const scored: { portion_name: string; calories: number; fits: boolean }[] = [];
  for (const p of portions) {
    const grams = p.grams;
    if (!grams) continue;
    const nutrition = await computeFood(foodId, Number(grams));
    scored.push({
      portion_name: (p.portion_name as string) || "حصة",
      calories: nutrition.calories,
      fits: remainingCalories <= 0 || nutrition.calories <= remainingCalories,
    });
  }

  if (scored.length === 0) {
    return `ماكو عندي معلومة كمية دقيقة عن ${foodName} بقاعدة البيانات الحالية، بس گلي الوزن بالغرام وأحسبلك السعرات بالضبط.`;
  }

  scored.sort((a, b) => a.calories - b.calories);
  const lines = scored.map((s) => `🍽️ ${s.portion_name} — ~${s.calories} kcal${s.fits ? "" : " (أعلى من الباقي إلك)"}`);
  const anyFits = scored.some((s) => s.fits);

  if (anyFits) {
    return `إذا مشتهي ${foodName}، هذي الكميات الحقيقية المعروفة إلي عنه 🌱:\n${lines.join("\n")}`;
  }

  const smallest = scored[0];
  return (
    `حتى أصغر كمية معروفة من ${foodName} (${smallest.portion_name}, ~${smallest.calories} kcal) ` +
    `أعلى شوي من سعراتك المتبقية (~${remainingCalories}) — القرار إلك طبعًا، ` +
    `بس خل الوجبة الجاية أخف حتى توازن يومك.\n\n${lines.join("\n")}`
  );
}

/**
 * "شكد آكل دولمة؟" ← "500 سعرة" — يختار أقرب كمية حقيقية معروفة لهذا الرقم المستهدف، مو أكبر
 * كمية تدخل بالباقي (فرق جوهري عن suggestPortionForFood). صفر اختراع كمية غير مسجّلة بالقاعدة.
 */
export async function suggestPortionNearTarget(foodId: number, foodName: string, targetCalories: number): Promise<string> {
  const portions = await getPortionsFor(foodId);
  const scored: { portion_name: string; calories: number; diff: number }[] = [];
  for (const p of portions) {
    const grams = p.grams;
    if (!grams) continue;
    const nutrition = await computeFood(foodId, Number(grams));
    scored.push({ portion_name: (p.portion_name as string) || "حصة", calories: nutrition.calories, diff: Math.abs(nutrition.calories - targetCalories) });
  }
  if (scored.length === 0) {
    return `ماكو عندي معلومة كمية دقيقة عن ${foodName} بقاعدة البيانات الحالية، بس گلي الوزن بالغرام وأحسبلك أقرب شي لـ${targetCalories} سعرة.`;
  }
  scored.sort((a, b) => a.diff - b.diff || a.calories - b.calories);
  const best = scored[0];
  return `أقرب كمية حقيقية لـ${targetCalories} سعرة من ${foodName} عندي: ${best.portion_name} — ~${best.calories} kcal.`;
}

/**
 * سؤال معلوماتي صرف عن أحجام/سعرات طعام معيّن ("شكد سعرات X؟"/"شكد حجم X؟") — بدون أي افتراض
 * نية أكل أو ربط بالسعرات المتبقية (يفرق عن suggestPortionForFood المخصص لتوصية "شكد آكل؟").
 */
export async function describeFoodPortions(foodId: number, foodName: string): Promise<string> {
  const portions = await getPortionsFor(foodId);
  const rows: { portion_name: string; calories: number }[] = [];
  for (const p of portions) {
    const grams = p.grams;
    if (!grams) continue;
    const nutrition = await computeFood(foodId, Number(grams));
    rows.push({ portion_name: (p.portion_name as string) || "حصة", calories: nutrition.calories });
  }
  if (rows.length === 0) {
    return `ماكو عندي معلومة كمية دقيقة عن ${foodName} بقاعدة البيانات الحالية، بس گلي الوزن بالغرام وأحسبلك السعرات بالضبط.`;
  }
  rows.sort((a, b) => a.calories - b.calories);
  const lines = rows.map((r) => `🍽️ ${r.portion_name} — ~${r.calories} kcal`);
  return `الأحجام/الكميات الحقيقية المعروفة إلي عن ${foodName} 🌱:\n${lines.join("\n")}`;
}

/** "شكد يعني صحن؟" بدون اسم طعام محدد — أمثلة حقيقية من قاعدة البيانات لنفس اسم الوحدة، بدون تخمين. */
export async function describeGenericUnit(unitWord: string): Promise<string> {
  const db = await getFoodDb();
  const rows = queryAll(
    db,
    `SELECT f.name AS name, fp.grams AS grams FROM food_portions fp JOIN foods f ON f.id = fp.food_id
     WHERE fp.normalized_portion_name LIKE ? ORDER BY f.name LIMIT 4`,
    [`%${unitWord}%`],
  ) as unknown as { name: string; grams: number }[];
  if (rows.length === 0) {
    return `ماكو عندي أمثلة حقيقية بقاعدة بياناتي لوحدة "${unitWord}" حاليًا — الوزن يختلف حسب الأكلة نفسها. گلي اسم الأكلة المحددة وأحاول أفيدك.`;
  }
  const lines = rows.map((r) => `• ${r.name}: ${unitWord} ≈ ${Math.round(r.grams)}غ`);
  return `الوزن يختلف حسب الأكلة نفسها، بس هذي أمثلة حقيقية من قاعدة بياناتي:\n${lines.join("\n")}`;
}

/** "هذا الأكل يناسب سعراتي؟" — يتحقق هل حتى أصغر كمية حقيقية معروفة تدخل بالباقي من السعرات. */
export async function checkFoodFits(foodId: number, foodName: string, remainingCalories: number): Promise<string> {
  const portions = await getPortionsFor(foodId);
  let smallest: number | null = null;
  for (const p of portions) {
    const grams = p.grams;
    if (!grams) continue;
    const nutrition = await computeFood(foodId, Number(grams));
    if (smallest === null || nutrition.calories < smallest) smallest = nutrition.calories;
  }
  if (smallest === null) {
    return `ماكو عندي معلومة كمية دقيقة عن ${foodName}، گلي الوزن بالغرام وأحسبلك بالضبط إذا يناسب سعراتك.`;
  }
  if (remainingCalories <= 0) {
    return `وصلت لهدفك اليوم فعلاً، فحتى أصغر كمية من ${foodName} (~${smallest} kcal) راح تخليك تتجاوزه.`;
  }
  if (smallest <= remainingCalories) {
    return `أي، ${foodName} يناسب سعراتك المتبقية (~${remainingCalories} سعرة) — حتى أصغر كمية معروفة إلي عنه ~${smallest} kcal.`;
  }
  return `لأ، حتى أصغر كمية معروفة من ${foodName} (~${smallest} kcal) أعلى من الباقي إلك (~${remainingCalories} سعرة).`;
}

interface FoodCategoryRow { category_id: number | null; calories_per_100g: number }
interface LighterAltRow { name: string; calories_per_100g: number }

/** "أريد بديل أخف" — يبحث عن طعام حقيقي بنفس التصنيف بسعرات أقل لكل 100غ، صفر اختراع بديل. */
export async function suggestLighterAlternative(foodId: number, foodName: string): Promise<string> {
  const db = await getFoodDb();
  const current = queryOne(
    db,
    `SELECT f.category_id AS category_id, fn.calories_per_100g AS calories_per_100g
     FROM foods f JOIN food_nutrients fn ON fn.food_id = f.id WHERE f.id = ?`,
    [foodId],
  ) as unknown as FoodCategoryRow | null;
  if (!current || current.category_id === null) {
    return `ماكو عندي تصنيف كافي لـ${foodName} حتى أگترحلك بديل دقيق — گلي شنو تفضّل وأساعدك بشي ثاني.`;
  }
  const rows = queryAll(
    db,
    `SELECT f.name AS name, fn.calories_per_100g AS calories_per_100g
     FROM foods f JOIN food_nutrients fn ON fn.food_id = f.id
     WHERE f.category_id = ? AND f.id <> ? AND fn.calories_per_100g < ?
     ORDER BY fn.calories_per_100g ASC, f.name LIMIT 2`,
    [current.category_id, foodId, current.calories_per_100g],
  ) as unknown as LighterAltRow[];
  if (rows.length === 0) {
    return `ماكو عندي بديل أخف حقيقي لـ${foodName} بنفس التصنيف بقاعدة بياناتي الحالية — بس تگدر تقلل الكمية بدالها وتوصل نفس الهدف.`;
  }
  const lines = rows.map((r) => `• ${r.name} (أخف بحدود ${Math.round(current.calories_per_100g - r.calories_per_100g)} سعرة لكل 100غ)`);
  return `بدائل أخف حقيقية من ${foodName} بنفس التصنيف عندي:\n${lines.join("\n")}`;
}
