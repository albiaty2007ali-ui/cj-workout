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
