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

describe("suggestPortionForFood — يعرض كل الكميات الحقيقية المعروفة، مو خيار وحدة بس", () => {
  it("بيضة (food_id=1، وحدة قياس وحيدة)، 500 سعرة متبقية -> يعرض 'حبة' (~78 kcal)", async () => {
    const reply = await suggestPortionForFood(1, "بيضة", 500);
    expect(reply).toBe("إذا مشتهي بيضة، هذي الكميات الحقيقية المعروفة إلي عنه 🌱:\n🍽️ حبة — ~78 kcal");
  });

  it("تمن (food_id=8، عدة وحدات بينها خاشوقة)، سعرات كافية -> يعرض كل الخيارات مرتّبة بالسعرات", async () => {
    const reply = await suggestPortionForFood(8, "تمن", 1000);
    expect(reply).toContain("🍽️ خاشوقة —");
    expect(reply).toContain("🍽️ كوب مطبوخ —");
    expect(reply).toContain("🍽️ صحن كبير —");
    expect(reply.indexOf("خاشوقة")).toBeLessThan(reply.indexOf("صحن كبير"));
  });

  it("سعرات متبقية صفر/سالبة تُعامل كـ'بلا حد' (نفس سلوك الأصل)، لا توسم أي خيار كـ'أعلى من الباقي'", async () => {
    const reply = await suggestPortionForFood(1, "بيضة", 0);
    expect(reply).not.toContain("أعلى من الباقي");
  });
});
