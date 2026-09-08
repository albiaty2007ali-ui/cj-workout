/**
 * GET /api/progress/daily?date=YYYY-MM-DD — يعادل progress_bp.py's /daily. اليوم الحالي
 * افتراضيًا (بتوقيت بغداد)؛ الأيام الماضية للقراءة فقط، بدون ميزانية توزيع (نفس قرار الأصل).
 */
import type { Context, Config } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import * as calculator from "../../shared/nutrition-engine/calculator.js";
import * as mealBudget from "../../shared/nutrition-engine/mealBudget.js";
import { getCurrentPeriod, nowBaghdad, todayBaghdadIso } from "../../shared/nutrition-engine/iraqTime.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const now = new Date();
  const todayIso = todayBaghdadIso(now);
  const isToday = !dateParam || dateParam === todayIso;

  let year: number, month: number, day: number;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    [year, month, day] = dateParam.split("-").map(Number);
  } else {
    ({ year, month, day } = nowBaghdad(now));
  }

  const repo = new FirestoreRepository();
  try {
    const profile = await repo.findNutritionProfile(claims.sub);
    if (!profile) {
      return jsonOk({ profile: null });
    }

    const meals = await calculator.mealsByTypeForDay(repo, claims.sub, year, month, day);
    const targetCalories = profile.calorie_target;

    let dayTotalCalories = 0;
    for (const m of ["breakfast", "lunch", "dinner"] as const) {
      const bucket = meals[m];
      if (bucket.status === "LOGGED") dayTotalCalories += bucket.calories;
    }
    for (const s of meals.snack) {
      if (s.status === "LOGGED") dayTotalCalories += s.calories;
    }

    const remainingCalories = targetCalories - dayTotalCalories;
    const overTarget = remainingCalories < 0;

    let budgets: Record<string, number> = {};
    if (isToday && !overTarget) {
      const unlogged = (["breakfast", "lunch", "dinner"] as const).filter((m) => meals[m].status === "NOT_STARTED");
      budgets = mealBudget.distributeRemainingBudget(remainingCalories, unlogged, getCurrentPeriod(now));
    }

    return jsonOk({
      is_today: isToday, target_date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      target_calories: targetCalories, remaining_calories: remainingCalories, over_target: overTarget,
      meals, budgets,
    });
  } catch (err) {
    console.error("progress-daily error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};

export const config: Config = { path: "/.netlify/functions/progress-daily" };
