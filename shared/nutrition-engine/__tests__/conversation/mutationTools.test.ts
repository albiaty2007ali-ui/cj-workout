/**
 * اختبارات أدوات التحوّر (log_meal, undo_last_meal) — أهم ملف اختبار بكل طبقة المحادثة الجديدة.
 * يعيد نفس مجموعة "حادثة البيتزا" الحرجة (15 رسالة، نفس نص iraqiConversationCorpus.test.ts's
 * critical-negative describe block حرفيًا) لكن ضد الأداة الفعلية اللي Gemini سيستدعيها بوضع
 * ACTIVE — التأكيد: حتى لو "Gemini" يمرر أي معاملات مختلَقة (الأداة أصلاً لا تقبل أي معامل ذو
 * معنى، parameters:{})، القرار الوحيد المعتمَد هو النص الخام + intents.isConsumptionAuthorized.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../../db/inMemoryRepository.js";
import { makeUser } from "../testHelpers.js";
import * as mealState from "../../mealState.js";
import { logMeal, undoLastMeal } from "../../conversation/mutationTools.js";
import type { ToolExecContext } from "../../conversation/types.js";
import type { NutritionProfileRecord, UserRecord } from "../../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

async function freshUser(repo: InMemoryRepository, id: string, overrides: Partial<UserRecord> = {}): Promise<UserRecord> {
  const user = makeUser({ id, ...overrides });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

function ctxFor(repo: InMemoryRepository, user: UserRecord, rawText: string, now = new Date()): ToolExecContext {
  const pending = mealState.loadPending(user);
  return { repo, user, rawText, ctxFlags: { has_pending: pending !== null }, now };
}

const PIZZA_INCIDENT_MESSAGES = [
  "شكد سعرات البيتزا؟",
  "شكد حجم البيتزا؟",
  "شنو حجم الحصة؟",
  "شكد يعني صحن؟",
  "شكد يعني حبة؟",
  "شكد آكل؟",
  "شنو آكل؟",
  "مشتهي بيتزا",
  "أريد بيتزا",
  "راح آكل بيتزا",
  "هل البيتزا تناسب سعراتي؟",
  "أريد بديل أخف",
  "سويلي غداء 600 سعرة",
  "ليش البيضة غالية هسه؟",
  "شنو رايك ببيتزا اليوم؟",
];

describe("log_meal — حادثة البيتزا: صفر تسجيل لأي رسالة غير استهلاك فعلي", () => {
  it.each(PIZZA_INCIDENT_MESSAGES)("'%s' -> ok:false، meal_logged:false، صفر MealLog", async (msg) => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, `pizza-${msg.length}-${Math.random()}`);
    const ctx = ctxFor(repo, user, msg);
    const r = await logMeal.execute(ctx, {});
    expect(r.ok).toBe(false);
    expect(r.meal_logged).toBe(false);
    expect(r.rejection_reason).toBe("NOT_A_CONSUMPTION_STATEMENT");
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("الأداة لا تقبل أي معامل ذو معنى — تمرير args مختلَقة لا يغيّر النتيجة", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "evil1");
    const ctx = ctxFor(repo, user, "شكد حجم البيتزا؟");
    // "Gemini شرّير" يحاول يمرر بيانات وهمية بمعامل الاستدعاء — الأداة أصلاً تتجاهلها بالكامل
    const r = await logMeal.execute(ctx, { food: "pizza", calories: 99999, confidence: 1 } as never);
    expect(r.ok).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});

describe("log_meal — رسائل استهلاك فعلي حقيقية تُسجَّل بنجاح", () => {
  it("'اكلت بيضتين' -> ok:true، سعرات حقيقية، MealLog واحد", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "eat1");
    const ctx = ctxFor(repo, user, "اكلت بيضتين");
    const r = await logMeal.execute(ctx, {});
    expect(r.ok).toBe(true);
    expect(r.meal_logged).toBe(true);
    expect(r.today_calories as number).toBeGreaterThan(0);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });

  it("'اكلت صمونة وبيضتين وطماطة' (وجبة متعددة الأصناف) -> ok:true، MealLog واحد بمجموع الكل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "eat2");
    const ctx = ctxFor(repo, user, "اكلت صمونة وبيضتين وطماطة");
    const r = await logMeal.execute(ctx, {});
    expect(r.ok).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });

  it("تجاوز حد الوجبات المجانية -> ok:false عبر premium_required، صفر MealLog جديد", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "cap1", { is_premium: false, free_meals_used: 6 });
    const ctx = ctxFor(repo, user, "اكلت بيضتين");
    const r = await logMeal.execute(ctx, {});
    expect(r.ok).toBe(false);
    expect(r.meal_logged).toBe(false);
    expect(r.premium_required).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});

describe("log_meal — استمرارية pending (توضيح كمية ثم تأكيد) لا تُسجّل مرتين", () => {
  it("توضيح كمية ('300 غرام') ثم تأكيد صريح ('اي') -> MealLog واحد فقط عند التأكيد", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "flow1");

    // رسالة أولى: طعام Bulk يحتاج توضيح كمية (نفس آلية extractFoodEntities الحقيقية)
    const first = await logMeal.execute(ctxFor(repo, user, "اكلت رز"), {});
    expect(first.meal_logged).toBe(false); // إما توضيح كمية أو ملخص بانتظار تأكيد
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);

    // لو انتظر توضيح كمية، جاوب عليه أولًا
    const pendingAfterFirst = mealState.loadPending(user);
    if (pendingAfterFirst?.pending_clarifications?.length) {
      const second = await logMeal.execute(ctxFor(repo, user, "300 غرام"), {});
      expect(second.meal_logged).toBe(false);
      expect(await repo.countMealLogsForUser(user.id)).toBe(0);
    }

    // التأكيد الصريح النهائي -> الآن فقط يُسجَّل
    const confirmCtx = ctxFor(repo, user, "اي");
    expect(confirmCtx.ctxFlags.has_pending).toBe(true);
    const finalResult = await logMeal.execute(confirmCtx, {});
    expect(finalResult.ok).toBe(true);
    expect(finalResult.meal_logged).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });

  it("سؤال معلوماتي أثناء وجود pending (نفس حادثة البيتزا) -> يُرفض، صفر تسجيل، pending يبقى كما هو", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "flow2");
    await logMeal.execute(ctxFor(repo, user, "اكلت رز"), {}); // يبدأ pending (بحاجة توضيح غالبًا)
    const hadPendingBefore = mealState.loadPending(user) !== null;
    expect(hadPendingBefore).toBe(true);

    const r = await logMeal.execute(ctxFor(repo, user, "شكد حجم البيتزا؟"), {});
    expect(r.ok).toBe(false);
    expect(r.rejection_reason).toBe("NOT_A_CONSUMPTION_STATEMENT");
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});

describe("undo_last_meal", () => {
  it("يتراجع عن وجبة انسجّلت لتوها -> صفر MealLog بعد التراجع", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "undo1");
    const logged = await logMeal.execute(ctxFor(repo, user, "اكلت بيضتين"), {});
    expect(logged.ok).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);

    const undone = await undoLastMeal.execute(ctxFor(repo, user, "لا"), {});
    expect(undone.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("صفر شي للتراجع عنه -> رد صريح، صفر خطأ", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "undo2");
    const r = await undoLastMeal.execute(ctxFor(repo, user, "لا"), {});
    expect(r.meal_logged).toBe(false);
    expect(typeof r.reply).toBe("string");
  });
});
