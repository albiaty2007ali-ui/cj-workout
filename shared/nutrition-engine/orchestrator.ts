/**
 * بعد إزالة محرك الشات المحلي القديم (كشف نية/dispatch/Gemini tool-calling — الشات صار محادثة
 * Gemini مباشرة عبر shared/nutrition-engine/geminiChat.ts + netlify/functions/chat.mts الجديد)،
 * هذا الملف عاد يحتوي فقط الدوال المشتركة اللي تستخدمها ميزات غير-شات حقيقية:
 * - finalizeMeal (نقطة الحقيقة الوحيدة لإنشاء MealLog) + logMealManually/logManualCalorieEntry
 *   (زر "+ إضافة وجبة يدويًا" بـDaily.tsx، عبر progress-daily.mts) + updateMealLogTotals/
 *   deleteMealLogById (إدارة وجبات اليوم اليدوية، نفس الصفحة).
 * - handleWaterLog/runWaterLoggingPipeline (زر "✅ شربت كوب" بإشعار الماي، water-quick-log.mts).
 * - markRecipeAwaitingConfirmation (إكمال تحضير وصفة، recipes-actions.mts).
 * صفر اتصال شبكة هنا، صفر رقم سعرات يُخترع — كل شيء يمر من foodSearch.ts/foods.sqlite عبر
 * calculator.ts، بالضبط متل قبل — هذا التوثيق لم يتغيّر، فقط طبقة كشف-النية القديمة حُذفت.
 */
import * as behaviorAggregator from "./behaviorAggregator.js";
import * as calculator from "./calculator.js";
import * as context from "./context.js";
import * as directLog from "./directLog.js";
import * as patternDetection from "./patternDetection.js";
import { parseWaterMl } from "./quantity.js";
import * as responses from "./responses.js";
import * as streaks from "./streaks.js";
import * as tipsEngine from "./tipsEngine.js";
import * as xpEngine from "./xpEngine.js";
import { nowBaghdad, todayBaghdadIso } from "./iraqTime.js";
import { FREE_MEALS_CAP } from "./userStatus.js";
import type { Repository, UserRecord } from "./db/repository.js";
import type { PendingMeal } from "./mealTypes.js";

async function markMealLogged(repo: Repository, user: UserRecord, mealType: string, now: Date): Promise<void> {
  if (mealType !== "breakfast" && mealType !== "lunch" && mealType !== "dinner") return;
  await repo.upsertMealStatus(user.id, todayBaghdadIso(now), mealType, "logged");
}

export function compensationMessage(remaining: number, target: number): string {
  if (remaining >= 0 || !target) return "";
  const ratioOver = -remaining / target;
  return responses.compensationNote(ratioOver <= 0.1);
}

function addResolvedToPending(pending: PendingMeal, hit: { food_id: number; food_name: string; grams?: number; quantity?: number; unit_grams?: number; portion_name?: string }, nutrition: { calories: number; protein: number; carbs: number; fat: number }): void {
  pending.items.push({
    food_id: hit.food_id, food_name: hit.food_name, grams: hit.grams ?? 0,
    calories: nutrition.calories, protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat,
    quantity: hit.quantity, unit_grams: hit.unit_grams, portion_name: hit.portion_name,
  });
}

export interface DispatchResult {
  reply: string | null;
  meal_logged: boolean;
  [key: string]: unknown;
}

function newPending(mealType: string, rawText: string): PendingMeal {
  return { meal_type: mealType, raw_text: rawText, items: [], pending_clarifications: [] };
}

/**
 * نقطة الحقيقة الوحيدة لإنشاء MealLog — source="direct" فقط الآن (الشات القديم كان يستخدم
 * أيضًا "confirmed"/"recipe" لمسارات كشف-النية المحذوفة؛ الاستدعاءات الباقية — الإضافة اليدوية
 * بـDaily.tsx — دائمًا "direct").
 */
async function finalizeMeal(
  repo: Repository, user: UserRecord, pending: PendingMeal, target: number,
  source: "direct", now: Date,
): Promise<DispatchResult> {
  const wasFreeMeal = !user.is_premium;
  if (wasFreeMeal) {
    const ok = await repo.incrementFreeMealsUsedIfBelowCap(user.id, FREE_MEALS_CAP);
    if (!ok) {
      return { reply: null, meal_logged: false, premium_required: true };
    }
    user.free_meals_used += 1;
  }

  const totals = calculator.totalsForItems(pending.items);
  const today = todayBaghdadIso(now);
  const statusRow = await repo.findMealStatus(user.id, today, pending.meal_type);
  const mealStatusBefore = statusRow ? statusRow.status : null;

  const log = await repo.insertMealLog({
    user_id: user.id, meal_type: pending.meal_type, raw_text: pending.raw_text,
    matched_foods_json: JSON.stringify(pending.items.map((i) => i.food_name)),
    total_calories: totals.calories, total_protein: totals.protein,
    total_carbs: totals.carbs, total_fat: totals.fat, is_free_meal: wasFreeMeal,
  });

  const xpAwarded = 10;
  await xpEngine.awardXp(repo, user, xpAwarded, "meal_logged", log.id);
  const streakSnapshot = await streaks.recordActiveDay(repo, user, now);

  await markMealLogged(repo, user, pending.meal_type, now);

  const dayTotals = await calculator.todayTotals(repo, user.id, now);
  const remaining = target - dayTotals.calories;
  const overTarget = remaining < 0;

  const profile = await repo.findNutritionProfile(user.id);
  await behaviorAggregator.recordDailyBehavior(repo, user.id, profile, now);
  const ctx = await context.build(repo, user.id, profile, now);
  const tipCategory = tipsEngine.chooseCategoryForContext(ctx, pending.meal_type);
  const tipText = await tipsEngine.pickTip(repo, user.id, tipCategory);

  let reply =
    `${responses.mealLogged(pending.meal_type)} ${responses.itemsInline(pending.items)}\n\n` +
    `🔥 تقريباً ${totals.calories} سعرة\n` +
    `باقيلك: ${Math.max(0, remaining)} سعرة اليوم 💪`;

  if ((user.ai_response_style ?? "balanced") !== "concise") {
    if (overTarget) {
      reply += compensationMessage(remaining, target);
    } else if (tipText) {
      reply += `\n\n🌱 ${tipText}`;
    }
  }
  for (const milestone of streakSnapshot.new_milestones) {
    reply += `\n\n🔥 ${milestone.label}! +${milestone.xp_reward} XP`;
  }

  if ((user.ai_response_style ?? "balanced") !== "concise") {
    const insightMessage = await patternDetection.pickUnseenBaselineInsight(repo, user.id, now);
    if (insightMessage) reply += `\n\n👀 ${insightMessage}`;
  }

  const snapshot = directLog.buildMealSnapshot(
    log.id, pending.meal_type, pending.raw_text, pending.items,
    xpAwarded, wasFreeMeal, streakSnapshot, mealStatusBefore, now,
  );
  await directLog.save(repo, user, snapshot);
  reply += `\n\n${responses.directLogUndoHint()}`;

  await repo.saveUser(user);

  return {
    reply, meal_logged: true, today_calories: dayTotals.calories,
    target_calories: target, remaining, xp: user.xp, free_meals_used: user.free_meals_used,
    new_milestones: streakSnapshot.new_milestones,
    meal_calories: totals.calories, meal_protein: totals.protein, meal_carbs: totals.carbs, meal_fat: totals.fat,
  };
}

/**
 * إضافة وجبة يدويًا من واجهة "مدير وجبات اليوم" (بعد بحث المستخدم باسم طعام حقيقي واختيار
 * غرام) — صفر منطق XP/عداد مجاني/ستريك مكرر: finalizeMeal أعلاه تتكفّل بكل شي (بما فيها نافذة
 * تراجع 5 دقائق).
 */
export async function logMealManually(
  repo: Repository, user: UserRecord, mealType: string,
  foodId: number, foodName: string, grams: number, now: Date = new Date(),
): Promise<DispatchResult> {
  const tempPending = newPending(mealType, `[إضافة يدوية] ${foodName}`);
  const n = await calculator.computeFood(foodId, grams);
  addResolvedToPending(tempPending, { food_id: foodId, food_name: foodName, grams }, n);
  const profile = await repo.findNutritionProfile(user.id);
  const target = profile ? profile.calorie_target : 2000;
  return finalizeMeal(repo, user, tempPending, target, "direct", now);
}

/**
 * إضافة "سعرات يدوية حرة" من واجهة "مدير وجبات اليوم" — لطعام غير موجود بقاعدة foods.sqlite.
 * استثناء موثَّق لقاعدة "الأرقام من قاعدة البيانات فقط": هذي أرقام يُبلّغ عنها المستخدم بنفسه.
 * food_id=-1 (Sentinel) — عنصر مؤقّت يُستهلَك داخل finalizeMeal بهذا الاستدعاء فقط.
 */
export async function logManualCalorieEntry(
  repo: Repository, user: UserRecord, mealType: string, foodName: string,
  calories: number, protein = 0, carbs = 0, fat = 0, now: Date = new Date(),
): Promise<DispatchResult> {
  const tempPending = newPending(mealType, `[إضافة يدوية] ${foodName}`);
  tempPending.items.push({ food_id: -1, food_name: foodName, grams: 0, calories, protein, carbs, fat });
  const profile = await repo.findNutritionProfile(user.id);
  const target = profile ? profile.calorie_target : 2000;
  return finalizeMeal(repo, user, tempPending, target, "direct", now);
}

/** يتحقق إن سجل وجبة معيّن يخص المستخدم ويقع ضمن نطاق يوم بغداد الحالي — حارس مشترك لـ
 * updateMealLogTotals/deleteMealLogById (كلاهما مسموح بهما لوجبات "اليوم" فقط). */
async function findTodayMealLogForUser(repo: Repository, user: UserRecord, mealLogId: string, now: Date) {
  const log = await repo.findMealLog(mealLogId);
  if (!log || log.user_id !== user.id) return null;
  const { year, month, day } = nowBaghdad(now);
  const [start, end] = calculator.dayUtcRange(year, month, day);
  if (log.created_at < start || log.created_at >= end) return null;
  return log;
}

export interface MealLogPatch {
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

/**
 * تعديل يدوي لأرقام وجبة مسجَّلة اليوم (سعرات/بروتين/كارب/دهون فقط). لا يؤثر على XP (ثابتة 10
 * لكل وجبة) ولا الستريك — فقط الأرقام + behavior_daily snapshot.
 */
export async function updateMealLogTotals(
  repo: Repository, user: UserRecord, mealLogId: string, patch: MealLogPatch, now: Date = new Date(),
): Promise<{ ok: boolean; error?: "NOT_FOUND" }> {
  const log = await findTodayMealLogForUser(repo, user, mealLogId, now);
  if (!log) return { ok: false, error: "NOT_FOUND" };
  await repo.updateMealLog(mealLogId, patch);
  const profile = await repo.findNutritionProfile(user.id);
  await behaviorAggregator.recordDailyBehavior(repo, user.id, profile, now);
  return { ok: true };
}

/**
 * حذف وجبة مسجَّلة اليوم (أي وجبة، مو بس الأخيرة). **قيد موثَّق عمدًا**: لا يلمس الستريك/
 * ActiveDay/محطات الستريك إطلاقًا (راجع القرار الموثَّق بالخطة الأصلية).
 */
export async function deleteMealLogById(
  repo: Repository, user: UserRecord, mealLogId: string, now: Date = new Date(),
): Promise<{ ok: boolean; error?: "NOT_FOUND" }> {
  const log = await findTodayMealLogForUser(repo, user, mealLogId, now);
  if (!log) return { ok: false, error: "NOT_FOUND" };

  await repo.deleteMealLog(mealLogId);

  if (log.is_free_meal && user.free_meals_used > 0) {
    user.free_meals_used -= 1;
  }
  const xpTxs = await repo.listXpTransactionsByReason(user.id, "meal_logged");
  const originalXp = xpTxs.find((t) => t.source === mealLogId)?.amount ?? 0;
  await xpEngine.reverseXp(repo, user, originalXp, "meal_logged", mealLogId);
  await repo.saveUser(user);

  const profile = await repo.findNutritionProfile(user.id);
  await behaviorAggregator.recordDailyBehavior(repo, user.id, profile, now);
  return { ok: true };
}

/** وصفة خلص طبخها — ما تُحتسب سعراتها لين المستخدم يجاوب صراحة "أكلتها" (تفعيل هذا المسار صار
 * فقط عبر صفحة /recipes's وضع الطبخ الآن — تأكيد "أكلتها" الشاتي القديم حُذف مع الشات). */
export async function markRecipeAwaitingConfirmation(repo: Repository, user: UserRecord, recipeId: string): Promise<string> {
  user.current_recipe_id = null;
  user.current_recipe_step = 0;
  user.pending_recipe_confirmation_id = recipeId;
  await repo.saveUser(user);
  return responses.recipeFinishedPrompt();
}

async function handleWaterLog(repo: Repository, user: UserRecord, textNorm: string, now: Date): Promise<DispatchResult> {
  const ml = parseWaterMl(textNorm);
  if (ml === null) {
    return { reply: "شكد تقريباً شربت؟ 🥤 (مثلاً: كوب، نص لتر، أو 500 مل)", meal_logged: false };
  }

  const log = await repo.insertWaterLog({ user_id: user.id, ml: Math.trunc(ml) });
  const streakSnapshot = await streaks.recordActiveDay(repo, user, now);
  await repo.saveUser(user);

  const profile = await repo.findNutritionProfile(user.id);
  await behaviorAggregator.recordDailyBehavior(repo, user.id, profile, now);

  const snapshot = directLog.buildWaterSnapshot(log.id, Math.trunc(ml), streakSnapshot, now);
  await directLog.save(repo, user, snapshot);

  const total = await calculator.todayWaterMl(repo, user.id, now);
  let reply = `${responses.waterLogged(Math.trunc(ml))}\nمجموع اليوم: ${total} مل 💧\n\n${responses.directLogUndoHint()}`;
  for (const milestone of streakSnapshot.new_milestones) {
    reply += `\n\n🔥 ${milestone.label}! +${milestone.xp_reward} XP`;
  }
  return { reply, meal_logged: false, new_milestones: streakSnapshot.new_milestones };
}

/**
 * نقطة دخول مصدَّرة لتسجيل الماي — تُستخدم من زر إشعار "✅ شربت كوب" (water-quick-log.mts).
 */
export async function runWaterLoggingPipeline(
  repo: Repository, user: UserRecord, rawText: string, now: Date = new Date(),
): Promise<DispatchResult> {
  return handleWaterLog(repo, user, rawText.trim(), now);
}
