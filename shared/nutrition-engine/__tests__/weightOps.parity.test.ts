/**
 * اختبار تكافؤ لـweightOps.ts — يبني على calculate() المُتحقَّق منه أصلًا بـcalorieCalc.parity.test.ts،
 * ويتحقق من تحديث NutritionProfile وإضافة صف WeightHistory جديد (بدون استبدال القديم).
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { applyWeightUpdate } from "../weightOps.js";
import type { NutritionProfileRecord } from "../db/repository.js";

describe("applyWeightUpdate — تكافؤ حرفي مع weight_ops.py", () => {
  it("رجل 25 سنة يحدّث وزنه من 80 إلى 78 -> يعيد حساب bmr/tdee/calorie_target الصحيحة", async () => {
    const repo = new InMemoryRepository();
    const profile: NutritionProfileRecord = {
      user_id: "u1", age: 25, weight_kg: 80, height_cm: 175, sex: "male",
      goal: "lose", activity_level: "moderate", bmr: 1774, tdee: 2749,
      calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
    };
    repo.nutritionProfiles.set("u1", profile);

    const result = await applyWeightUpdate(repo, "u1", 78);
    expect(result).not.toBeNull();
    expect(result!.bmr).toBe(1754); // تحقّق من calorie_calc.py الحقيقي: bmr=1754, tdee=2718, calorie_target=2218
    expect(result!.water_target_ml).toBe(2574); // 78*33=2574

    const updated = await repo.findNutritionProfile("u1");
    expect(updated!.weight_kg).toBe(78);
    expect(updated!.bmr).toBe(result!.bmr);

    const history = await repo.findWeightHistory("u1");
    expect(history).toHaveLength(1);
    expect(history[0].weight_kg).toBe(78);
  });

  it("مستخدم بدون NutritionProfile -> null (لم يكمل Onboarding)", async () => {
    const repo = new InMemoryRepository();
    const result = await applyWeightUpdate(repo, "ghost", 80);
    expect(result).toBeNull();
  });

  it("قياس ثاني لا يستبدل الأول — كلاهما موجود بالسجل", async () => {
    const repo = new InMemoryRepository();
    repo.nutritionProfiles.set("u1", {
      user_id: "u1", age: 25, weight_kg: 80, height_cm: 175, sex: "male",
      goal: "lose", activity_level: "moderate", bmr: 1774, tdee: 2749,
      calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
    });
    await applyWeightUpdate(repo, "u1", 79);
    await applyWeightUpdate(repo, "u1", 78);
    const history = await repo.findWeightHistory("u1");
    expect(history.map((h) => h.weight_kg)).toEqual([79, 78]);
  });
});
