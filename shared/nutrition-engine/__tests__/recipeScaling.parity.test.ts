/**
 * اختبارات recipeScaling.ts — معادلة نسبية بسيطة (factor = target/original)، صفر تخمين، كميات
 * نصية غير رقمية (مثلاً "رشة") تبقى كما هي حرفيًا.
 */
import { describe, it, expect } from "vitest";
import { scaleRecipe } from "../recipeScaling.js";
import type { RecipeRecord } from "../db/repository.js";

function makeRecipe(overrides: Partial<RecipeRecord> = {}): RecipeRecord {
  return {
    id: "r1", name: "وصفة", slug: "recipe", description: null, category_id: "c1",
    active: true, calories: 400, protein: 20, carbs: 40, fat: 10, fiber: 5,
    prep_time_min: null, cook_time_min: null, servings: 4, difficulty: "easy",
    match_keywords: null, source: null, tags: [],
    ingredients: [
      { name: "دجاج", quantity: "200", unit: "غم" },
      { name: "رز", quantity: "1", unit: "كوب" },
      { name: "ملح", quantity: null, unit: "رشة" },
    ],
    steps: [], substitutions: [],
    ...overrides,
  };
}

describe("scaleRecipe — نسبة حقيقية بسيطة، صفر تخمين", () => {
  it("مضاعفة الحصص (4 -> 8) -> كل المكونات وNutrition تتضاعف بالضبط", () => {
    const recipe = makeRecipe();
    const scaled = scaleRecipe(recipe, 8);
    expect(scaled.servings).toBe(8);
    expect(scaled.calories).toBe(800);
    expect(scaled.protein).toBe(40);
    expect(scaled.carbs).toBe(80);
    expect(scaled.fat).toBe(20);
    expect(scaled.fiber).toBe(10);
    expect(scaled.ingredients[0].quantity).toBe("400");
    expect(scaled.ingredients[1].quantity).toBe("2");
  });

  it("تقليل الحصص (4 -> 1) -> ربع القيم الأصلية", () => {
    const recipe = makeRecipe();
    const scaled = scaleRecipe(recipe, 1);
    expect(scaled.calories).toBe(100);
    expect(scaled.ingredients[0].quantity).toBe("50");
  });

  it("كمية نصية غير رقمية (مثلاً 'رشة'، مكوّن بلا كمية رقمية) تبقى كما هي حرفيًا، صفر تخمين", () => {
    const recipe = makeRecipe();
    const scaled = scaleRecipe(recipe, 8);
    expect(scaled.ingredients[2].quantity).toBeNull(); // الملح بلا quantity أصلاً بالمثال
    expect(scaled.ingredients[2].unit).toBe("رشة");
  });

  it("نفس عدد الحصص الأصلي -> نفس القيم بالضبط (Factor=1)", () => {
    const recipe = makeRecipe();
    const scaled = scaleRecipe(recipe, 4);
    expect(scaled.calories).toBe(400);
    expect(scaled.ingredients[0].quantity).toBe("200");
  });

  it("عدد حصص صفري/سالب -> يرمي خطأ صريح بدل رقم مضلِّل", () => {
    const recipe = makeRecipe();
    expect(() => scaleRecipe(recipe, 0)).toThrow();
    expect(() => scaleRecipe(recipe, -2)).toThrow();
  });

  it("وصفة أصلية بـservings غير صالح -> يرمي خطأ صريح", () => {
    const recipe = makeRecipe({ servings: 0 });
    expect(() => scaleRecipe(recipe, 4)).toThrow();
  });

  it("كمية كلامية بحتة (مثلاً 'حسب الرغبة') تبقى حرفيًا بدون تحويل لرقم وهمي", () => {
    const recipe = makeRecipe({ ingredients: [{ name: "بهارات", quantity: "حسب الرغبة", unit: null }] });
    const scaled = scaleRecipe(recipe, 8);
    expect(scaled.ingredients[0].quantity).toBe("حسب الرغبة");
  });
});
