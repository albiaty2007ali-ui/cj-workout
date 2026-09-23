/**
 * أدوات التحوّر الوحيدتين (log_meal, undo_last_meal) — الوحيدتين بكل سجل الأدوات اللي تكتب
 * بالـDB. منفصلتين عن tools.ts (أدوات القراءة) عمدًا لوضوح "هذا الملف يحتاج أعلى درجة تدقيق".
 *
 * log_meal لا يثق بأي شي يدّعيه Gemini إطلاقًا — لا اسم طعام، لا كمية، لا نية. يتحقق فقط من
 * intents.isConsumptionAuthorized(rawText) على النص الخام الأصلي، ثم يعيد تشغيل نفس محرك
 * الاستخراج/التسجيل الحتمي (orchestrator.runMealLoggingPipeline -> handleMealMessage ->
 * finalizeMeal) الموجود أصلاً — هذا بالضبط ما يمنع "حادثة البيتزا" من التكرار حتى لو Gemini
 * بقصور أو تلاعب ادّعى ثقة كاملة بتسجيل وجبة من سؤال معلوماتي بريء.
 */
import * as directLog from "../directLog.js";
import { CONFIRM_PHRASES, isConsumptionAuthorized, isWaterLogAuthorized, matchesPhrase } from "../intents.js";
import { findMealType } from "../mealTypeDetection.js";
import { logMealManually, runMealLoggingPipeline, runWaterLoggingPipeline } from "../orchestrator.js";
import type { CJTool, ToolExecContext } from "./types.js";

export interface LogMealToolResult {
  /** true فقط لو انسجّلت وجبة فعلية حقيقية بهذا الاستدعاء — Gemini يُمنَع يدّعي نجاح غير هذا. */
  ok: boolean;
  meal_logged: boolean;
  /** الرد الحتمي الحقيقي من المحرك المحلي — Gemini يقدر يعيد صياغته لهجويًا، لكن الأرقام تبقى من هنا فقط. */
  local_reply: string | null;
  /** موجود فقط لو رُفض الاستدعاء هيكليًا (رسالة جديدة كليًا ليست استهلاكًا فعليًا). */
  rejection_reason?: "NOT_A_CONSUMPTION_STATEMENT";
  [key: string]: unknown;
}

/**
 * مسار احتياطي آمن: رد تأكيد قصير حقيقي ("ثبت"/"اي"/"تمام"...) بعد ما Gemini جهّز طعام محدد
 * صراحة للتسجيل (for_logging:true بـget_food_nutrition بدورة سابقة قريبة — راجع stateStore.ts's
 * nextConversationState). بدون هذا، رد تأكيد قصير لا يذكر اسم الطعام ("ثبت" وحدها) يفشل حتميًا
 * بمحرك استخراج الأطعمة المحلي (rawText نفسه ما فيه أي اسم طعام يقدر يستخرجه)، رغم إن Gemini
 * والمستخدم أصلًا اتفقوا على طعام محدد بأرقام حقيقية بردود سابقة بنفس المحادثة.
 *
 * الأمان: **مزدوج التحقق تمامًا** — (1) النص الخام نفسه لازم يطابق CONFIRM_PHRASES تمامًا (صفر
 * substring/تخمين)، (2) الطعام المفعَّل (active_food) لازم يحمل grams+calories محسوبَين فعليًا
 * (تُملأ فقط لو Gemini علّم for_logging:true صراحة، لا لأي استعلام معلوماتي بحت). كلا الشرطين
 * لازم يتحققوا معًا، نفس فلسفة isConsumptionAuthorized (نص + حالة، لا أحدهما لوحده) — يمنع سؤال
 * معلوماتي بحت ("شكد سعرات البيتزا؟") من التحول لتسجيل وجبة عبر رد تأكيد لاحق غير متعلق.
 * logMealManually تعيد استخدام finalizeMeal الموجودة أصلًا (نفس XP/عداد مجاني/ستريك/نافذة تراجع).
 */
async function tryConfirmActiveFood(ctx: ToolExecContext): Promise<LogMealToolResult | null> {
  const activeFood = ctx.conversationState.active_food;
  if (!activeFood || typeof activeFood.grams !== "number" || typeof activeFood.calories !== "number") return null;
  if (!matchesPhrase(ctx.rawText, CONFIRM_PHRASES)) return null;

  const mealType = findMealType("", ctx.now);
  const result = await logMealManually(ctx.repo, ctx.user, mealType, activeFood.food_id, activeFood.food_name, activeFood.grams, ctx.now);
  const { reply, meal_logged, ...rest } = result;
  return { ok: meal_logged === true, meal_logged, local_reply: reply, ...rest };
}

export const logMeal: CJTool<Record<string, never>, LogMealToolResult> = {
  name: "log_meal",
  description:
    "يسجّل وجبة أكل حقيقية بناءً على رسالة المستخدم الأصلية فقط — لا تستدعِها إلا إذا المستخدم صرّح فعليًا " +
    "إنه أكل/شرب شي الآن (مثلاً \"اكلت بيضتين\")، أبدًا لسؤال معلوماتي أو رغبة أو نية مستقبلية " +
    "(مثل \"شكد سعرات البيتزا؟\" أو \"مشتهي بيتزا\" أو \"راح آكل بيتزا\") — هذي حالات يُرفض فيها الاستدعاء هيكليًا " +
    "بغض النظر عن أي معامل تمرره، لأن المصدر الوحيد المعتمَد هو النص الأصلي نفسه. يشتغل أيضًا لرد " +
    "تأكيد قصير صرف (\"ثبت\"/\"اي\") بعد سؤالك \"أثبته؟\" — بس لازم يكون آخر استدعاء get_food_nutrition " +
    "مرّر for_logging:true.",
  parameters: { type: "OBJECT", properties: {} },
  mutates: true,
  async execute(ctx: ToolExecContext): Promise<LogMealToolResult> {
    const { authorized } = isConsumptionAuthorized(ctx.rawText, ctx.ctxFlags);
    if (!authorized) {
      return (await tryConfirmActiveFood(ctx)) ?? { ok: false, meal_logged: false, local_reply: null, rejection_reason: "NOT_A_CONSUMPTION_STATEMENT" };
    }
    const { reply, meal_logged, ...rest } = await runMealLoggingPipeline(ctx.repo, ctx.user, ctx.rawText, ctx.now);
    if (meal_logged) return { ok: true, meal_logged, local_reply: reply, ...rest };
    // المحرك المحلي ما لقى أكل واضح بالنص الخام وحده (متوقَّع لرد تأكيد قصير ما يذكر اسم الطعام)
    // — قبل الاستسلام بفشل عام، جرّب المسار الاحتياطي أعلاه.
    return (await tryConfirmActiveFood(ctx)) ?? { ok: false, meal_logged, local_reply: reply, ...rest };
  },
};

export interface LogWaterToolResult {
  ok: boolean;
  local_reply: string | null;
  rejection_reason?: "NOT_A_WATER_STATEMENT";
  [key: string]: unknown;
}

export const logWater: CJTool<Record<string, never>, LogWaterToolResult> = {
  name: "log_water",
  description:
    "يسجّل كمية ماي حقيقية شربها المستخدم الآن، بناءً على رسالته الأصلية فقط — لا تستدعِها إلا " +
    'إذا صرّح فعليًا إنه شرب ماي الآن (مثلاً "شربت 500 مل ماي" أو "شربت كوب ماي")، أبدًا لسؤال ' +
    "عن كمية الماي الموصى بيها أو نية مستقبلية.",
  parameters: { type: "OBJECT", properties: {} },
  mutates: true,
  async execute(ctx: ToolExecContext): Promise<LogWaterToolResult> {
    const { authorized } = isWaterLogAuthorized(ctx.rawText, ctx.ctxFlags);
    if (!authorized) {
      return { ok: false, local_reply: null, rejection_reason: "NOT_A_WATER_STATEMENT" };
    }
    const { reply, meal_logged: _ml, ...rest } = await runWaterLoggingPipeline(ctx.repo, ctx.user, ctx.rawText, ctx.now);
    // handleWaterLog يرجّع new_milestones فقط بمسار التسجيل الفعلي الناجح — غيابه يعني الرسالة
    // كانت مصرَّح لها (WATER_LOG) لكن الكمية نفسها غير واضحة (يسأل توضيح، صفر كتابة فعلية).
    const ok = "new_milestones" in rest;
    return { ok, local_reply: reply, ...rest };
  },
};

export const undoLastMeal: CJTool<Record<string, never>, directLog.UndoResult> = {
  name: "undo_last_meal",
  description: "يتراجع عن آخر وجبة سُجّلت تلقائيًا خلال آخر 5 دقائق فقط — يرجع رسالة صريحة لو انتهت النافذة أو ماكو شي للتراجع.",
  parameters: { type: "OBJECT", properties: {} },
  mutates: true,
  async execute(ctx: ToolExecContext): Promise<directLog.UndoResult> {
    return directLog.undo(ctx.repo, ctx.user, ctx.now);
  },
};

export const MUTATION_TOOLS: CJTool<any, any>[] = [logMeal, logWater, undoLastMeal];
