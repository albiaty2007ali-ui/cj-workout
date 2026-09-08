/**
 * منفذ من nutrition_ai/orchestrator.py — القلب اللي يجمع كل الطبقات (Intent Detector, Entity
 * Extractor, Quantity Resolver, Meal State Machine, Nutrition Calculator, Recommendation Engine,
 * Tips Engine, Context Manager, Response Generator) لبناء رد واحد. لا اتصال شبكة هنا، ولا أي رقم
 * سعرات يُخترع — كل شيء يمر من foodSearch.ts/foods.sqlite عبر calculator.ts.
 *
 * ملاحظة هجرة: نظام إشعارات Push (notifyStreakMilestones بالأصل) غير منفَّذ هنا — طبقة منفصلة
 * (Netlify Scheduled Functions) تُبنى لاحقًا، ونداؤها هنا best-effort تمامًا مثل الأصل
 * (فشل الإرسال لا يوقف ولا يؤخر تسجيل الوجبة/الماي أبدًا).
 */
import { normalize } from "./arabicNormalize.js";
import * as calculator from "./calculator.js";
import * as context from "./context.js";
import * as corrections from "./corrections.js";
import * as directLog from "./directLog.js";
import { extractFoodEntities } from "./entities.js";
import * as intents from "./intents.js";
import * as mealState from "./mealState.js";
import { findLeadingNumber, parseWaterMl } from "./quantity.js";
import * as recipeSearch from "./recipeSearch.js";
import * as recommendations from "./recommendations.js";
import * as responses from "./responses.js";
import * as streaks from "./streaks.js";
import * as tipsEngine from "./tipsEngine.js";
import * as weightOps from "./weightOps.js";
import * as xpEngine from "./xpEngine.js";
import { getPortionsFor } from "./foodSearch.js";
import { getCurrentPeriod, relevantMealForPeriod, todayBaghdadIso } from "./iraqTime.js";
import { pyFloatStr } from "./pyRound.js";
import { FREE_MEALS_CAP } from "./userStatus.js";
import type { Repository, UserRecord } from "./db/repository.js";
import type { PendingMeal, PendingItem } from "./corrections.js";

// كلمات تصنيف تُمرَّر مباشرة لـrecipeSearch بدل بحث نصي حر — نفس عبارات
// intents.RECIPE_CATEGORY_PHRASES المركّبة عمدًا (تفادي تصادم مع تسجيل وجبة فعلي)
const RECIPE_CATEGORY_KEYWORDS: Record<string, string> = {
  "حلو": "حلويات", "حلويات": "حلويات",
  "مشروب حار": "مشروبات حارة", "قهوة": "مشروبات حارة", "شاي": "مشروبات حارة",
  "مشروب بارد": "مشروبات باردة",
};

async function matchRecipeCategoryId(repo: Repository, textNorm: string): Promise<string | null> {
  if (!intents.RECIPE_CATEGORY_PHRASES.some((p) => textNorm.includes(p))) return null;
  for (const [keyword, categoryName] of Object.entries(RECIPE_CATEGORY_KEYWORDS)) {
    if (textNorm.includes(keyword)) {
      const category = await repo.findRecipeCategoryByName(categoryName);
      if (category) return category.id;
    }
  }
  return null;
}

const MEAL_KEYWORDS: Record<string, string[]> = {
  breakfast: ["فطرت", "فطور", "فطرة", "فطرنا"],
  lunch: ["تغديت", "تغدينا", "غداء", "غدانا", "غدينا"],
  dinner: ["عشيت", "عشينا", "عشاء", "تعشيت"],
  snack: ["سناك", "سنك", "وجبة خفيفة"],
};

const REOPEN_INTENTS = new Set([
  intents.CORRECTION, intents.CHANGE_QUANTITY, intents.REMOVE_FOOD, intents.SWAP_FOOD, intents.ADD_FOOD,
]);

function explicitMealTypeKeyword(text: string): string | null {
  for (const [mealType, keywords] of Object.entries(MEAL_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) return mealType;
  }
  return null;
}

function findMealType(text: string, now: Date): string {
  const explicit = explicitMealTypeKeyword(text);
  if (explicit) return explicit;
  return relevantMealForPeriod(getCurrentPeriod(now));
}

async function markMealLogged(repo: Repository, user: UserRecord, mealType: string, now: Date): Promise<void> {
  if (mealType !== "breakfast" && mealType !== "lunch" && mealType !== "dinner") return;
  await repo.upsertMealStatus(user.id, todayBaghdadIso(now), mealType, "logged");
}

export function compensationMessage(remaining: number, target: number): string {
  if (remaining >= 0 || !target) return "";
  const ratioOver = -remaining / target;
  return responses.compensationNote(ratioOver <= 0.1);
}

/** Push حقيقي لأي محطة Streak جديدة — Best-effort دائمًا (طبقة الإشعارات تُبنى لاحقًا). */
async function notifyStreakMilestones(_user: UserRecord, _streakSnapshot: streaks.StreakSnapshot): Promise<void> {
  // مقصود: لا شيء بعد — راجع تعليق أعلى الملف.
}

function addResolvedToPending(pending: PendingMeal, hit: { food_id: number; food_name: string; grams?: number; quantity?: number; unit_grams?: number; portion_name?: string }, nutrition: { calories: number; protein: number; carbs: number; fat: number }): void {
  pending.items.push({
    food_id: hit.food_id, food_name: hit.food_name, grams: hit.grams ?? 0,
    calories: nutrition.calories, protein: nutrition.protein, carbs: nutrition.carbs, fat: nutrition.fat,
    quantity: hit.quantity, unit_grams: hit.unit_grams, portion_name: hit.portion_name,
  });
}

type ClarificationItem =
  | { kind: "quantity"; food_id: number; food_name: string }
  | { kind: "confirm_match"; food_id: number; food_name: string; alias_row: unknown; start: number | null; end: number | null; source_text: string }
  | { kind: "ambiguous_match"; options: { food_id: number; food_name: string; alias_row: unknown }[]; start: number | null; end: number | null; source_text: string };

async function clarificationPrompt(item: ClarificationItem): Promise<string> {
  if (item.kind === "confirm_match") return responses.clarifyConfirmMatch(item.food_name);
  if (item.kind === "ambiguous_match") {
    const [a, b] = item.options;
    return responses.clarifyAmbiguous(a.food_name, b.food_name);
  }
  const portions = await getPortionsFor(item.food_id);
  if (portions.length === 0) return responses.clarifyQuantityNoPortions(item.food_name);
  const lines = portions.map((p) => `🍽️ ${p.portion_name}`).join("\n");
  return responses.clarifyQuantityWithPortions(item.food_name, lines);
}

function summarizePending(pending: PendingMeal): string {
  const total = pending.items.reduce((s, i) => s + i.calories, 0);
  const mealLabel = responses.MEAL_TYPE_LABELS[pending.meal_type] ?? "الوجبة";
  return (
    `صار عندي لـ${mealLabel}: ${responses.itemsInline(pending.items)}\n` +
    `🔥 تقريباً ${total} سعرة\n\n${responses.mealConfirmPrompt(pending.meal_type)}`
  );
}

type ResolvedClarificationResult = { food_id: number; food_name: string; resolved: true; grams: number; portion_name?: string } | "REJECTED" | null;

async function resolveClarificationItem(item: ClarificationItem, textNorm: string): Promise<ResolvedClarificationResult> {
  const { resolveQuantityForFood, resolveAliasAt } = await import("./foodSearch.js");

  if (item.kind === "quantity") {
    const res = await resolveQuantityForFood(item.food_id, textNorm);
    if (res.resolved) {
      return { food_id: item.food_id, food_name: item.food_name, resolved: true, grams: res.grams!, portion_name: res.portion_name };
    }
    return null;
  }

  if (item.kind === "confirm_match") {
    if (intents.CONFIRM_PHRASES.includes(textNorm)) {
      const hit = await resolveAliasAt(item.alias_row as never, item.source_text, item.start ?? 0);
      return hit.resolved ? (hit as ResolvedClarificationResult) : null;
    }
    if (intents.CANCEL_PHRASES.includes(textNorm)) return "REJECTED";
    return null;
  }

  if (item.kind === "ambiguous_match") {
    const normText = normalize(textNorm);
    for (const opt of item.options) {
      if (normalize(opt.food_name) && normText.includes(normalize(opt.food_name))) {
        const hit = await resolveAliasAt(opt.alias_row as never, item.source_text, item.start ?? 0);
        return hit.resolved ? (hit as ResolvedClarificationResult) : null;
      }
    }
    const stripped = normText.trim();
    if (stripped === "1" || stripped === "الاول" || stripped === "الأول") {
      const hit = await resolveAliasAt(item.options[0].alias_row as never, item.source_text, item.start ?? 0);
      return hit.resolved ? (hit as ResolvedClarificationResult) : null;
    }
    if (stripped === "2" || stripped === "الثاني" || stripped === "الثانية") {
      const hit = await resolveAliasAt(item.options[1].alias_row as never, item.source_text, item.start ?? 0);
      return hit.resolved ? (hit as ResolvedClarificationResult) : null;
    }
    return null;
  }

  return null;
}

function hasAnswerableClarification(pending: PendingMeal | null): boolean {
  if (!pending || !pending.pending_clarifications?.length) return false;
  const first = pending.pending_clarifications[0] as ClarificationItem;
  return first.kind === "confirm_match" || first.kind === "ambiguous_match";
}

export interface DispatchResult {
  reply: string | null;
  meal_logged: boolean;
  [key: string]: unknown;
}

function clarificationFoodIds(c: ClarificationItem): Set<number> {
  if (c.kind === "ambiguous_match") return new Set(c.options.map((o) => o.food_id));
  return "food_id" in c ? new Set([c.food_id]) : new Set();
}

async function handleMealMessage(
  repo: Repository, user: UserRecord, textNorm: string, pending: PendingMeal | null, now: Date,
): Promise<DispatchResult> {
  if (pending) {
    const remainingClarifications: ClarificationItem[] = [];
    for (const item of pending.pending_clarifications as ClarificationItem[]) {
      const result = await resolveClarificationItem(item, textNorm);
      if (result === "REJECTED") continue;
      if (result !== null) {
        const n = await calculator.computeFood(result.food_id, result.grams);
        addResolvedToPending(pending, result, n);
      } else {
        remainingClarifications.push(item);
      }
    }
    pending.pending_clarifications = remainingClarifications;

    const newEntities = await extractFoodEntities(textNorm);
    const existingItemIds = new Set(pending.items.map((i) => i.food_id));
    const quantityClarificationIds = new Set(
      (pending.pending_clarifications as ClarificationItem[])
        .filter((c) => c.kind === "quantity")
        .map((c) => (c as { food_id: number }).food_id),
    );

    for (const hit of newEntities.resolved) {
      const fid = hit.food_id;
      if (existingItemIds.has(fid) || quantityClarificationIds.has(fid)) continue;
      pending.pending_clarifications = (pending.pending_clarifications as ClarificationItem[]).filter(
        (c) => !clarificationFoodIds(c).has(fid),
      );
      const n = await calculator.computeFood(fid, hit.grams ?? 0);
      addResolvedToPending(pending, hit, n);
      existingItemIds.add(fid);
    }

    let pendingClarificationIds = new Set<number>();
    for (const c of pending.pending_clarifications as ClarificationItem[]) {
      for (const id of clarificationFoodIds(c)) pendingClarificationIds.add(id);
    }
    for (const clar of newEntities.clarifications as unknown as ClarificationItem[]) {
      const cids = clarificationFoodIds(clar);
      const overlaps = [...cids].some((id) => existingItemIds.has(id) || pendingClarificationIds.has(id));
      if (cids.size > 0 && overlaps) continue;
      (pending.pending_clarifications as ClarificationItem[]).push(clar);
      pendingClarificationIds = new Set([...pendingClarificationIds, ...cids]);
    }

    await mealState.savePending(repo, user, pending);

    if (pending.pending_clarifications.length > 0) {
      return { reply: await clarificationPrompt(pending.pending_clarifications[0] as ClarificationItem), meal_logged: false };
    }
    if (pending.items.length > 0) {
      return { reply: summarizePending(pending), meal_logged: false };
    }
    return { reply: "ما قدرت أتعرف على أكلة واضحة برسالتك. جرب تكتب اسم الأكلة بالضبط.", meal_logged: false };
  }

  // ---------------- رسالة جديدة كليًا ----------------
  const result = await extractFoodEntities(textNorm);
  if (result.resolved.length === 0 && result.clarifications.length === 0) {
    return {
      reply: 'ما قدرت أتعرف على أكلة واضحة برسالتك. جرب تكتب اسم الأكلة بالضبط (مثلاً: "تغديت دولمة" أو "فطرت بيضتين وخبز").',
      meal_logged: false,
    };
  }

  const mealType = findMealType(textNorm, now);

  if (result.clarifications.length === 0) {
    return tryDirectLog(repo, user, mealType, textNorm, result.resolved, now);
  }

  const newPending = mealState.newPending(mealType, textNorm);
  for (const hit of result.resolved) {
    const n = await calculator.computeFood(hit.food_id, hit.grams ?? 0);
    addResolvedToPending(newPending, hit, n);
  }
  newPending.pending_clarifications = result.clarifications as unknown as PendingMeal["pending_clarifications"];
  await mealState.savePending(repo, user, newPending);
  return { reply: await clarificationPrompt(newPending.pending_clarifications[0] as ClarificationItem), meal_logged: false };
}

/**
 * نقطة الحقيقة الوحيدة لإنشاء MealLog — source="confirmed" (تأكيد صريح) أو source="direct"/
 * "recipe" (DIRECT_LOG، يُبنى Undo Snapshot).
 */
async function finalizeMeal(
  repo: Repository, user: UserRecord, pending: PendingMeal, target: number,
  source: "confirmed" | "direct" | "recipe", now: Date,
): Promise<DispatchResult> {
  const wasFreeMeal = !user.is_premium;
  if (wasFreeMeal) {
    const ok = await repo.incrementFreeMealsUsedIfBelowCap(user.id, FREE_MEALS_CAP);
    if (!ok) {
      if (source === "confirmed") await mealState.savePending(repo, user, null);
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

  if (source === "confirmed") await mealState.savePending(repo, user, null);
  await markMealLogged(repo, user, pending.meal_type, now);

  const dayTotals = await calculator.todayTotals(repo, user.id, now);
  const remaining = target - dayTotals.calories;
  const overTarget = remaining < 0;

  const profile = await repo.findNutritionProfile(user.id);
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
  await notifyStreakMilestones(user, streakSnapshot);

  if (source === "direct" || source === "recipe") {
    const snapshot = directLog.buildMealSnapshot(
      log.id, pending.meal_type, pending.raw_text, pending.items,
      xpAwarded, wasFreeMeal, streakSnapshot, mealStatusBefore, now,
    );
    await directLog.save(repo, user, snapshot);
    reply += `\n\n${responses.directLogUndoHint()}`;
  }

  await repo.saveUser(user);

  return {
    reply, meal_logged: true, today_calories: dayTotals.calories,
    target_calories: target, remaining, xp: user.xp, free_meals_used: user.free_meals_used,
  };
}

async function tryDirectLog(
  repo: Repository, user: UserRecord, mealType: string, rawText: string,
  resolvedHits: Awaited<ReturnType<typeof extractFoodEntities>>["resolved"], now: Date,
): Promise<DispatchResult> {
  const tempPending = mealState.newPending(mealType, rawText);
  for (const hit of resolvedHits) {
    const n = await calculator.computeFood(hit.food_id, hit.grams ?? 0);
    addResolvedToPending(tempPending, hit, n);
  }
  const profile = await repo.findNutritionProfile(user.id);
  const target = profile ? profile.calorie_target : 2000;
  return finalizeMeal(repo, user, tempPending, target, "direct", now);
}

async function confirmPending(repo: Repository, user: UserRecord, pending: PendingMeal, target: number, now: Date): Promise<DispatchResult> {
  if (pending.pending_clarifications.length > 0) {
    return { reply: await clarificationPrompt(pending.pending_clarifications[0] as ClarificationItem), meal_logged: false };
  }
  return finalizeMeal(repo, user, pending, target, "confirmed", now);
}

/** وصفة خلص طبخها — ما تُحتسب سعراتها لين المستخدم يجاوب صراحة "أكلتها". */
export async function markRecipeAwaitingConfirmation(repo: Repository, user: UserRecord, recipeId: string): Promise<string> {
  user.current_recipe_id = null;
  user.current_recipe_step = 0;
  user.pending_recipe_confirmation_id = recipeId;
  await repo.saveUser(user);
  return responses.recipeFinishedPrompt();
}

async function finalizeRecipeMeal(repo: Repository, user: UserRecord, target: number, now: Date): Promise<DispatchResult> {
  const recipeId = user.pending_recipe_confirmation_id;
  user.pending_recipe_confirmation_id = null;
  const recipe = recipeId ? await repo.findRecipeById(recipeId) : null;
  if (!recipe) {
    await repo.saveUser(user);
    return { reply: "ماكو وصفة بانتظار التأكيد هسه 🙂", meal_logged: false };
  }

  const pending = mealState.newPending(findMealType("", now), recipe.name);
  pending.items.push({
    food_id: -1, food_name: recipe.name, grams: 0,
    calories: recipe.calories, protein: recipe.protein, carbs: recipe.carbs, fat: recipe.fat,
  });
  return finalizeMeal(repo, user, pending, target, "recipe", now);
}

function handleGreeting(user: UserRecord, now: Date): DispatchResult {
  const absence = streaks.daysAbsent(user, now);
  let reply: string;
  if (absence >= 7) reply = responses.returnGreeting("long");
  else if (absence >= 3) reply = responses.returnGreeting("medium");
  else if (absence >= 1) reply = responses.returnGreeting("short");
  else {
    reply = responses.greeting();
    if (user.streak_days > 1) reply += `\n${responses.streakContinuesNote(user.streak_days)}`;
  }
  return { reply, meal_logged: false };
}

async function handleExpressDesire(repo: Repository, user: UserRecord, textNorm: string, now: Date): Promise<DispatchResult> {
  const result = await extractFoodEntities(textNorm);
  if (result.resolved.length > 0 || result.clarifications.length > 0) {
    return { reply: responses.desireAck(true), meal_logged: false };
  }

  const mealType = explicitMealTypeKeyword(textNorm);
  if (mealType) {
    const profile = await repo.findNutritionProfile(user.id);
    const ctx = await context.build(repo, user.id, profile, now);
    const proteinNeeded = Math.max(0, (ctx.macro_targets.protein_g ?? 0) - ctx.consumed_protein);
    return { reply: await recommendations.suggestMealWithin(ctx.remaining_calories, proteinNeeded), meal_logged: false };
  }

  return { reply: responses.desireAck(false), meal_logged: false };
}

function askedMacro(textNorm: string): "protein" | "carb" | "fat" | null {
  if (intents.PROTEIN_WORDS.some((w) => textNorm.includes(w))) return "protein";
  if (intents.CARB_WORDS.some((w) => textNorm.includes(w))) return "carb";
  if (intents.FAT_WORDS.some((w) => textNorm.includes(w))) return "fat";
  return null;
}

function generalNutritionTopic(textNorm: string): string {
  if (textNorm.includes("قبل التمرين")) return "pre_workout";
  if (textNorm.includes("بعد التمرين")) return "post_workout";
  if (textNorm.includes("توقيت الوجبات")) return "meal_timing";
  if (textNorm.includes("مشروبات غازية")) return "sugary_drinks";
  if (textNorm.includes("فاست فود")) return "fast_food";
  if (textNorm.includes("حلويات")) return "desserts";
  if (intents.PROTEIN_WORDS.some((w) => textNorm.includes(w))) return "protein";
  if (intents.CARB_WORDS.some((w) => textNorm.includes(w))) return "carb";
  if (intents.FAT_WORDS.some((w) => textNorm.includes(w))) return "fat";
  if (intents.FIBER_WORDS.some((w) => textNorm.includes(w))) return "fiber";
  return "generic";
}

async function extractFirstFood(textNorm: string): Promise<[number, string] | [null, null]> {
  const result = await extractFoodEntities(textNorm);
  if (result.resolved.length > 0) {
    const item = result.resolved[0];
    return [item.food_id, item.food_name];
  }
  for (const c of result.clarifications) {
    if ("food_id" in c && c.food_id) return [c.food_id, c.food_name];
  }
  return [null, null];
}

async function handleFoodTopic(repo: Repository, user: UserRecord, textNorm: string, kind: "craving" | "plan"): Promise<DispatchResult> {
  const [foodId, foodName] = await extractFirstFood(textNorm);
  if (foodId === null) {
    user.pending_food_topic_json = null;
    await repo.saveUser(user);
    return { reply: kind === "craving" ? responses.cravingAck(null) : responses.planAck(null), meal_logged: false };
  }

  user.pending_food_topic_json = JSON.stringify({ food_id: foodId, food_name: foodName, kind });
  await repo.saveUser(user);
  const ack = kind === "craving" ? responses.cravingAck(foodName) : responses.planAck(foodName);
  return { reply: ack, meal_logged: false };
}

async function handlePortionForFood(repo: Repository, user: UserRecord, textNorm: string, now: Date): Promise<DispatchResult> {
  let [foodId, foodName] = await extractFirstFood(textNorm);
  if (foodId === null && user.pending_food_topic_json) {
    const topic = JSON.parse(user.pending_food_topic_json) as { food_id: number; food_name: string };
    foodId = topic.food_id;
    foodName = topic.food_name;
  }

  if (foodId === null) {
    return { reply: responses.noFoodInTopicPrompt(), meal_logged: false };
  }

  const profile = await repo.findNutritionProfile(user.id);
  const ctx = await context.build(repo, user.id, profile, now);
  const reply = await recommendations.suggestPortionForFood(foodId, foodName!, ctx.remaining_calories);
  user.pending_food_topic_json = JSON.stringify({ food_id: foodId, food_name: foodName, kind: "portion_given" });
  await repo.saveUser(user);
  return { reply, meal_logged: false };
}

async function handleWaterLog(repo: Repository, user: UserRecord, textNorm: string, now: Date): Promise<DispatchResult> {
  const ml = parseWaterMl(textNorm);
  if (ml === null) {
    return { reply: "شكد تقريباً شربت؟ 🥤 (مثلاً: كوب، نص لتر، أو 500 مل)", meal_logged: false };
  }

  const log = await repo.insertWaterLog({ user_id: user.id, ml: Math.trunc(ml) });
  const streakSnapshot = await streaks.recordActiveDay(repo, user, now);
  await repo.saveUser(user);

  const snapshot = directLog.buildWaterSnapshot(log.id, Math.trunc(ml), streakSnapshot, now);
  await directLog.save(repo, user, snapshot);

  const total = await calculator.todayWaterMl(repo, user.id, now);
  let reply = `${responses.waterLogged(Math.trunc(ml))}\nمجموع اليوم: ${total} مل 💧\n\n${responses.directLogUndoHint()}`;
  for (const milestone of streakSnapshot.new_milestones) {
    reply += `\n\n🔥 ${milestone.label}! +${milestone.xp_reward} XP`;
  }
  await notifyStreakMilestones(user, streakSnapshot);
  return { reply, meal_logged: false };
}

async function handleWeightUpdate(repo: Repository, user: UserRecord, textNorm: string): Promise<DispatchResult> {
  const newWeight = findLeadingNumber(textNorm);
  if (newWeight === null || !(newWeight >= 30 && newWeight <= 300)) {
    return { reply: "شكد وزنك الجديد بالضبط؟ اكتبلي رقم بالكيلوغرام (مثلاً: وزني هسه 80).", meal_logged: false };
  }

  const result = await weightOps.applyWeightUpdate(repo, user.id, newWeight);
  if (result === null) {
    return { reply: "لازم تكمل بياناتك الأساسية أول مرة قبل ما أگدر أحدّث وزنك.", meal_logged: false };
  }

  let reply = responses.weightUpdated(newWeight, result.calorie_target);
  if (result.safety_warning) reply += `\n\n⚠️ ${result.safety_warning}`;
  return { reply, meal_logged: false, target_calories: result.calorie_target };
}

export interface IntentContextFlags {
  has_pending: boolean;
  has_recipe: boolean;
  has_undoable_log: boolean;
  has_pending_recipe: boolean;
  has_pending_food_topic: boolean;
}

/** نقطة الدخول الرئيسية — يعادل nutrition_engine.handle_message عبر orchestrator.py. */
export async function handleMessage(repo: Repository, user: UserRecord, text: string, now: Date = new Date()): Promise<DispatchResult> {
  const textNorm = text.trim();
  const profile = await repo.findNutritionProfile(user.id);
  const target = profile ? profile.calorie_target : 2000;

  const pending = mealState.loadPending(user);
  const undoSnapshot = await directLog.loadValid(repo, user, now);
  const ctxFlags: IntentContextFlags = {
    has_pending: pending !== null,
    has_recipe: user.current_recipe_id !== null,
    has_undoable_log: undoSnapshot !== null,
    has_pending_recipe: user.pending_recipe_confirmation_id !== null,
    has_pending_food_topic: user.pending_food_topic_json !== null,
  };
  const intent = intents.detectIntent(textNorm, ctxFlags);

  return dispatch(repo, user, textNorm, intent, pending, target, now);
}

async function dispatch(
  repo: Repository, user: UserRecord, textNorm: string, intent: string,
  pendingIn: PendingMeal | null, target: number, now: Date,
): Promise<DispatchResult> {
  let pending = pendingIn;

  if (REOPEN_INTENTS.has(intent) && pending === null) {
    const reopened = await directLog.reopenMealForEdit(repo, user, now);
    if (reopened !== null) {
      pending = reopened as unknown as PendingMeal;
    } else if (intent !== intents.ADD_FOOD) {
      return { reply: "خلص وكت التعديل على آخر وجبة، خبرني شنو أكلت وأبدأ وجبة جديدة.", meal_logged: false };
    }
  }

  if (intent === intents.OFFTOPIC) {
    return { reply: "أنا مخصص لمساعدتك بالأكل واللياقة والتغذية داخل CJ WORKOUT 💪، ما أكدر أساعد بطلبات ثانية.", meal_logged: false };
  }
  if (intent === intents.MEDICAL) {
    return { reply: "هذا سؤال يحتاج رأي مختص طبي، أنا ما أقدر أشخص أو أنصح بعلاج. تواصل مع دكتور أو مختص تغذية لهذا الموضوع 🙏", meal_logged: false };
  }
  if (intent === intents.NOT_YET) {
    if (user.pending_recipe_confirmation_id) return { reply: responses.recipeNotYetAck(), meal_logged: false };
    return { reply: "تمام، خبرني لما تاكل 🌱 أو گلي شنو تشتهي وأقترحلك شي مناسب لسعراتك المتبقية.", meal_logged: false };
  }
  if (intent === intents.EXPRESS_DESIRE) return handleExpressDesire(repo, user, textNorm, now);
  if (intent === intents.EXPRESS_CRAVING) return handleFoodTopic(repo, user, textNorm, "craving");
  if (intent === intents.PLAN_TO_EAT) return handleFoodTopic(repo, user, textNorm, "plan");
  if (intent === intents.ASK_PORTION_FOR_FOOD) return handlePortionForFood(repo, user, textNorm, now);
  if (intent === intents.GREETING) return handleGreeting(user, now);
  if (intent === intents.FAREWELL) return { reply: responses.farewell(), meal_logged: false };
  if (intent === intents.THANKS) return { reply: responses.thanksAck(), meal_logged: false };
  if (intent === intents.ACKNOWLEDGEMENT) return { reply: responses.acknowledgement(), meal_logged: false };

  if (intent === intents.CANCEL) {
    if (hasAnswerableClarification(pending)) return handleMealMessage(repo, user, textNorm, pending, now);
    if (pending) {
      await mealState.savePending(repo, user, null);
      return { reply: "تمام، ألغيتها. خبرني شنو أكلت فعليًا.", meal_logged: false };
    }
    if (user.pending_recipe_confirmation_id) {
      user.pending_recipe_confirmation_id = null;
      await repo.saveUser(user);
      return { reply: responses.recipeDeclinedAck(), meal_logged: false };
    }
    if (user.pending_food_topic_json) {
      user.pending_food_topic_json = null;
      await repo.saveUser(user);
      return { reply: responses.foodTopicCancelAck(), meal_logged: false };
    }
    return directLog.undo(repo, user, now);
  }

  if (intent === intents.CONFIRM) {
    if (hasAnswerableClarification(pending)) return handleMealMessage(repo, user, textNorm, pending, now);
    if (pending) return confirmPending(repo, user, pending, target, now);
    if (user.pending_recipe_confirmation_id) return finalizeRecipeMeal(repo, user, target, now);
    if (user.pending_food_topic_json) return handlePortionForFood(repo, user, textNorm, now);
    return { reply: "ماكو شي بانتظار التأكيد هسه 🙂", meal_logged: false };
  }

  if (intent === intents.CORRECTION) {
    if (findLeadingNumber(textNorm) !== null && pending) {
      const [ok, msg] = await corrections.changeLastQuantity(pending, textNorm);
      let reply = msg;
      if (ok) {
        await mealState.savePending(repo, user, pending);
        reply += `\n\n${summarizePending(pending)}`;
      }
      return { reply, meal_logged: false };
    }
    return { reply: "وضحلي شنو تريد تصحح بالضبط.", meal_logged: false };
  }

  if (intent === intents.CHANGE_QUANTITY && pending) {
    const [ok, msg] = await corrections.changeLastQuantity(pending, textNorm);
    let reply = msg;
    if (ok) {
      await mealState.savePending(repo, user, pending);
      reply += `\n\n${summarizePending(pending)}`;
    }
    return { reply, meal_logged: false };
  }

  if (intent === intents.REMOVE_FOOD && pending) {
    const [ok, msg] = await corrections.removeFood(pending, textNorm);
    let reply = msg;
    if (ok) {
      await mealState.savePending(repo, user, pending);
      if (pending.items.length > 0) reply += `\n\n${summarizePending(pending)}`;
    }
    return { reply, meal_logged: false };
  }

  if (intent === intents.SWAP_FOOD && pending) {
    const [ok, , msg] = await corrections.swapFood(pending, textNorm);
    if (ok) await mealState.savePending(repo, user, pending);
    return { reply: msg, meal_logged: false };
  }

  if (intent === intents.WATER_LOG) return handleWaterLog(repo, user, textNorm, now);
  if (intent === intents.WEIGHT_UPDATE) return handleWeightUpdate(repo, user, textNorm);

  if (intent === intents.ASK_TIP) {
    const profile = await repo.findNutritionProfile(user.id);
    const ctx = await context.build(repo, user.id, profile, now);
    const category = tipsEngine.chooseCategoryForContext(ctx);
    const tipText = await tipsEngine.pickTip(repo, user.id, category);
    return { reply: tipText || "ما عندي نصيحة جديدة هسه، جرب لاحقًا 🌱", meal_logged: false };
  }

  if (intent === intents.END_DAY) {
    const dayTotals = await calculator.todayTotals(repo, user.id, now);
    const waterMl = await calculator.todayWaterMl(repo, user.id, now);
    const remaining = target - dayTotals.calories;
    let summary =
      `ملخص يومك 📋\n🔥 السعرات: ${dayTotals.calories} / ${target} kcal\n` +
      `🍗 بروتين: ${Math.round(dayTotals.protein)}غ | 🍞 كارب: ${Math.round(dayTotals.carbs)}غ | 🥑 دهون: ${Math.round(dayTotals.fat)}غ\n` +
      `💧 الماي: ${waterMl} مل\n` +
      `🍽️ عدد الوجبات المسجلة: ${dayTotals.logs.length}\n⭐ XP الحالي: ${user.xp}\n`;
    summary += compensationMessage(remaining, target) || "\n\nبطل 🔥 اليوم كان مرتب جدًا. استمر، يوم وراء يوم راح تشوف الفرق.";
    return { reply: summary, meal_logged: false };
  }

  if (intent === intents.ASK_REMAINING) {
    const macro = askedMacro(textNorm);
    if (macro) {
      const profile = await repo.findNutritionProfile(user.id);
      const ctx = await context.build(repo, user.id, profile, now);
      const map = {
        protein: [ctx.consumed_protein, ctx.macro_targets.protein_g ?? 0, "بروتين"] as const,
        carb: [ctx.consumed_carbs, ctx.macro_targets.carbs_g ?? 0, "كارب"] as const,
        fat: [ctx.consumed_fat, ctx.macro_targets.fat_g ?? 0, "دهون"] as const,
      };
      const [consumed, targetGrams, label] = map[macro];
      const remainingGrams = targetGrams - consumed;
      return { reply: responses.remainingMacro(label, remainingGrams, targetGrams), meal_logged: false };
    }

    const dayTotals = await calculator.todayTotals(repo, user.id, now);
    const remaining = target - dayTotals.calories;
    if (remaining >= 0) {
      return { reply: `باقيلك تقريبًا ${remaining} سعرة من أصل ${target} kcal اليوم. تحب أقترحلك وجبة ضمنها؟`, meal_logged: false };
    }
    return { reply: `تجاوزت هدفك اليوم بـ ${Math.abs(remaining)} سعرة تقريبًا.${compensationMessage(remaining, target)}`, meal_logged: false };
  }

  if (intent === intents.GENERAL_NUTRITION) {
    return { reply: responses.generalNutritionAnswer(generalNutritionTopic(textNorm)), meal_logged: false };
  }

  if (intent === intents.ASK_CALORIE_TARGET_MEAL) {
    const m = textNorm.match(/(\d+)/);
    if (m) return { reply: await recommendations.suggestMealNearTarget(parseInt(m[1], 10)), meal_logged: false };
    return { reply: "شكد سعرة تريد تكون الوجبة تقريبًا؟ اكتبلي رقم.", meal_logged: false };
  }

  if (intent === intents.ASK_RECOMMENDATION) {
    const profile = await repo.findNutritionProfile(user.id);
    const ctx = await context.build(repo, user.id, profile, now);
    const proteinNeeded = Math.max(0, (ctx.macro_targets.protein_g ?? 0) - ctx.consumed_protein);
    let reply = await recommendations.suggestMealWithin(ctx.remaining_calories, proteinNeeded);
    const matchingRecipes = await recipeSearch.suggestRecipesWithin(repo, ctx.remaining_calories);
    if (matchingRecipes.length > 0) {
      const lines = matchingRecipes.map((r) => `🍳 ${r.name} (~${r.calories} kcal) — /recipes/${r.slug}`).join("\n");
      reply += `\n\nأو جرب وصفة جاهزة عندنا:\n${lines}`;
    }
    return { reply, meal_logged: false };
  }

  const hasRecipe = user.current_recipe_id !== null;
  if (intent === intents.COOKING_STEP && hasRecipe) {
    const recipe = await repo.findRecipeById(user.current_recipe_id!);
    if (recipe) {
      if (intents.MISSING_INGREDIENT_TRIGGERS.some((t) => textNorm.includes(t))) {
        for (const sub of recipe.substitutions) {
          if (textNorm.includes(sub.ingredient_name)) return { reply: sub.replacement, meal_logged: false };
        }
        return { reply: "ما عندي بديل مسجّل لهذا المكوّن بقاعدة بياناتي الحالية، جرب تحذفه إذا مو أساسي بالوصفة.", meal_logged: false };
      }

      const steps = [...recipe.steps].sort((a, b) => a.step_number - b.step_number);
      const stepIdx = user.current_recipe_step;
      if (stepIdx >= steps.length) {
        const prompt = await markRecipeAwaitingConfirmation(repo, user, recipe.id);
        return { reply: prompt, meal_logged: false };
      }
      const step = steps[stepIdx];
      user.current_recipe_step = stepIdx + 1;
      await repo.saveUser(user);
      let stepText = `الخطوة ${stepIdx + 1}/${steps.length}: ${step.instruction}`;
      const extras: string[] = [];
      if (step.duration) extras.push(`⏱️ ${step.duration}`);
      if (step.temperature) extras.push(`🌡️ ${step.temperature}`);
      if (extras.length > 0) stepText += `\n${extras.join(" · ")}`;
      if (step.tip) stepText += `\n💡 ${step.tip}`;
      if (step.warning) stepText += `\n⚠️ ${step.warning}`;
      return { reply: stepText, meal_logged: false };
    }
  }

  if (intent === intents.ASK_RECIPE) {
    const categoryId = await matchRecipeCategoryId(repo, textNorm);
    const results = categoryId
      ? await recipeSearch.searchRecipes(repo, "", categoryId)
      : await recipeSearch.searchRecipes(repo, textNorm);
    const recipe = results[0] ?? null;
    if (recipe) {
      user.current_recipe_id = recipe.id;
      user.current_recipe_step = 0;
      await repo.saveUser(user);
      const ingredientsList = recipe.ingredients
        .map((i) => `- ${i.name}` + (i.quantity && i.unit ? ` (${i.quantity} ${i.unit})` : i.unit ? ` (${i.unit})` : ""))
        .join("\n");
      const reply =
        `🍳 ${recipe.name}\n\nالسعرات التقريبية: ${recipe.calories} kcal | بروتين ${pyFloatStr(recipe.protein)}غ | ` +
        `كارب ${pyFloatStr(recipe.carbs)}غ | دهون ${pyFloatStr(recipe.fat)}غ\n\nالمكونات:\n${ingredientsList}\n\n` +
        `اكتب "هسه شنو أسوي" لنبدأ خطوة بخطوة 👨‍🍳\nأو شوف الوصفة كاملة: /recipes/${recipe.slug}`;
      return { reply, meal_logged: false };
    }
    return {
      reply: "ما لقيت وصفة مناسبة بقاعدة بياناتي الحالية لهذا الطلب، جرب تذكر مكونات ثانية أو اسم أكلة معروفة، أو تصفح كل الوصفات بصفحة /recipes.",
      meal_logged: false,
    };
  }

  // LOG_MEAL / ADD_FOOD / أي نية ثانية غير معروفة -> نحاول نطابقها كأكل
  return handleMealMessage(repo, user, textNorm, pending, now);
}
