/**
 * منفذ حرفي من nutrition_ai/weight_ops.py — نقطة الحقيقة الوحيدة لتحديث وزن المستخدم: يعيد حساب
 * bmr/tdee/calorie_target عبر calorieCalc.ts الحقيقي، ويحفظ سجل WeightHistory (لا يُستبدل
 * القياس السابق أبدًا). يُستدعى من orchestrator.ts (تحديث عبر الشات) ومن مسار صفحة متابعة
 * الوزن — صفر تكرار منطق، نفس النتيجة بالضبط من أي مسار.
 */
import type { Repository } from "./db/repository.js";
import { calculate, type CalorieCalcResult } from "./calorieCalc.js";

/**
 * يرجّع نتيجة calorieCalc.calculate() (bmr/tdee/calorie_target/water_target_ml/safety_warning)،
 * أو null لو ماكو NutritionProfile بعد (المستخدم ما أكمل Onboarding).
 */
export async function applyWeightUpdate(
  repo: Repository,
  userId: string,
  newWeightKg: number,
): Promise<CalorieCalcResult | null> {
  const profile = await repo.findNutritionProfile(userId);
  if (!profile) return null;

  const result = calculate(profile.age, newWeightKg, profile.height_cm, profile.sex, profile.goal, profile.activity_level);

  await repo.updateNutritionProfile(userId, {
    weight_kg: newWeightKg,
    bmr: result.bmr,
    tdee: result.tdee,
    calorie_target: result.calorie_target,
    water_target_ml: result.water_target_ml,
  });

  await repo.insertWeightHistory({
    user_id: userId, weight_kg: newWeightKg,
    bmr: result.bmr, tdee: result.tdee, calorie_target: result.calorie_target,
  });

  return result;
}
