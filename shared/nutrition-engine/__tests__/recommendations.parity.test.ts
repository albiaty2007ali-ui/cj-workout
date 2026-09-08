/**
 * اختبارات تكافؤ لـrecommendations.ts — تشغّل ضد foods.sqlite الحقيقي، القيم المتوقعة من
 * تشغيل nutrition_ai/recommendations.py الحقيقي مباشرة (python3):
 *
 *   suggest_meal_within(300, 0):
 *     "بما إن باقيلك تقريبًا 300 سعرة، أقترحلك:
 *      • دجاج مشوي (قطعة صغيرة) — ~165 kcal
 *      • لحم مشوي (قطعة صغيرة) — ~250 kcal
 *      • تكة (سيخ) — ~220 kcal"
 *   suggest_meal_near_target(500): برياني/مسكوف/شاورما (495/475/550 kcal)
 *   suggest_portion_for_food(1, 'بيضة', 500): "... أقترح تقريبًا حبة — ~78 kcal."
 */
import { describe, it, expect } from "vitest";
import { suggestMealWithin, suggestMealNearTarget, suggestPortionForFood } from "../recommendations.js";

describe("suggestMealWithin — تكافؤ حرفي", () => {
  it("300 سعرة متبقية -> نفس الترتيب والأرقام الحقيقية (مرجّح بالبروتين تنازليًا)", async () => {
    const reply = await suggestMealWithin(300, 0);
    expect(reply).toBe(
      "بما إن باقيلك تقريبًا 300 سعرة، أقترحلك:\n" +
      "• دجاج مشوي (قطعة صغيرة) — ~165 kcal\n" +
      "• لحم مشوي (قطعة صغيرة) — ~250 kcal\n" +
      "• تكة (سيخ) — ~220 kcal",
    );
  });

  it("صفر سعرات متبقية -> رسالة خاصة، صفر اقتراحات", async () => {
    const reply = await suggestMealWithin(0);
    expect(reply).toBe("خلصت سعراتك اليوم، بس اذا لسا جوعان جرب سلطة أو خضار قليلة السعرات جدًا.");
  });
});

describe("suggestMealNearTarget — تكافؤ حرفي", () => {
  it("500 سعرة -> برياني/مسكوف/شاورما بنفس الترتيب والأرقام", async () => {
    const reply = await suggestMealNearTarget(500);
    expect(reply).toBe(
      "هذي أقرب خيارات لـ500 سعرة تقريبًا:\n" +
      "• برياني (صحن صغير) — تقريبًا 495 kcal\n" +
      "• مسكوف (حصة) — تقريبًا 475 kcal\n" +
      "• شاورما (لفة) — تقريبًا 550 kcal",
    );
  });
});

describe("suggestPortionForFood — تكافؤ حرفي", () => {
  it("بيضة (food_id=1)، 500 سعرة متبقية -> يقترح 'حبة' (~78 kcal)", async () => {
    const reply = await suggestPortionForFood(1, "بيضة", 500);
    expect(reply).toBe("إذا مشتهي بيضة، نكدر نخليها بكمية مناسبة لسعراتك 🌱\nأقترح تقريبًا حبة — ~78 kcal.");
  });
});
