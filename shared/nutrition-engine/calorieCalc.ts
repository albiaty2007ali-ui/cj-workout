/**
 * منفذ حرفي من calorie_calc.py — حساب BMR وTDEE بمعادلة Mifflin-St Jeor. حدود السلامة مصدرها
 * safety.ts حصرًا — هذا الملف لا يقرر أي رقم حرج بنفسه.
 */
import * as safety from "./safety.js";
import { pyRound } from "./pyRound.js";

export const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very_active: 1.725,
};

export const ACTIVITY_LABELS: Record<string, string> = {
  sedentary: "خامل — بدون تمرين",
  light: "نشاط خفيف — 1-3 أيام بالأسبوع",
  moderate: "نشاط متوسط — 4-5 أيام بالأسبوع",
  very_active: "نشاط عالي جدًا — 6-7 أيام بالأسبوع",
};

export interface CalorieCalcResult {
  bmr: number;
  tdee: number;
  calorie_target: number;
  water_target_ml: number;
  safety_warning: string | null;
}

export function calculate(
  age: number, weightKg: number, heightCm: number, sex: string,
  goal: string, activityLevel: string,
): CalorieCalcResult {
  const bmr = sex === "male"
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;

  const factor = ACTIVITY_FACTORS[activityLevel] ?? 1.2;
  const tdee = bmr * factor;

  let target: number;
  if (goal === "lose") target = tdee - 500;
  else if (goal === "gain") target = tdee + 400;
  else target = tdee;

  const { target: safeTarget, warning: safetyWarning } = safety.enforceSafeTarget(target, tdee, sex, goal);

  const waterTargetMl = pyRound(weightKg * 33); // تقدير شائع ومعقول، قابل للتعديل لاحقًا

  return {
    bmr: pyRound(bmr),
    tdee: pyRound(tdee),
    calorie_target: safeTarget,
    water_target_ml: waterTargetMl,
    safety_warning: safetyWarning,
  };
}
