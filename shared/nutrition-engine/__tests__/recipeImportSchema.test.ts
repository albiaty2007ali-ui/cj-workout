/**
 * اختبارات validateRecipeEntry (recipeImportSchema.ts) — فحص بنيوي بحت، صفر شبكة/Firestore.
 */
import { describe, it, expect } from "vitest";
import { validateRecipeEntry } from "../scripts/recipeImportSchema.js";

function makeEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "وصفة تجريبية", slug: "test-recipe", category: "فطور", description: "وصف",
    prep_time_min: 10, cook_time_min: 10, servings: 4, difficulty: "easy",
    calories: 200, protein: 10, carbs: 20, fat: 5, fiber: 2,
    match_keywords: ["كلمة"],
    ingredients: [{ name: "بيض", quantity: "2", unit: "حبة" }],
    steps: [{ instruction: "اطبخ", duration: null, temperature: null, tip: null, warning: null }],
    substitutions: {},
    source_url: "https://example.com/recipe",
    ...overrides,
  };
}

describe("validateRecipeEntry", () => {
  it("عنصر صحيح كامل -> صفر مشاكل", () => {
    expect(validateRecipeEntry(makeEntry(), 0)).toEqual([]);
  });

  it("slug فيه أحرف عربية أو مسافات -> مرفوض", () => {
    const issues = validateRecipeEntry(makeEntry({ slug: "وصفة تجريبية" }), 0);
    expect(issues.some((i) => i.message.includes("slug"))).toBe(true);
  });

  it("servings صفري أو سالب -> مرفوض", () => {
    expect(validateRecipeEntry(makeEntry({ servings: 0 }), 0).length).toBeGreaterThan(0);
    expect(validateRecipeEntry(makeEntry({ servings: -1 }), 0).length).toBeGreaterThan(0);
  });

  it("calories سالبة -> مرفوض", () => {
    expect(validateRecipeEntry(makeEntry({ calories: -5 }), 0).length).toBeGreaterThan(0);
  });

  it("ingredients فاضية -> مرفوض", () => {
    expect(validateRecipeEntry(makeEntry({ ingredients: [] }), 0).length).toBeGreaterThan(0);
  });

  it("steps فاضية -> مرفوض", () => {
    expect(validateRecipeEntry(makeEntry({ steps: [] }), 0).length).toBeGreaterThan(0);
  });

  it("source_url مفقود -> مرفوض (كل وصفة لازم مصدر حقيقي)", () => {
    expect(validateRecipeEntry(makeEntry({ source_url: "" }), 0).length).toBeGreaterThan(0);
  });

  it("فحص المنطقية: سعرات بعيدة جدًا عن الماكروز المحسوبة -> مرفوض", () => {
    // بروتين 10 + كارب 20 + دهن 5 = 40+80+45 = 165 سعرة محسوبة، لكن calories=2000 (انحراف فاحش)
    const issues = validateRecipeEntry(makeEntry({ calories: 2000 }), 0);
    expect(issues.some((i) => i.message.includes("فحص المنطقية"))).toBe(true);
  });

  it("فحص المنطقية: تفاوت معقول (ألياف/تقريب) -> مقبول", () => {
    // بروتين 15 + كارب 42 + دهن 1 = 60+168+9 = 237 محسوبة مقابل 231 مذكورة (بيانات fasolia حقيقية)
    const issues = validateRecipeEntry(makeEntry({ calories: 231, protein: 15, carbs: 42, fat: 1 }), 0);
    expect(issues.some((i) => i.message.includes("فحص المنطقية"))).toBe(false);
  });

  it("difficulty غير صالحة -> مرفوض", () => {
    expect(validateRecipeEntry(makeEntry({ difficulty: "impossible" }), 0).length).toBeGreaterThan(0);
  });

  it("substitutions مصفوفة بدل object -> مرفوض", () => {
    expect(validateRecipeEntry(makeEntry({ substitutions: [] }), 0).length).toBeGreaterThan(0);
  });
});
