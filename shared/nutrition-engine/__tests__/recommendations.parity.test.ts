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
import { suggestMealWithin, suggestMealNearTarget, suggestPortionForFood, suggestPortionCountForRemaining } from "../recommendations.js";

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

  it("excludeNames يستبعد فعليًا طعامًا مرفوضًا (ذاكرة محادثة، راجع conversation/tools.ts's recommend_foods)", async () => {
    const reply = await suggestMealWithin(300, 0, ["دجاج"]);
    expect(reply).not.toContain("دجاج مشوي");
    expect(reply).toContain("لحم مشوي");
    expect(reply).toContain("تكة");
  });

  it("excludeNames فاضية (افتراضي) -> صفر تغيير بالسلوك الحالي", async () => {
    const reply = await suggestMealWithin(300, 0, []);
    expect(reply).toContain("دجاج مشوي");
  });
});

describe("suggestMealNearTarget — تكافؤ حرفي", () => {
  it("500 سعرة -> شاورما دجاج/مسكوف/شاورما (بعد توحيد قياس الأطعمة السائبة بخاشوقة، برياني/تبسي باذنجان صاروا حصص صغيرة جدًا فما يقتربون من 500 وحدهم)", async () => {
    // تحديث حقيقي (مو Regression): طلب المستخدم توحيد وحدة الأطعمة السائبة (برياني/تبسي باذنجان/
    // إلخ) بـ"خاشوقة" فقط بدل صحن/ماعون — حصة الخاشوقة صارت صغيرة جدًا (~20-45 kcal) فما تعود
    // ضمن أقرب الخيارات لـ500 سعرة كوجبة واحدة، بعكس شاورما دجاج/شاورما (لفة كاملة) اللي قربهم
    // الفعلي من 500 صار أوضح. تحقق مباشر ضد foods.sqlite الحقيقي بعد إعادة البناء.
    const reply = await suggestMealNearTarget(500);
    expect(reply).toBe(
      "هذي أقرب خيارات لـ500 سعرة تقريبًا:\n" +
      "• شاورما دجاج (لفة) — تقريبًا 484 kcal\n" +
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

describe("suggestPortionCountForRemaining — 'اليوم غدانا تمن': عدد دقيق (قسمة صحيحة)، صفر مدى مخترَع", () => {
  it("تمن (food_id=8، أصغر حصة=خاشوقة 15غ~20kcal بعد التقريب)، 300 سعرة متبقية -> 15 خاشوقة بالضبط", async () => {
    const reply = await suggestPortionCountForRemaining(8, "تمن", 300);
    expect(reply).toBe("باقيلك تقريبًا 300 سعرة، يمديك تاكل لغاية 15 خاشوقة من تمن (~300 سعرة تقريبًا).");
  });

  it("سعرات متبقية أقل من أصغر حصة -> رد صادق إنها ما تدخل، صفر عدد وهمي", async () => {
    const reply = await suggestPortionCountForRemaining(8, "تمن", 5);
    expect(reply).toContain("أعلى من الباقي");
    expect(reply).not.toMatch(/لغاية \d+ خاشوقة/);
  });

  it("صفر سعرات متبقية (وصل الهدف) -> رد صادق بتأجيل الوجبة، صفر اختراع عدد", async () => {
    const reply = await suggestPortionCountForRemaining(8, "تمن", 0);
    expect(reply).toContain("وصلت لهدفك");
  });
});
