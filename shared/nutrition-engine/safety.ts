/**
 * منفذ حرفي من nutrition_ai/safety.py — Nutrition Safety Engine. كل رقم "حرج" (حد أدنى آمن
 * للسعرات، تحديد عجز غير مناسب) Constant صريح، وليس تخمين أي طبقة ذكاء اصطناعي.
 */
import { pyRound } from "./pyRound.js";

export const MIN_SAFE_CALORIES: Record<string, number> = { male: 1200, female: 1000 };

export const MAX_SAFE_DEFICIT_KCAL = 750;
export const MAX_SAFE_SURPLUS_KCAL = 700;

export const SAFETY_WARNING_FLOOR =
  "هدف السعرات المحسوب كان منخفض جدًا حسب بياناتك، فرفعناه للحد الآمن الأدنى. " +
  "إذا تحتاج نزول أسرع، استشر مختص تغذية بدل تقليل السعرات بشكل كبير.";
export const SAFETY_WARNING_DEFICIT_TOO_HIGH =
  "الفرق بين هدفك وسعراتك اليومية كبير أكثر من اللازم لعجز آمن. عدّلناه لحد أكثر استدامة. " +
  "عجز سريع جدًا يأثر على طاقتك وعضلك على المدى المتوسط.";

export interface SafeTargetResult {
  target: number;
  warning: string | null;
}

/** يرجع (target_آمن, تحذير_أو_null). لا يسمح بتجاوز حدود السلامة مهما كان اختيار المستخدم. */
export function enforceSafeTarget(target: number, tdee: number, sex: string, goal: string): SafeTargetResult {
  const floor = MIN_SAFE_CALORIES[sex] ?? 1200;
  let warning: string | null = null;
  let t = target;

  if (t < floor) {
    t = floor;
    warning = SAFETY_WARNING_FLOOR;
  } else if (goal === "lose" && tdee - t > MAX_SAFE_DEFICIT_KCAL) {
    t = tdee - MAX_SAFE_DEFICIT_KCAL;
    warning = SAFETY_WARNING_DEFICIT_TOO_HIGH;
  } else if (goal === "gain" && t - tdee > MAX_SAFE_SURPLUS_KCAL) {
    t = tdee + MAX_SAFE_SURPLUS_KCAL;
  }

  return { target: pyRound(t), warning };
}

/** يمنع اقتراح وجبة تدفع اليوم لعجز غير آمن حتى لو تقنيًا "ضمن الباقي". */
export function isRecommendationCalorieSafe(candidateKcal: number, remainingKcal: number): boolean {
  return candidateKcal <= Math.max(remainingKcal, 0) || remainingKcal > -MAX_SAFE_DEFICIT_KCAL;
}
