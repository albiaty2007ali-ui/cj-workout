/**
 * منفذ حرفي من nutrition_ai/context.py — Context Builder، يبني كائن سياق صغير وفعّال بدل تمرير
 * كل بيانات المستخدم بكل مكان.
 */
import * as calculator from "./calculator.js";
import * as macros from "./macros.js";
import * as iraqTime from "./iraqTime.js";
import * as tournamentMode from "./tournamentMode.js";
import type { Repository, NutritionProfileRecord } from "./db/repository.js";

export interface NutritionContext {
  target_calories: number;
  consumed_calories: number;
  remaining_calories: number;
  consumed_protein: number;
  consumed_carbs: number;
  consumed_fat: number;
  macro_targets: Partial<macros.MacroTargets>;
  water_ml: number;
  water_target_ml: number;
  meals_logged_today: number;
  goal: string;
  period: string;
  over_target: boolean;
  /** أكل قليل جدًا اليوم — يُفحَص فقط ≥21:00 بتوقيت بغداد (طلب صريح: منع إنذار كاذب أي وقت
   * أبكر) وباستهلاك أقل من 40% من الهدف اليومي (نسبة صريحة، مو حد سعرات مطلق). */
  under_target: boolean;
}

export async function build(
  repo: Repository,
  userId: string,
  profile: NutritionProfileRecord | null,
  now: Date = new Date(),
): Promise<NutritionContext> {
  // انتهاء نافذة "عندي بطولة" (لو فعّالة) يُفحَص هنا — نقطة تجميع مركزية واحدة (نفس فلسفة
  // attachUnderEatingNudge) بدل تكرار الفحص بكل Endpoint يقرأ الهدف اليومي. يرجّع البروفايل
  // بعد أي تصحيح فعلي (استرجاع الهدف الأصلي) حتى هذا الاستدعاء نفسه يشوف الرقم الصحيح فورًا.
  profile = profile ? await tournamentMode.checkAndRevertIfExpired(repo, profile, now) : profile;

  const target = profile ? profile.calorie_target : 2000;
  const totals = await calculator.todayTotals(repo, userId, now);
  const remaining = target - totals.calories;
  const waterMl = await calculator.todayWaterMl(repo, userId, now);

  const macroTargets = profile ? macros.calculateTargets(target, profile.weight_kg, profile.goal) : {};

  const period = iraqTime.getCurrentPeriod(now);
  // طلب صريح: ≥21:00 بتوقيت بغداد بالضبط (مو دلو period evening/late_night العام) + أقل من
  // 40% من الهدف اليومي (نسبة صريحة، بديل عن الحد المطلق المستخدَم سابقًا)
  const isLateEnough = iraqTime.nowBaghdad(now).hour >= 21;

  return {
    target_calories: target,
    consumed_calories: totals.calories,
    remaining_calories: remaining,
    consumed_protein: totals.protein,
    consumed_carbs: totals.carbs,
    consumed_fat: totals.fat,
    macro_targets: macroTargets,
    water_ml: waterMl,
    water_target_ml: profile ? profile.water_target_ml : 2000,
    meals_logged_today: totals.logs.length,
    goal: profile ? profile.goal : "maintain",
    period,
    over_target: remaining < 0,
    under_target: isLateEnough && totals.calories < target * 0.4,
  };
}
