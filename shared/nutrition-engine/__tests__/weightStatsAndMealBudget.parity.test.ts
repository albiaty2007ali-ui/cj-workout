/**
 * اختبارات تكافؤ لـweightStats.ts و mealBudget.ts — القيم المتوقعة من تشغيل حقيقي لـ
 * nutrition_ai/weight_stats.py + nutrition_ai/meal_budget.py عبر تطبيق Flask+SQLAlchemy حقيقي
 * بالذاكرة (4 قياسات وزن حقيقية: -20، -13، -7، اليوم أيام)، وليس افتراضًا نظريًا:
 *
 *   {"current_weight": 80.0, "starting_weight": 84.0, "total_change": -4.0, "average_weight": 82.2,
 *    "lowest_weight": 80.0, "highest_weight": 84.0, "weekly_change": -2.0, "trend": "DECREASING",
 *    "distance_to_goal": 5.0, "goal_direction": "LOSS"}
 *   distribute_remaining_budget(1580, [lunch,dinner,snack], 'noon') -> {lunch:768, dinner:549, snack:263}
 *   distribute_remaining_budget(1000, [breakfast,dinner], 'evening') -> {breakfast:176, dinner:824}
 */
import { describe, it, expect } from "vitest";
import { computeWeightStats, type WeightEntry } from "../weightStats.js";
import { distributeRemainingBudget } from "../mealBudget.js";

describe("computeWeightStats — تكافؤ حرفي مع weight_stats.py", () => {
  it("4 قياسات حقيقية (يوم -20، -13، -7، اليوم) مع هدف نزول 75كغم", () => {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
    const entries: WeightEntry[] = [
      { date: daysAgo(20), weight_kg: 84.0 },
      { date: daysAgo(13), weight_kg: 83.0 },
      { date: daysAgo(7), weight_kg: 82.0 },
      { date: now, weight_kg: 80.0 },
    ];

    const stats = computeWeightStats(entries, 75, "lose");

    expect(stats.current_weight).toBe(80.0);
    expect(stats.starting_weight).toBe(84.0);
    expect(stats.total_change).toBe(-4.0);
    expect(stats.average_weight).toBe(82.2);
    expect(stats.lowest_weight).toBe(80.0);
    expect(stats.highest_weight).toBe(84.0);
    expect(stats.weekly_change).toBe(-2.0);
    expect(stats.weekly_change_note).toBeNull();
    expect(stats.trend).toBe("DECREASING");
    expect(stats.distance_to_goal).toBe(5.0);
    expect(stats.goal_direction).toBe("LOSS");
  });

  it("بدون أي قياسات -> INSUFFICIENT_DATA وصفر أرقام مخترعة", () => {
    const stats = computeWeightStats([], null, null);
    expect(stats.trend).toBe("INSUFFICIENT_DATA");
    expect(stats.current_weight).toBeNull();
    expect(stats.weekly_change).toBeNull();
    expect(stats.weekly_change_note).toBe("ماكو قياسات وزن مسجّلة بعد.");
  });

  it("قياس واحد فقط -> INSUFFICIENT_DATA (أقل من 3 نقاط)", () => {
    const stats = computeWeightStats([{ date: new Date(), weight_kg: 80 }], null, null);
    expect(stats.trend).toBe("INSUFFICIENT_DATA");
    expect(stats.current_weight).toBe(80);
  });
});

describe("distributeRemainingBudget — تكافؤ حرفي مع meal_budget.py", () => {
  it("1580 سعرة على [غداء,عشاء,سناك] بفترة الظهر (noon)", () => {
    const budgets = distributeRemainingBudget(1580, ["lunch", "dinner", "snack"], "noon");
    expect(budgets).toEqual({ lunch: 768, dinner: 549, snack: 263 });
    expect(Object.values(budgets).reduce((a, b) => a + b, 0)).toBe(1580);
  });

  it("1000 سعرة على [فطور,عشاء] بفترة المساء (evening)", () => {
    const budgets = distributeRemainingBudget(1000, ["breakfast", "dinner"], "evening");
    expect(budgets).toEqual({ breakfast: 176, dinner: 824 });
    expect(Object.values(budgets).reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it("صفر سعرات متبقية -> كل الوجبات تاخذ صفر", () => {
    expect(distributeRemainingBudget(0, ["lunch", "dinner"], "noon")).toEqual({ lunch: 0, dinner: 0 });
  });
});
