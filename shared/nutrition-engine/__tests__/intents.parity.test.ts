/**
 * اختبارات تكافؤ لـintents.ts — كل حالة هنا شُغّلت فعليًا ضد nutrition_ai/intents.py الحقيقي
 * (python3 مباشرة) قبل كتابة التوقع، وليست افتراضًا نظريًا. تغطي أشهر بگات هذا المشروع
 * الموثّقة بـCLAUDE.md ("راح اكل دولمه" و"مشتهي اكل دولمه").
 */
import { describe, it, expect } from "vitest";
import { normalize } from "../arabicNormalize.js";
import { detectIntent } from "../intents.js";

const norm = (t: string) => normalize(t);

describe("detectIntent — تكافؤ حرفي مع Python (قيم حقيقية من تشغيل مباشر)", () => {
  it("'راح اكل دولمة' -> PLAN_TO_EAT (مو LOG_MEAL — باگ الشاشات الأصلي)", () => {
    expect(detectIntent(norm("راح اكل دولمة"), {})).toBe("PLAN_TO_EAT");
  });

  it("'مشتهي دولمة' -> EXPRESS_CRAVING (مو ASK_RECIPE — باگ الفازي ماتش الأصلي)", () => {
    expect(detectIntent(norm("مشتهي دولمة"), {})).toBe("EXPRESS_CRAVING");
  });

  it("'اكلت بيضتين' -> LOG_MEAL", () => {
    expect(detectIntent(norm("اكلت بيضتين"), {})).toBe("LOG_MEAL");
  });

  it("'اريد بيض' -> EXPRESS_DESIRE (مو LOG_MEAL)", () => {
    expect(detectIntent(norm("اريد بيض"), {})).toBe("EXPRESS_DESIRE");
  });

  it("'شكد باقيلي' -> ASK_REMAINING", () => {
    expect(detectIntent(norm("شكد باقيلي"), {})).toBe("ASK_REMAINING");
  });

  it("'شنو فايدة البروتين' -> GENERAL_NUTRITION", () => {
    expect(detectIntent(norm("شنو فايدة البروتين"), {})).toBe("GENERAL_NUTRITION");
  });

  it("'اكلت بروتين بار' -> LOG_MEAL (الشرط المركّب لا يخطف تسجيل وجبة حقيقي)", () => {
    expect(detectIntent(norm("اكلت بروتين بار"), {})).toBe("LOG_MEAL");
  });

  it("'مشتهي دولمه شكد لازم اكل' -> ASK_PORTION_FOR_FOOD (أولوية سؤال الكمية فوق الاشتهاء)", () => {
    expect(detectIntent(norm("مشتهي دولمه شكد لازم اكل"), {})).toBe("ASK_PORTION_FOR_FOOD");
  });

  it("'اي' مع has_pending -> CONFIRM", () => {
    expect(detectIntent(norm("اي"), { has_pending: true })).toBe("CONFIRM");
  });

  it("'اي' مع has_undoable_log فقط (بدون has_pending) -> LOG_MEAL (ليست ضمن UNDO_PHRASES)", () => {
    expect(detectIntent(norm("اي"), { has_undoable_log: true })).toBe("LOG_MEAL");
  });

  it("'اي' بدون أي سياق -> ACKNOWLEDGEMENT", () => {
    expect(detectIntent(norm("اي"), {})).toBe("ACKNOWLEDGEMENT");
  });

  it("'لا' مع has_pending_food_topic -> CANCEL", () => {
    expect(detectIntent(norm("لا"), { has_pending_food_topic: true })).toBe("CANCEL");
  });

  it("'هلا' -> GREETING", () => {
    expect(detectIntent(norm("هلا"), {})).toBe("GREETING");
  });

  it("'هلا اكلت بيضتين وصمونة' -> LOG_MEAL (رسالة أكل حقيقية لا تُبتلع بكلمة ترحيب)", () => {
    expect(detectIntent(norm("هلا اكلت بيضتين وصمونة"), {})).toBe("LOG_MEAL");
  });

  it("'شربت نص لتر' -> WATER_LOG", () => {
    expect(detectIntent(norm("شربت نص لتر"), {})).toBe("WATER_LOG");
  });

  it("'وزني هسه 80' -> WEIGHT_UPDATE", () => {
    expect(detectIntent(norm("وزني هسه 80"), {})).toBe("WEIGHT_UPDATE");
  });

  it("'اكلتها' مع has_pending_recipe -> CONFIRM", () => {
    expect(detectIntent(norm("اكلتها"), { has_pending_recipe: true })).toBe("CONFIRM");
  });

  it("'بعدني' مع has_pending_recipe -> NOT_YET", () => {
    expect(detectIntent(norm("بعدني"), { has_pending_recipe: true })).toBe("NOT_YET");
  });
});

/**
 * حارس الأمان العام + الأسئلة المعلوماتية الجديدة (مرحلة 1+2 من طلب تصحيح Gemini/Intent System) —
 * Bug حقيقي انكشف أثناء الفحص: "شكد حجم البيتزا؟" كانت تُسجَّل كوجبة أكل فعلية (293 سعرة) لأن
 * "بيتزا" تتطابق بثقة كاملة وماكو حارس يفرّق سؤال معلوماتي عن استهلاك حقيقي. كل حالة هنا شُغّلت
 * فعليًا ضد detectIntent الحقيقي (orchestrator.ts/intents.ts) قبل كتابة التوقع.
 */
describe("حارس الأمان العام (looksLikeQuestion) — منع تسجيل أي سؤال كوجبة", () => {
  it("'شكد حجم البيتزا؟' -> ASK_FOOD_SIZE (مو LOG_MEAL — الـBug الحقيقي المُصلَح)", () => {
    expect(detectIntent(norm("شكد حجم البيتزا؟"), {})).toBe("ASK_FOOD_SIZE");
  });

  it("'شكد سعرات البيتزا؟' -> ASK_CALORIES (مو LOG_MEAL)", () => {
    expect(detectIntent(norm("شكد سعرات البيتزا؟"), {})).toBe("ASK_CALORIES");
  });

  it("'هل البيتزا تناسب سعراتي؟' -> ASK_FOOD_FIT (مو LOG_MEAL)", () => {
    expect(detectIntent(norm("هل البيتزا تناسب سعراتي؟"), {})).toBe("ASK_FOOD_FIT");
  });

  it("'شكد يعني صحن؟' -> ASK_UNIT (سؤال وحدة عام بدون طعام محدد)", () => {
    expect(detectIntent(norm("شكد يعني صحن؟"), {})).toBe("ASK_UNIT");
  });

  it("'شكد يعني خاشوقة؟' -> ASK_UNIT", () => {
    expect(detectIntent(norm("شكد يعني خاشوقة؟"), {})).toBe("ASK_UNIT");
  });

  it("'أريد بديل أخف' -> ASK_SUBSTITUTION (مو EXPRESS_DESIRE رغم كلمة 'أريد')", () => {
    expect(detectIntent(norm("أريد بديل أخف"), {})).toBe("ASK_SUBSTITUTION");
  });

  it("'شنو حجم الحصة؟' بدون اسم طعام -> ASK_FOOD_SIZE (يوجّه لمعالج آمن، مو LOG_MEAL)", () => {
    expect(detectIntent(norm("شنو حجم الحصة؟"), {})).toBe("ASK_FOOD_SIZE");
  });

  it("سؤال عام غير مطابق لأي نية محددة ('ليش الدولمة حلوة؟') -> ASK_GENERAL_FOOD_INFO، مو LOG_MEAL", () => {
    expect(detectIntent(norm("ليش الدولمة حلوة؟"), {})).toBe("ASK_GENERAL_FOOD_INFO");
  });

  it("'اكلت بيضتين، شكد سعراتها؟' -> ASK_CALORIES (عبارة سؤال محددة تسبق LOG_MEAL بالأولوية حتى مع فعل استهلاك؛ صفر تسجيل وهمي بأي الحالتين)", () => {
    expect(detectIntent(norm("اكلت بيضتين، شكد سعراتها؟"), {})).toBe("ASK_CALORIES");
  });

  it("'اكلت بيضتين' (بدون أي أداة استفهام) -> LOG_MEAL كما هو، صفر تأثير من الحارس الجديد", () => {
    expect(detectIntent(norm("اكلت بيضتين"), {})).toBe("LOG_MEAL");
  });

  it("'راح آكل بيتزا' -> PLAN_TO_EAT (يبقى يعمل، ما تحول لسؤال رغم عدم وجود فعل استهلاك)", () => {
    expect(detectIntent(norm("راح آكل بيتزا"), {})).toBe("PLAN_TO_EAT");
  });

  it("'مشتهي بيتزا' -> EXPRESS_CRAVING (يبقى يعمل)", () => {
    expect(detectIntent(norm("مشتهي بيتزا"), {})).toBe("EXPRESS_CRAVING");
  });

  it("'مشتهي دولمة' ثم 'أريدها 500 سعرة' مع has_pending_food_topic -> ASK_PORTION_FOR_FOOD (رقم هدف يخص نفس موضوع الطعام)", () => {
    expect(detectIntent(norm("أريدها 500 سعرة"), { has_pending_food_topic: true })).toBe("ASK_PORTION_FOR_FOOD");
  });

  it("'سويلي الغداء 600 سعرة' -> ASK_CALORIE_TARGET_MEAL (صيغة أوسع من العبارات الثابتة الأصلية)", () => {
    expect(detectIntent(norm("سويلي الغداء 600 سعرة"), {})).toBe("ASK_CALORIE_TARGET_MEAL");
  });
});
