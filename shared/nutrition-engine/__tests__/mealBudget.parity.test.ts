/**
 * اختبارات تكافؤ لـmealBudget.ts — منفذ حرفي من nutrition_ai/meal_budget.py، نفس الأوزان
 * والمنطق (تحقّقت يدويًا: مجموع كل الحصص = remainingCalories بالضبط دائمًا، صفر فقدان تقريب).
 */
import { describe, it, expect } from "vitest";
import { distributeRemainingBudget } from "../mealBudget.js";

describe("distributeRemainingBudget — تكافؤ حرفي", () => {
  it("noon (الغداء يأخذ الحصة الأعلى) — 2249 سعرة على 3 وجبات غير مسجَّلة", () => {
    const budgets = distributeRemainingBudget(2249, ["breakfast", "lunch", "dinner"], "noon");
    expect(budgets).toEqual({ breakfast: 388, lunch: 1086, dinner: 775 });
    expect(budgets.breakfast + budgets.lunch + budgets.dinner).toBe(2249); // صفر فقدان/زيادة تقريب
  });

  it("evening (العشاء يأخذ الحصة الأعلى)", () => {
    const budgets = distributeRemainingBudget(2249, ["breakfast", "lunch", "dinner"], "evening");
    expect(budgets.dinner).toBeGreaterThan(budgets.lunch);
    expect(budgets.dinner).toBeGreaterThan(budgets.breakfast);
    expect(budgets.breakfast + budgets.lunch + budgets.dinner).toBe(2249);
  });

  it("وجبة وحدة متبقية فقط -> تاخذ الباقي كله", () => {
    const budgets = distributeRemainingBudget(800, ["dinner"], "evening");
    expect(budgets).toEqual({ dinner: 800 });
  });

  it("صفر وجبات متبقية (كلها مسجَّلة) -> كائن فاضي", () => {
    const budgets = distributeRemainingBudget(500, [], "noon");
    expect(budgets).toEqual({});
  });

  it("سعرات متبقية صفر/سالبة -> كل وجبة تاخذ صفر (صفر اختراع رقم موجب)", () => {
    const budgets = distributeRemainingBudget(0, ["breakfast", "lunch"], "noon");
    expect(budgets).toEqual({ breakfast: 0, lunch: 0 });
  });
});
