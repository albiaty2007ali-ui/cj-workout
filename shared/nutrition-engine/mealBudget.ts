/**
 * منفذ حرفي من nutrition_ai/meal_budget.py — يوزّع السعرات المتبقية على الوجبات غير المسجّلة
 * فقط (الوجبات المسجّلة لا تتغيّر أبدًا). الأوزان مبنية على الوقت الحالي ببغداد فقط — بدون
 * افتراض بيانات نشاط/جدول تدريب غير موجودة أصلاً.
 *
 * سبب وجوده هنا (خلافًا للأصل اللي كان "عرض معلوماتي بصفحة يومي الغذائي فقط"): اكتُشف بتحقق حي
 * حقيقي (Browser) إن suggestPortionCountForRemaining كانت تستخدم *كل* الباقي اليومي لوجبة
 * واحدة مخطَّطة ("اليوم غدانا تمن" -> 111 خاشوقة!) — رقم غير منطقي لوجبة وحدة. الحل الصحيح توزيع
 * نفس هذا المنطق المُثبَت أصلاً، مو اختراع حل جديد.
 */
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const BASE_WEIGHTS: Record<MealType, number> = { breakfast: 1.0, lunch: 1.0, dinner: 1.0, snack: 0.6 };

const PERIOD_BOOST: Record<string, Record<MealType, number>> = {
  morning: { breakfast: 1.4, lunch: 1.0, dinner: 0.8, snack: 0.7 },
  noon: { breakfast: 0.5, lunch: 1.4, dinner: 1.0, snack: 0.8 },
  evening: { breakfast: 0.3, lunch: 0.8, dinner: 1.4, snack: 0.9 },
  late_night: { breakfast: 0.3, lunch: 0.5, dinner: 1.0, snack: 1.2 },
};

/**
 * unloggedMealTypes: الوجبات غير المسجَّلة اليوم فقط — يرجّع {meal_type: budget_kcal}، مجموعها
 * = remainingCalories بالضبط (الباقي من التقريب يذهب لآخر عنصر، صفر فقدان/زيادة كيلوكالوري).
 */
export function distributeRemainingBudget(
  remainingCalories: number, unloggedMealTypes: MealType[], currentPeriod: string,
): Record<string, number> {
  if (unloggedMealTypes.length === 0 || remainingCalories <= 0) {
    return Object.fromEntries(unloggedMealTypes.map((m) => [m, 0]));
  }

  const boosts = PERIOD_BOOST[currentPeriod] ?? BASE_WEIGHTS;
  const weights = Object.fromEntries(unloggedMealTypes.map((m) => [m, BASE_WEIGHTS[m] * (boosts[m] ?? 1.0)]));
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1.0;

  const budgets: Record<string, number> = {};
  let runningTotal = 0;
  for (let i = 0; i < unloggedMealTypes.length - 1; i++) {
    const m = unloggedMealTypes[i];
    const share = Math.round(remainingCalories * (weights[m] / totalWeight));
    budgets[m] = share;
    runningTotal += share;
  }
  const last = unloggedMealTypes[unloggedMealTypes.length - 1];
  budgets[last] = remainingCalories - runningTotal;
  return budgets;
}
