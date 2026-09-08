/**
 * منفذ حرفي من nutrition_ai/meal_budget.py — يوزّع السعرات المتبقية على الوجبات غير المسجّلة
 * بعد فقط (الوجبات المسجّلة لا تُغيَّر أبدًا). عرض معلوماتي بصفحة "يومي الغذائي" فقط.
 */
import { pyRound } from "./pyRound.js";

const BASE_WEIGHTS: Record<string, number> = { breakfast: 1.0, lunch: 1.0, dinner: 1.0, snack: 0.6 };

const PERIOD_BOOST: Record<string, Record<string, number>> = {
  morning: { breakfast: 1.4, lunch: 1.0, dinner: 0.8, snack: 0.7 },
  noon: { breakfast: 0.5, lunch: 1.4, dinner: 1.0, snack: 0.8 },
  evening: { breakfast: 0.3, lunch: 0.8, dinner: 1.4, snack: 0.9 },
  late_night: { breakfast: 0.3, lunch: 0.5, dinner: 1.0, snack: 1.2 },
};

/**
 * unlockedMealTypes: قائمة من "breakfast"|"lunch"|"dinner"|"snack" — الوجبات المسجّلة فعلاً لا
 * تُمرَّر هنا أصلًا. يرجّع {meal_type: budget_kcal}، مجموعها = remainingCalories بالضبط (تقريب
 * مضبوط على آخر عنصر لتفادي فقدان/زيادة كيلوكالوري بسبب التقريب).
 */
export function distributeRemainingBudget(
  remainingCalories: number,
  unloggedMealTypes: string[],
  currentPeriod: string,
): Record<string, number> {
  if (unloggedMealTypes.length === 0 || remainingCalories <= 0) {
    return Object.fromEntries(unloggedMealTypes.map((m) => [m, 0]));
  }

  const boosts = PERIOD_BOOST[currentPeriod] ?? BASE_WEIGHTS;
  const weights: Record<string, number> = {};
  for (const m of unloggedMealTypes) {
    weights[m] = (BASE_WEIGHTS[m] ?? 1.0) * (boosts[m] ?? 1.0);
  }
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1.0;

  const budgets: Record<string, number> = {};
  let runningTotal = 0;
  for (let i = 0; i < unloggedMealTypes.length - 1; i++) {
    const m = unloggedMealTypes[i];
    const share = pyRound(remainingCalories * (weights[m] / totalWeight));
    budgets[m] = share;
    runningTotal += share;
  }
  const last = unloggedMealTypes[unloggedMealTypes.length - 1];
  budgets[last] = remainingCalories - runningTotal; // الباقي يذهب لآخر عنصر، صفر فقدان تقريب

  return budgets;
}
