/**
 * اختبارات تكافؤ لـentities.ts — تشغّل ضد foods.sqlite الحقيقي، والتوقعات مأخوذة من تشغيل
 * nutrition_ai/entities.py الحقيقي مباشرة (python3) لنفس الرسائل، بما فيها حالة فازي حقيقية.
 */
import { describe, it, expect } from "vitest";
import { extractFoodEntities } from "../entities.js";

describe("extractFoodEntities — تكافؤ حرفي مع entities.py", () => {
  it("'اكلت بيضتين' -> resolved مباشرة، صفر clarifications", async () => {
    const r = await extractFoodEntities("اكلت بيضتين");
    expect(r.clarifications).toHaveLength(0);
    expect(r.resolved).toHaveLength(1);
    expect(r.resolved[0]).toMatchObject({ food_id: 1, food_name: "بيضة", grams: 100 });
  });

  it("'اكلت بيظتين' (خطأ إملائي) -> confirm_match بثقة 0.833 لـ'بيضتين' (ليس resolved تلقائيًا)", async () => {
    const r = await extractFoodEntities("اكلت بيظتين");
    expect(r.resolved).toHaveLength(0);
    expect(r.clarifications).toHaveLength(1);
    const c = r.clarifications[0];
    expect(c.kind).toBe("confirm_match");
    if (c.kind === "confirm_match") {
      expect(c.food_id).toBe(1);
      expect(c.food_name).toBe("بيضة");
      expect(c.confidence).toBeCloseTo(0.833, 3);
      expect(c.raw_token).toBe("بيظتين");
    }
  });

  it("'اكلت تمرات' (جمع بدون رقم، is_plural_unspecified) -> clarification kind=quantity", async () => {
    const r = await extractFoodEntities("اكلت تمرات");
    expect(r.resolved).toHaveLength(0);
    expect(r.clarifications).toHaveLength(1);
    expect(r.clarifications[0]).toMatchObject({ kind: "quantity", food_id: 40, food_name: "تمرة" });
  });
});
