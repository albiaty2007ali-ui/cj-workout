/**
 * اختبارات تكافؤ لـcalorieCalc.ts/macros.ts/safety.ts — القيم المتوقعة مأخوذة من تشغيل
 * calorie_calc.py + nutrition_ai/macros.py الحقيقيين مباشرة (python3) لنفس البروفايلات.
 */
import { describe, it, expect } from "vitest";
import { calculate } from "../calorieCalc.js";
import { calculateTargets } from "../macros.js";

describe("calculate (BMR/TDEE) — تكافؤ حرفي مع calorie_calc.py", () => {
  it("رجل 25 سنة، 80كغ، 175سم، هدف نزول، نشاط متوسط", () => {
    const r = calculate(25, 80, 175, "male", "lose", "moderate");
    expect(r).toEqual({ bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, safety_warning: null });
    const m = calculateTargets(r.calorie_target, 80, "lose");
    expect(m).toEqual({ protein_g: 160, carbs_g: 263, fat_g: 62 });
  });

  it("امرأة 30 سنة، 65كغ، 160سم، هدف زيادة، نشاط خفيف", () => {
    const r = calculate(30, 65, 160, "female", "gain", "light");
    expect(r).toEqual({ bmr: 1339, tdee: 1841, calorie_target: 2241, water_target_ml: 2145, safety_warning: null });
    const m = calculateTargets(r.calorie_target, 65, "gain");
    expect(m).toEqual({ protein_g: 117, carbs_g: 304, fat_g: 62 });
  });

  it("امرأة 22 سنة، 50كغ، هدف نزول خامل -> يضرب الحد الأدنى الآمن (1000) + تحذير حرفي", () => {
    const r = calculate(22, 50, 150, "female", "lose", "sedentary");
    expect(r.bmr).toBe(1166);
    expect(r.tdee).toBe(1400);
    expect(r.calorie_target).toBe(1000);
    expect(r.water_target_ml).toBe(1650);
    expect(r.safety_warning).toBe(
      "هدف السعرات المحسوب كان منخفض جدًا حسب بياناتك، فرفعناه للحد الآمن الأدنى. " +
      "إذا تحتاج نزول أسرع، استشر مختص تغذية بدل تقليل السعرات بشكل كبير.",
    );
    const m = calculateTargets(r.calorie_target, 50, "lose");
    expect(m).toEqual({ protein_g: 100, carbs_g: 87, fat_g: 28 });
  });

  it("رجل 40 سنة، 100كغ، نشاط عالي جدًا، هدف نزول", () => {
    const r = calculate(40, 100, 190, "male", "lose", "very_active");
    expect(r).toEqual({ bmr: 1992, tdee: 3437, calorie_target: 2937, water_target_ml: 3300, safety_warning: null });
    const m = calculateTargets(r.calorie_target, 100, "lose");
    expect(m).toEqual({ protein_g: 200, carbs_g: 350, fat_g: 82 });
  });
});
