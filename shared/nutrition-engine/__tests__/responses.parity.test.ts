/**
 * اختبارات تكافؤ لـresponses.ts — الدوال العشوائية (random.choice) تُختبر بأن الناتج ضمن
 * مجموعة القوالب الصحيحة (السلوك أصلًا عشوائي بكلا اللغتين، لا معنى لمطابقة نص واحد)، والدوال
 * الحتمية (itemsInline/remainingMacro) تُختبر بمطابقة حرفية ضد قيم Python الحقيقية:
 *
 *   items_inline([{بيضة,qty=2},{صمونة}]) -> 'بيضة ×2 + صمونة'
 *   items_inline([{بيضة,qty=1.0}])        -> 'بيضة'
 *   items_inline([{تمر,qty=2.5}])         -> 'تمر ×2.5'
 *   remaining_macro('بروتين', 45.6, 160)  -> 'باقيلك تقريبًا 46 غم بروتين من أصل 160 غم اليوم.'
 *   remaining_macro('بروتين', 0, 160)     -> 'وصلت هدفك اليومي من بروتين (160 غم تقريبًا) — عاشت إيدك 💪'
 */
import { describe, it, expect } from "vitest";
import * as responses from "../responses.js";

describe("itemsInline — تكافؤ حرفي", () => {
  it("عنصر بكمية 2 + عنصر بدون كمية", () => {
    expect(responses.itemsInline([{ food_name: "بيضة", quantity: 2 }, { food_name: "صمونة" }])).toBe("بيضة ×2 + صمونة");
  });

  it("كمية = 1 لا تُعرض", () => {
    expect(responses.itemsInline([{ food_name: "بيضة", quantity: 1 }])).toBe("بيضة");
  });

  it("كمية كسرية (2.5) تُعرض كما هي", () => {
    expect(responses.itemsInline([{ food_name: "تمر", quantity: 2.5 }])).toBe("تمر ×2.5");
  });
});

describe("remainingMacro — تكافؤ حرفي", () => {
  it("متبقي فعلي -> يقرّب ويعرض الرسالة الصحيحة", () => {
    expect(responses.remainingMacro("بروتين", 45.6, 160)).toBe("باقيلك تقريبًا 46 غم بروتين من أصل 160 غم اليوم.");
  });

  it("وصل للهدف بالضبط (0) -> رسالة الإنجاز", () => {
    expect(responses.remainingMacro("بروتين", 0, 160)).toBe("وصلت هدفك اليومي من بروتين (160 غم تقريبًا) — عاشت إيدك 💪");
  });

  it("تجاوز الهدف (سالب) -> نفس رسالة الإنجاز أيضًا", () => {
    expect(responses.remainingMacro("بروتين", -5, 160)).toBe("وصلت هدفك اليومي من بروتين (160 غم تقريبًا) — عاشت إيدك 💪");
  });
});

describe("القوالب العشوائية — نفس عدد الخيارات، والناتج دائمًا من ضمنها", () => {
  it("GREETING_TEMPLATES و MEAL_LOGGED_TEMPLATES بنفس عدد بايثون (10 لكل واحدة)", () => {
    expect(responses.GREETING_TEMPLATES).toHaveLength(10);
    expect(responses.MEAL_LOGGED_TEMPLATES).toHaveLength(10);
  });

  it("greeting() يرجع دائمًا نص من ضمن GREETING_TEMPLATES", () => {
    for (let i = 0; i < 20; i++) {
      expect(responses.GREETING_TEMPLATES).toContain(responses.greeting());
    }
  });

  it("mealLogged يستبدل {meal} بالاسم الصحيح (الفطور/الغداء/العشاء/السناك)", () => {
    for (let i = 0; i < 15; i++) {
      expect(responses.mealLogged("lunch")).toContain("الغداء");
    }
  });

  it("compensationNote يختار من القائمة الصحيحة حسب mild", () => {
    for (let i = 0; i < 10; i++) {
      expect(responses.COMPENSATION_MILD_TEMPLATES).toContain(responses.compensationNote(true));
      expect(responses.COMPENSATION_HIGH_TEMPLATES).toContain(responses.compensationNote(false));
    }
  });

  it("clarifyConfirmMatch يستبدل {food} بشكل صحيح", () => {
    expect(responses.clarifyConfirmMatch("دولمة")).toContain("دولمة");
  });

  it("generalNutritionAnswer(topic غير معروف) -> يرجع من generic", () => {
    expect(responses.GENERAL_NUTRITION_TEMPLATES.generic).toContain(responses.generalNutritionAnswer("unknown_topic"));
  });
});
