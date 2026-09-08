/**
 * اختبارات تكافؤ لـcontext.ts وtipsEngine.ts وcalculator.ts's todayTotals/todayWaterMl/
 * mealsByTypeForDay (الجزء المعتمد على Repository) — عبر InMemoryRepository. قيم
 * chooseCategoryForContext مأخوذة من تشغيل tips_engine.py الحقيقي لكل فرع منطقي على حدة.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { chooseCategoryForContext, pickTip } from "../tipsEngine.js";
import { build } from "../context.js";
import { todayTotals, todayWaterMl, mealsByTypeForDay } from "../calculator.js";
import { nowBaghdad } from "../iraqTime.js";
import type { NutritionContext } from "../context.js";
import type { NutritionProfileRecord } from "../db/repository.js";

function baseCtx(overrides: Partial<NutritionContext> = {}): NutritionContext {
  return {
    target_calories: 2000, consumed_calories: 0, remaining_calories: 1000,
    consumed_protein: 100, consumed_carbs: 0, consumed_fat: 0,
    macro_targets: { protein_g: 160 }, water_ml: 2000, water_target_ml: 2000,
    meals_logged_today: 0, goal: "maintain", period: "noon", over_target: false,
    ...overrides,
  };
}

describe("chooseCategoryForContext — تكافؤ حرفي مع tips_engine.py", () => {
  it("over_target=true -> high_calorie_meal", () => {
    expect(chooseCategoryForContext(baseCtx({ over_target: true }))).toBe("high_calorie_meal");
  });

  it("متبقي <= 15% من الهدف -> daily_target", () => {
    expect(chooseCategoryForContext(baseCtx({ remaining_calories: 200 }))).toBe("daily_target");
  });

  it("بروتين مستهلك أقل من 50% من الهدف -> protein", () => {
    expect(chooseCategoryForContext(baseCtx({ consumed_protein: 50 }))).toBe("protein");
  });

  it("ماي أقل من 40% من الهدف -> hydration", () => {
    expect(chooseCategoryForContext(baseCtx({ water_ml: 500 }))).toBe("hydration");
  });

  it("goal=lose -> weight_loss", () => {
    expect(chooseCategoryForContext(baseCtx({ goal: "lose" }))).toBe("weight_loss");
  });

  it("بدون أي إشارة خاصة + mealType=breakfast -> breakfast", () => {
    expect(chooseCategoryForContext(baseCtx(), "breakfast")).toBe("breakfast");
  });

  it("بدون أي إشارة ولا mealType -> balance", () => {
    expect(chooseCategoryForContext(baseCtx())).toBe("balance");
  });
});

describe("pickTip + Repository — منطق منع التكرار والأولوية", () => {
  it("يختار من نفس التصنيف، يتجنب النصائح المعروضة مؤخرًا لو فيه بديل", async () => {
    const repo = new InMemoryRepository();
    repo.nutritionTips = [
      { id: "t1", text: "نصيحة 1", category: "protein", active: true, priority: 0 },
      { id: "t2", text: "نصيحة 2", category: "protein", active: true, priority: 0 },
    ];
    await repo.insertShownTip("u1", "t1");
    const tip = await pickTip(repo, "u1", "protein");
    expect(tip).toBe("نصيحة 2");
  });

  it("يرجع من فئة balance لو التصنيف المطلوب فاضي", async () => {
    const repo = new InMemoryRepository();
    repo.nutritionTips = [{ id: "t1", text: "نصيحة عامة", category: "balance", active: true, priority: 0 }];
    const tip = await pickTip(repo, "u1", "hydration");
    expect(tip).toBe("نصيحة عامة");
  });

  it("يرجع null لو ماكو نصائح إطلاقًا", async () => {
    const repo = new InMemoryRepository();
    expect(await pickTip(repo, "u1", "protein")).toBeNull();
  });
});

describe("calculator.todayTotals / todayWaterMl / mealsByTypeForDay — عبر Repository", () => {
  const profile: NutritionProfileRecord = {
    user_id: "u1", age: 25, weight_kg: 80, height_cm: 175, sex: "male",
    goal: "lose", activity_level: "moderate", bmr: 1774, tdee: 2749,
    calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
  };

  it("يوم فاضي: صفر سعرات، NOT_STARTED لكل وجبة", async () => {
    const repo = new InMemoryRepository();
    const totals = await todayTotals(repo, "u1");
    expect(totals.calories).toBe(0);
    expect(totals.logs).toHaveLength(0);

    const ctx = await build(repo, "u1", profile);
    expect(ctx.remaining_calories).toBe(2249);
    expect(ctx.macro_targets).toEqual({ protein_g: 160, carbs_g: 263, fat_g: 62 });
  });

  it("وجبة مسجّلة اليوم تنعكس بـtodayTotals وmealsByTypeForDay", async () => {
    const repo = new InMemoryRepository();
    const now = new Date();
    await repo.insertMealLog({
      user_id: "u1", meal_type: "lunch", raw_text: "اكلت بيضتين",
      matched_foods_json: JSON.stringify(["بيضة"]), total_calories: 155,
      total_protein: 13, total_carbs: 1.1, total_fat: 11, is_free_meal: true,
    });
    const totals = await todayTotals(repo, "u1", now);
    expect(totals.calories).toBe(155);

    const { year, month, day } = nowBaghdad(now); // نفس حساب اليوم البغدادي المستخدم داخليًا بـtodayUtcRange
    const meals = await mealsByTypeForDay(repo, "u1", year, month, day);
    expect(meals.breakfast.status).toBe("NOT_STARTED");
    expect(meals.lunch.status).toBe("LOGGED");
    if (meals.lunch.status === "LOGGED") {
      expect(meals.lunch.calories).toBe(155);
      expect(meals.lunch.foods).toEqual(["بيضة"]);
    }
  });

  it("todayWaterMl يجمع كل سجلات الماي لليوم الحالي", async () => {
    const repo = new InMemoryRepository();
    await repo.insertWaterLog({ user_id: "u1", ml: 250 });
    await repo.insertWaterLog({ user_id: "u1", ml: 500 });
    expect(await todayWaterMl(repo, "u1")).toBe(750);
  });
});
