/**
 * GET /api/progress/daily?date=YYYY-MM-DD — يعادل progress_bp.py's /daily. اليوم الحالي
 * افتراضيًا (بتوقيت بغداد)؛ الأيام الماضية للقراءة فقط، بدون ميزانية توزيع (نفس قرار الأصل).
 *
 * POST /api/progress/daily?action=update|delete|add — مدير وجبات اليوم (نفس نمط
 * WeightProgress.tsx's ?action=delete الموجود أصلًا). الثلاثة مقيَّدة لوجبات اليوم الحالي فقط
 * (orchestrator.ts's findTodayMealLogForUser الداخلية).
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, isEmailVerified, checkBanStatus } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import * as calculator from "../../shared/nutrition-engine/calculator.js";
import * as mealBudget from "../../shared/nutrition-engine/mealBudget.js";
import { nowBaghdad, todayBaghdadIso } from "../../shared/nutrition-engine/iraqTime.js";
import { getSettings } from "../../shared/nutrition-engine/notifications/engine.js";
import { currentPeriodForUser, type SleepSchedule } from "../../shared/nutrition-engine/mealTimingEngine.js";
import { logMealManually, logManualCalorieEntry, updateMealLogTotals, deleteMealLogById } from "../../shared/nutrition-engine/orchestrator.js";

async function handlePost(req: Request, claims: { sub: string }): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const repo = new FirestoreRepository();
  const user = await repo.findUser(claims.sub);
  if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "جسم الطلب غير صالح.");
  }

  if (action === "delete") {
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");
    const result = await deleteMealLogById(repo, user, id);
    if (!result.ok) return jsonError(404, "NOT_FOUND", "الوجبة غير موجودة أو خارج نطاق اليوم.");
    return jsonOk({ deleted: true });
  }

  if (action === "update") {
    const id = typeof body.id === "string" ? body.id : "";
    const nums = ["total_calories", "total_protein", "total_carbs", "total_fat"] as const;
    if (!id || nums.some((k) => typeof body[k] !== "number" || (body[k] as number) < 0)) {
      return jsonError(400, "VALIDATION_ERROR", "أرقام غير صالحة.");
    }
    const patch = Object.fromEntries(nums.map((k) => [k, body[k] as number])) as Record<(typeof nums)[number], number>;
    const result = await updateMealLogTotals(repo, user, id, patch);
    if (!result.ok) return jsonError(404, "NOT_FOUND", "الوجبة غير موجودة أو خارج نطاق اليوم.");
    return jsonOk({ updated: true });
  }

  if (action === "add") {
    const mealType = typeof body.meal_type === "string" ? body.meal_type : "";
    if (!["breakfast", "lunch", "dinner", "snack"].includes(mealType)) {
      return jsonError(400, "VALIDATION_ERROR", "بيانات الوجبة غير صالحة.");
    }
    const foodName = typeof body.food_name === "string" ? body.food_name : "";
    const foodId = typeof body.food_id === "number" ? body.food_id : NaN;

    let result;
    if (foodId) {
      // مسار بحث حقيقي بقاعدة الأطعمة (الموجود أصلاً) — food_id+grams
      const grams = typeof body.grams === "number" ? body.grams : NaN;
      if (!foodName || !(grams > 0)) return jsonError(400, "VALIDATION_ERROR", "بيانات الوجبة غير صالحة.");
      result = await logMealManually(repo, user, mealType, foodId, foodName, grams);
    } else {
      // مسار سعرات حرة (جديد) — طعام غير موجود بقاعدة foods.sqlite، اسم+سعرات يُبلّغ عنهم
      // المستخدم مباشرة (راجع توثيق logManualCalorieEntry)
      const calories = typeof body.calories === "number" ? body.calories : NaN;
      const protein = typeof body.protein === "number" ? body.protein : 0;
      const carbs = typeof body.carbs === "number" ? body.carbs : 0;
      const fat = typeof body.fat === "number" ? body.fat : 0;
      if (!foodName || !(calories > 0) || protein < 0 || carbs < 0 || fat < 0) {
        return jsonError(400, "VALIDATION_ERROR", "بيانات الوجبة غير صالحة.");
      }
      result = await logManualCalorieEntry(repo, user, mealType, foodName, calories, protein, carbs, fat);
    }

    if ((result as { premium_required?: boolean }).premium_required) {
      return jsonError(402, "TRIAL_EXHAUSTED", "خلصت وجباتك المجانية. تحتاج اشتراك لتكملة التسجيل.");
    }
    return jsonOk(result);
  }

  return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  if (req.method === "POST") {
    // طلب أمني صريح: صفر تسجيل وجبات (إضافة/تعديل/حذف) قبل تأكيد البريد — القراءة (GET) تبقى
    // متاحة، هذا خاص فقط بالتحوّرات (نفس نطاق طلب المستخدم: "تسجيل الوجبات")
    if (!isEmailVerified(claims)) {
      return jsonError(403, "EMAIL_NOT_VERIFIED", "أكّد بريدك الإلكتروني أول حتى تگدر تسجّل وجبات.");
    }
    const banStatus = await checkBanStatus(getFirestore(getFirebaseApp()), claims.sub);
    if (banStatus.banned) {
      return jsonError(403, "ACCOUNT_BANNED", "هذا الحساب محظور.", {
        reason: banStatus.reason ?? "", expires_at: banStatus.expires_at ?? "", permanent: String(banStatus.permanent),
      });
    }
    try {
      return await handlePost(req, claims);
    } catch (err) {
      console.error("progress-daily POST error:", err);
      return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
    }
  }

  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST فقط.");

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

  try {
    const repo = new FirestoreRepository();
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
      // جدول نوم حقيقي (لو مضبوط بالإعدادات، المرحلة 4) يُستخدَم لحساب الفترة الحالية بدل فترات
      // بغداد الثابتة — mealBudget.ts نفسه ما تغيّر، فقط الفترة المُمرَّرة له.
      const notifSettings = await getSettings(getFirestore(getFirebaseApp()), claims.sub);
      const sleepSchedule: SleepSchedule | null = notifSettings.wake_time && notifSettings.sleep_time
        ? { wake_time: notifSettings.wake_time, sleep_time: notifSettings.sleep_time } : null;
      budgets = mealBudget.distributeRemainingBudget(remainingCalories, unlogged, currentPeriodForUser(now, sleepSchedule));
    }

    // الماي متوفر فقط لـ"اليوم الحالي" (todayWaterMl يعتمد على "الآن" الفعلي، نفس قيد
    // mealBudget أعلاه) — أيام ماضية تبقى بلا رقم ماي، صادق بدل تخمين.
    const waterMl = isToday ? await calculator.todayWaterMl(repo, claims.sub, now) : undefined;

    return jsonOk({
      is_today: isToday, target_date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      target_calories: targetCalories, remaining_calories: remainingCalories, over_target: overTarget,
      meals, budgets, water_ml: waterMl,
    });
  } catch (err) {
    console.error("progress-daily error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
