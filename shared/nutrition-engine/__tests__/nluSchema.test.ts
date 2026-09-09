/**
 * تحقّق صارم من استجابة Gemini NLU (knownIntents.ts's validateNluResult) — كل حالة هنا تمثّل
 * شكل استجابة فعلي ممكن يرجعه LLM (كامل صحيح، ناقص، نية مو موجودة بلائحتنا، نوع بيانات خاطئ...).
 * الاختبار الأهم هنا (بند 20 بالطلب): should_log_meal=true مع intent=LOG_MEAL يجب يُرفَض دايمًا،
 * لأن LOG_MEAL أصلاً مستثناة من NLU_ALLOWED_INTENTS — هذا هو حاجز الأمان البرمجي، مو مجرد وعد.
 */
import { describe, it, expect } from "vitest";
import { validateNluResult, NLU_ALLOWED_INTENTS } from "../nlu/knownIntents.js";

function validResult(overrides: Record<string, unknown> = {}) {
  return {
    intent: "ASK_CALORIES",
    confidence: 0.9,
    action: "QUESTION",
    should_log_meal: false,
    entities: { food_query: "بيتزا", quantity: null, unit: null, target_calories: null, meal_type: null },
    ...overrides,
  };
}

describe("validateNluResult — تحقّق صارم قبل الثقة بأي استجابة من Gemini", () => {
  it("استجابة كاملة وصحيحة -> تُقبل، وكل الحقول تنتقل بالضبط", () => {
    const r = validateNluResult(validResult());
    expect(r).not.toBeNull();
    expect(r!.intent).toBe("ASK_CALORIES");
    expect(r!.entities.food_query).toBe("بيتزا");
  });

  it("نية LOG_MEAL (مستثناة عمدًا من اللائحة المسموحة) -> تُرفض حتى لو should_log_meal=true (Bug أمان حرج، بند 20)", () => {
    expect(NLU_ALLOWED_INTENTS.has("LOG_MEAL")).toBe(false);
    const r = validateNluResult(validResult({ intent: "LOG_MEAL", should_log_meal: true }));
    expect(r).toBeNull();
  });

  it("نية مو موجودة بلائحتنا إطلاقًا (اختراع من الموديل) -> تُرفض", () => {
    const r = validateNluResult(validResult({ intent: "SOME_MADE_UP_INTENT" }));
    expect(r).toBeNull();
  });

  it("نية CONFIRM (مستثناة عمدًا — تعتمد على pending state دقيق) -> تُرفض", () => {
    const r = validateNluResult(validResult({ intent: "CONFIRM" }));
    expect(r).toBeNull();
  });

  it("confidence خارج المدى [0,1] -> تُرفض", () => {
    expect(validateNluResult(validResult({ confidence: 1.5 }))).toBeNull();
    expect(validateNluResult(validResult({ confidence: -0.1 }))).toBeNull();
  });

  it("confidence نص بدل رقم -> تُرفض", () => {
    expect(validateNluResult(validResult({ confidence: "high" }))).toBeNull();
  });

  it("action غير مدرجة (مو QUESTION/STATEMENT/REQUEST) -> تُرفض", () => {
    expect(validateNluResult(validResult({ action: "COMMAND" }))).toBeNull();
  });

  it("should_log_meal نص بدل boolean -> تُرفض", () => {
    expect(validateNluResult(validResult({ should_log_meal: "false" }))).toBeNull();
  });

  it("entities مفقودة كليًا -> تُرفض", () => {
    const bad = validResult();
    delete (bad as Record<string, unknown>).entities;
    expect(validateNluResult(bad)).toBeNull();
  });

  it("entities.quantity كنص بدل رقم -> يتحوّل null بأمان (مو رفض كامل، فقط الحقل نفسه)", () => {
    const r = validateNluResult(validResult({ entities: { ...validResult().entities, quantity: "اثنين" } }));
    expect(r).not.toBeNull();
    expect(r!.entities.quantity).toBeNull();
  });

  it("food_query سلسلة فاضية -> تتحوّل null (مو نص فاضي مضلّل)", () => {
    const r = validateNluResult(validResult({ entities: { ...validResult().entities, food_query: "" } }));
    expect(r!.entities.food_query).toBeNull();
  });

  it("JSON من نوع مصفوفة بدل كائن -> تُرفض", () => {
    expect(validateNluResult(["not", "an", "object"])).toBeNull();
  });

  it("null كامل -> تُرفض بأمان", () => {
    expect(validateNluResult(null)).toBeNull();
  });

  it("سلسلة نصية عشوائية (فشل JSON.parse قبل هذا أصلاً، لكن دفاع إضافي) -> تُرفض", () => {
    expect(validateNluResult("مو JSON")).toBeNull();
  });

  it("كل نيات NLU_ALLOWED_INTENTS تُقبل فرديًا (تغطية شاملة للائحة)", () => {
    for (const intent of NLU_ALLOWED_INTENTS) {
      const r = validateNluResult(validResult({ intent }));
      expect(r, `intent ${intent} يجب يُقبل`).not.toBeNull();
    }
  });
});
