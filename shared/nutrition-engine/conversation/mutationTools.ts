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
import * as mealState from "../mealState.js";
import * as corrections from "../corrections.js";
import type { PendingMeal } from "../corrections.js";
import { findLeadingNumber } from "../quantity.js";
import { CHANGE_QUANTITY, CONFIRM_PHRASES, CORRECTION, isConsumptionAuthorized, isManualCalorieLogAuthorized, isWaterLogAuthorized, matchesPhrase } from "../intents.js";
import { findMealType } from "../mealTypeDetection.js";
import { logMealManually, logManualCalorieEntry, runMealLoggingPipeline, runWaterLoggingPipeline, summarizePending } from "../orchestrator.js";
import type { CJTool, ToolExecContext } from "./types.js";

export interface LogMealToolResult {
  /** true فقط لو انسجّلت وجبة فعلية حقيقية بهذا الاستدعاء — Gemini يُمنَع يدّعي نجاح غير هذا. */
  ok: boolean;
  meal_logged: boolean;
  /** الرد الحتمي الحقيقي من المحرك المحلي — Gemini يقدر يعيد صياغته لهجويًا، لكن الأرقام تبقى من هنا فقط. */
  local_reply: string | null;
  /** موجود فقط لو رُفض الاستدعاء هيكليًا (رسالة جديدة كليًا ليست استهلاكًا فعليًا). */
  rejection_reason?: "NOT_A_CONSUMPTION_STATEMENT" | "NOTHING_TO_UPDATE" | "NO_QUANTITY_FOUND";
  /** true فقط لو Gemini طلب log_meal بالغلط لرسالة هي فعليًا تصحيح كمية — Backend رفض الطلب
   *  الحرفي ونفّذ التصحيح الصحيح بدلاً عنه بنفس الاستدعاء (راجع التوثيق الكامل أسفل logMeal). */
  redirected_from_log_meal_to_update?: boolean;
  requires_confirmation?: boolean;
  [key: string]: unknown;
}

export interface UpdateMealToolResult {
  ok: boolean;
  local_reply: string | null;
  /** true لو التعديل انطبّق على مسوّدة (pending) لسا ما انسجّلت رسميًا — لازم تأكيد صريح لاحق
   *  قبل ما تنسجّل فعليًا بقاعدة البيانات (نفس ضمان "لا تسجيل بدون تأكيد" الأصلي، صفر استثناء هنا). */
  requires_confirmation?: boolean;
  rejection_reason?: "NOTHING_TO_UPDATE" | "NO_QUANTITY_FOUND";
}

/**
 * المنطق الفعلي المشترك وراء أداة update_meal — مُستخرَج بدالة منفصلة لأنه يُستدعى من مكانين:
 * (1) update_meal نفسها، (2) log_meal's Correction Guard أدناه (لما Gemini يطلب log_meal بالغلط
 * لرسالة هي فعليًا تصحيح كمية — راجع توثيق logMeal الكامل). صفر تكرار منطق بين المسارين.
 */
async function performMealUpdate(ctx: ToolExecContext): Promise<UpdateMealToolResult> {
  // فحص وجود رقم قابل للاستخدام **قبل** أي فتح/حذف حقيقي — يمنع حالة خطيرة: رسالة تصحيح بلا رقم
  // واضح كانت (بالتصميم الأول) تحذف الوجبة المسجَّلة فعليًا (DIRECT_LOG reopen) بدون ما تحفظ أي
  // مسوّدة بديلة، فتختفي الوجبة كليًا من حساب المستخدم. الآن: صفر لمس لأي بيانات حقيقية إلا لو
  // فعلاً فيه رقم بالنص الخام (نفس المصدر الوحيد المعتمَد، صفر ثقة بمعامل من Gemini).
  if (findLeadingNumber(ctx.rawText) === null && mealState.loadPending(ctx.user) === null) {
    return { ok: false, local_reply: "شكد تريد تخليها بالضبط؟ اكتبلي رقم.", rejection_reason: "NO_QUANTITY_FOUND" };
  }

  let pending = mealState.loadPending(ctx.user);
  if (!pending) {
    const reopened = await directLog.reopenMealForEdit(ctx.repo, ctx.user, ctx.now);
    if (!reopened) return { ok: false, local_reply: null, rejection_reason: "NOTHING_TO_UPDATE" };
    pending = reopened as unknown as PendingMeal;
  }

  const [ok, msg] = await corrections.changeLastQuantity(pending, ctx.rawText);
  if (!ok) {
    // فشل غير متوقَّع (مثلاً pending موجود لكن بلا عناصر إطلاقًا) — لو كان reopen حصل بهذا
    // الاستدعاء نفسه، لازم نحفظه كمسوّدة عادية (مو نتركه عالقًا بلا MealLog ولا pending محفوظ).
    await mealState.savePending(ctx.repo, ctx.user, pending);
    return { ok: false, local_reply: msg, rejection_reason: "NO_QUANTITY_FOUND" };
  }

  await mealState.savePending(ctx.repo, ctx.user, pending);
  return { ok: true, local_reply: `${msg}\n\n${summarizePending(pending)}`, requires_confirmation: true };
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
    "مرّر for_logging:true. **لو استدعيتها بالغلط لرسالة هي فعليًا تصحيح كمية وجبة سابقة (مثل \"لا " +
    "خليها 3\")، Backend يرفض الطلب الحرفي وينفّذ التصحيح الصحيح بدلاً عنه تلقائيًا (راجع " +
    "redirected_from_log_meal_to_update بالنتيجة) — هذا خط دفاع إضافي، مو بديل عن استدعاء " +
    "update_meal مباشرة أصلاً كما توثّقه هي.**",
  parameters: { type: "OBJECT", properties: {} },
  mutates: true,
  async execute(ctx: ToolExecContext): Promise<LogMealToolResult> {
    const { authorized, localIntent } = isConsumptionAuthorized(ctx.rawText, ctx.ctxFlags);
    if (!authorized) {
      // **Correction Guard** (خط الدفاع النهائي، backend لا يثق باختيار Gemini للأداة إطلاقًا):
      // لو المحرك المحلي الحتمي نفسه صنّف الرسالة كـCORRECTION/CHANGE_QUANTITY (يعتمد على بيانات
      // حقيقية: has_pending أو has_undoable_log خلال آخر 5 دقائق فقط — راجع intents.ts's
      // detectIntent)، فهذا يعني فعليًا "فيه وجبة حديثة قابلة للتعديل وهذي رسالة تصحيح كميتها" —
      // ننفّذ التصحيح الصحيح بدل رفض عام غامض، بغض النظر شنو أداة طلبها Gemini حرفيًا. هذا بالضبط
      // ما يمنع Bug حقيقي حي اكتُشف: "خلي البيض 3 حبات مو 2" كانت تُنشئ وجبة مكرَّرة بكمية خاطئة
      // (بيضة وحدة بدل 3) لأن Gemini اختار log_meal بدل update_meal — الآن النتيجة الفعلية لا
      // تعتمد على اختيار Gemini للأداة إطلاقًا، فقط على تحليل backend المستقل للنص + الحالة الحقيقية.
      if (localIntent === CORRECTION || localIntent === CHANGE_QUANTITY) {
        const updateResult = await performMealUpdate(ctx);
        return {
          ok: updateResult.ok, meal_logged: false, local_reply: updateResult.local_reply,
          redirected_from_log_meal_to_update: true, requires_confirmation: updateResult.requires_confirmation,
          rejection_reason: updateResult.rejection_reason,
        };
      }
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

export interface LogManualCaloriesArgs {
  calories: number;
  label?: string;
}

export interface LogManualCaloriesToolResult {
  ok: boolean;
  meal_logged: boolean;
  local_reply: string | null;
  rejection_reason?: "NOT_AUTHORIZED";
  [key: string]: unknown;
}

/**
 * "ضيف 500 سعرة للريوك" — تسجيل سعرات إضافية مباشرة بدون طعام محدد من foods.sqlite. استثناء
 * صريح وموثَّق لقاعدة "الأرقام من قاعدة البيانات فقط" (نفس سابقة orchestrator.ts's
 * logManualCalorieEntry المستخدمة أصلاً بواجهة "يومي الغذائي" اليدوية) — هنا رقم يُبلّغ عنه
 * المستخدم بنفسه بنفس رسالته، محروس بـintents.isManualCalorieLogAuthorized (فعل إضافة + كلمة
 * سعرات + الرقم نفسه موجود حرفيًا بالنص الخام)، صفر ثقة برقم calories المُمرَّر من Gemini وحده.
 */
export const logManualCalories: CJTool<LogManualCaloriesArgs, LogManualCaloriesToolResult> = {
  name: "log_manual_calories",
  description:
    "يسجّل سعرات إضافية مباشرة بدون طعام محدد من قاعدة البيانات — استخدمها فقط لما المستخدم يطلب " +
    'صراحة إضافة رقم سعرات ذكره هو بنفسه صراحة بنفس رسالته (مثلاً "ضيف 500 سعرة"، "زيدلي 300 سعرة ' +
    'للسناك") مع فعل إضافة واضح ("ضيف"/"زيد"/إلخ). calories يجب يطابق حرفيًا الرقم المذكور بالرسالة ' +
    "— ممنوع تخترع أو تقرّب رقم غير مذكور، وإلا يُرفض الاستدعاء هيكليًا بغض النظر عن أي معامل. label " +
    'اختياري (اسم مختصر لما ذكره المستخدم، مثلاً "ريوك") — لو ما ذكر اسمًا اتركه فاضيًا وسيُسمّى ' +
    '"سعرات إضافية" تلقائيًا. لا تستدعِها لطعام حقيقي معروف بالاسم (استخدم log_meal بدلها) ولا لسؤال ' +
    "أو نية مستقبلية.",
  parameters: {
    type: "OBJECT",
    properties: {
      calories: { type: "NUMBER", description: "عدد السعرات بالضبط كما ذكره المستخدم حرفيًا بنص رسالته" },
      label: { type: "STRING", description: "اسم مختصر اختياري لما ذكره المستخدم (فاضي لو ما ذكر شي)" },
    },
    required: ["calories"],
  },
  mutates: true,
  async execute(ctx: ToolExecContext, args: LogManualCaloriesArgs): Promise<LogManualCaloriesToolResult> {
    if (!isManualCalorieLogAuthorized(ctx.rawText, args?.calories)) {
      return { ok: false, meal_logged: false, local_reply: null, rejection_reason: "NOT_AUTHORIZED" };
    }
    const mealType = findMealType("", ctx.now);
    const label = args.label?.trim() || "سعرات إضافية";
    const result = await logManualCalorieEntry(ctx.repo, ctx.user, mealType, label, args.calories, 0, 0, 0, ctx.now);
    const { reply, meal_logged, ...rest } = result;
    return { ok: meal_logged === true, meal_logged, local_reply: reply, ...rest };
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

/**
 * "أكلت دولمة" (DIRECT_LOG فوري) ثم "لا خليها 3 حبات" — بدون هذي الأداة، Gemini بوضع ACTIVE كان
 * يرد نصيًا بس صفر تأثير حقيقي (Bug حقيقي اكتُشف بالبحث: decision.kind==="text" يرجع فورًا من
 * brain.ts's runConversationalTurn بدون ما يوصل لمنطق reopenMealForEdit/changeLastQuantity
 * إطلاقًا — المسار المحلي الحتمي ما يُستدعى أبدًا لأن outcome.handled=true أصلاً لرد نصي).
 *
 * هذي الأداة تعيد استخدام **نفس** منطق intent.CORRECTION الحتمي بالضبط (orchestrator.ts's
 * REOPEN_INTENTS+CORRECTION handling) — صفر منطق جديد: (1) مسوّدة موجودة أصلاً (pending_meal_json)
 * أو (2) آخر وجبة DIRECT_LOG خلال 5 دقائق (last_direct_log_json، تُعاد فتحها كمسوّدة قابلة للتعديل
 * وتُحذف نسختها المسجَّلة + تُرجَّع XP/الستريك — نفس directLog.reopenMealForEdit بالضبط). التعديل
 * نفسه (corrections.changeLastQuantity) يعتمد فقط على النص الخام الأصلي (ctx.rawText) — صفر ثقة
 * بأي كمية يدّعيها Gemini، نفس فلسفة log_meal تمامًا. **لا تُسجَّل الوجبة المعدَّلة تلقائيًا** —
 * تبقى مسوّدة بانتظار تأكيد صريح لاحق (نفس سلوك المسار المحلي الأصلي بالحرف، لمنع أي تسجيل مزدوج
 * أو تسجيل بدون تأكيد).
 */
export const updateMeal: CJTool<Record<string, never>, UpdateMealToolResult> = {
  name: "update_meal",
  description:
    "يعدّل كمية آخر طعام مذكور بوجبة قيد الإنشاء أو بآخر وجبة انسجّلت تلقائيًا خلال آخر 5 دقائق " +
    '("لا خليها 3 حبات"، "خليها 500 غرام") — استخدمها فقط لما المستخدم يصحّح كمية وجبة *سابقة* ' +
    'مو يبدأ وجبة جديدة كليًا. الرقم يُستخرَج من رسالة المستخدم الأصلية حصرًا (صفر ثقة بأي رقم ' +
    "تدّعيه بنفسك). **لا تسجّل الوجبة المعدَّلة تلقائيًا** — تبقى مسوّدة، لازم تأكيد صريح من " +
    "المستخدم بعدها (استدعِ log_meal فقط لما يأكّد).",
  parameters: { type: "OBJECT", properties: {} },
  mutates: true,
  async execute(ctx: ToolExecContext): Promise<UpdateMealToolResult> {
    return performMealUpdate(ctx);
  },
};

export const MUTATION_TOOLS: CJTool<any, any>[] = [logMeal, logWater, logManualCalories, undoLastMeal, updateMeal];
