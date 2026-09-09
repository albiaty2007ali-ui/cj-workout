/**
 * Behavior Aggregator — الطبقة الأولى من Captain CJ Intelligence. تُستدعى Event-driven بعد أي
 * تسجيل وجبة/ماء حقيقي (orchestrator.ts)، تكتب لقطة سلوك يومية واحدة (`behavior_daily`) من
 * بيانات meal_logs/water_logs الحقيقية لنفس اليوم فقط — صفر فحص لتاريخ كامل بكل استدعاء.
 *
 * منفصلة تمامًا عن context.ts عمدًا: context.build() لقطة لحظية تُستدعى بالمسار الساخن (كل
 * رسالة شات)، بينما هذي الطبقة تراكمية عبر الأيام (أساس Personal Score لاحقًا وAnomaly
 * Detection مستقبلًا) — دمجها بـcontext.ts كان يبطّئ المسار الساخن بدون داعٍ.
 */
import type { Repository, NutritionProfileRecord, BehaviorDailyRecord } from "./db/repository.js";
import * as calculator from "./calculator.js";
import * as macros from "./macros.js";
import * as iraqTime from "./iraqTime.js";

export type { BehaviorDailyRecord };

/** يعيد حساب لقطة اليوم بالكامل من البيانات الحقيقية ويكتبها — Idempotent (نفس النتيجة بأي عدد استدعاءات نفس اليوم). */
export async function recordDailyBehavior(
  repo: Repository, userId: string, profile: NutritionProfileRecord | null, now: Date = new Date(),
): Promise<void> {
  const today = iraqTime.todayBaghdadIso(now);
  const totals = await calculator.todayTotals(repo, userId, now);
  const waterMl = await calculator.todayWaterMl(repo, userId, now);

  const proteinTarget = profile
    ? macros.calculateTargets(profile.calorie_target, profile.weight_kg, profile.goal).protein_g
    : null;
  const loggedBeforeNoon = totals.logs.some((l) => iraqTime.nowBaghdad(l.created_at).hour < 12);

  await repo.upsertBehaviorDaily({
    user_id: userId,
    date: today,
    meals_logged: totals.logs.length,
    protein_hit_target: proteinTarget !== null && totals.protein >= proteinTarget,
    water_hit_target: profile !== null && waterMl >= profile.water_target_ml,
    logged_before_noon: loggedBeforeNoon,
  });
}

/** آخر N يوم من اللقطات الحقيقية (مرتبة تصاعديًا بالتاريخ) — قد ترجّع أقل من N لو المستخدم جديد. */
export async function recentBehavior(
  repo: Repository, userId: string, days: number, now: Date = new Date(),
): Promise<BehaviorDailyRecord[]> {
  const today = iraqTime.todayBaghdadIso(now);
  const start = iraqTime.addDaysIso(today, -(days - 1));
  return repo.findBehaviorDailyInRange(userId, start, today);
}
