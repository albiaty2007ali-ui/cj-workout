/**
 * منفذ حرفي من nutrition_ai/macros.py — Macro Engine. يحسب أهداف البروتين/الكارب/الدهون من
 * نفس مخرجات calculator.ts. صيغ ثابتة معروفة فقط، لا AI يحسب هذي الأرقام.
 */
import { pyRound } from "./pyRound.js";

// غرام بروتين لكل كيلوغرام وزن جسم، حسب الهدف (نطاقات شائعة في تغذية رياضية عامة)
export const PROTEIN_G_PER_KG: Record<string, number> = { lose: 2.0, maintain: 1.6, gain: 1.8 };
export const FAT_PERCENT_OF_CALORIES = 0.25;
export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_CARB = 4;
export const KCAL_PER_G_FAT = 9;

export interface MacroTargets {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function calculateTargets(calorieTarget: number, weightKg: number, goal: string): MacroTargets {
  const proteinG = pyRound((PROTEIN_G_PER_KG[goal] ?? 1.6) * weightKg);
  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;

  const fatKcal = calorieTarget * FAT_PERCENT_OF_CALORIES;
  const fatG = pyRound(fatKcal / KCAL_PER_G_FAT);

  const remainingKcal = Math.max(0, calorieTarget - proteinKcal - fatG * KCAL_PER_G_FAT);
  const carbsG = pyRound(remainingKcal / KCAL_PER_G_CARB);

  return { protein_g: proteinG, carbs_g: carbsG, fat_g: fatG };
}

export function proteinProgressRatio(consumedProtein: number, targetProteinG: number): number {
  if (!targetProteinG) return 1.0;
  return consumedProtein / targetProteinG;
}
