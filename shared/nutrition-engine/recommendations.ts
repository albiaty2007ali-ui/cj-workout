/**
 * منفذ حرفي من nutrition_ai/recommendations.py — يبحث بقاعدة الأكل المحلية (foods.sqlite) حسب
 * السعرات المتبقية/الهدف/البروتين الناقص، ولا يخترع أي وجبة أبدًا.
 */
import { getFoodDb, queryAll } from "./db/foodDb.js";
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
 * يقترح كمية حقيقية من طعام محدد بالاسم (مثلاً "شكد آكل من الدولمة؟") — يعتمد فقط على
 * getPortionsFor/computeFood الحقيقيين، صفر اختراع أرقام. يختار أكبر Portion معروف يبقى ضمن
 * الباقي من السعرات، أو يوضح صراحة لو حتى أصغر كمية معروفة أعلى من الباقي.
 */
export async function suggestPortionForFood(foodId: number, foodName: string, remainingCalories: number): Promise<string> {
  const portions = await getPortionsFor(foodId);
  const scored: { portion_name: string; calories: number }[] = [];
  for (const p of portions) {
    const grams = p.grams;
    if (!grams) continue;
    const nutrition = await computeFood(foodId, Number(grams));
    scored.push({ portion_name: (p.portion_name as string) || "حصة", calories: nutrition.calories });
  }

  if (scored.length === 0) {
    return `ماكو عندي معلومة كمية دقيقة عن ${foodName} بقاعدة البيانات الحالية، بس گلي الوزن بالغرام وأحسبلك السعرات بالضبط.`;
  }

  scored.sort((a, b) => a.calories - b.calories);
  const fitting = scored.filter((s) => remainingCalories <= 0 || s.calories <= remainingCalories);

  if (fitting.length > 0) {
    const choice = fitting[fitting.length - 1];
    return (
      `إذا مشتهي ${foodName}، نكدر نخليها بكمية مناسبة لسعراتك 🌱\n` +
      `أقترح تقريبًا ${choice.portion_name} — ~${choice.calories} kcal.`
    );
  }

  const choice = scored[0];
  return (
    `حتى أصغر كمية معروفة من ${foodName} (${choice.portion_name}, ~${choice.calories} kcal) ` +
    `أعلى شوي من سعراتك المتبقية (~${remainingCalories}) — القرار إلك طبعًا، ` +
    "بس خل الوجبة الجاية أخف حتى توازن يومك."
  );
}
