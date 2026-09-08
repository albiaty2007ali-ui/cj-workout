/**
 * اختبارات تكافؤ لـrecipeSearch.ts — تستخدم نفس الـ4 وصفات الحقيقية المزروعة فعليًا بـ
 * recipes_seed.py (تحققت من قاعدة بيانات حقيقية بالذاكرة)، والقيم المتوقعة من تشغيل
 * nutrition_ai/recipe_search.py الحقيقي مباشرة:
 *
 *   search_recipes('دجاج')        -> ['دجاج مشوي مع سلطة']
 *   search_recipes('بيظ')         -> [] (typo، لكن 'بيض' أقصر من 4 أحرف فتُستثنى من الفازي)
 *   search_recipes('شوربة عدس')   -> ['شوربة عدس', 'مشروب بارد بالليمون'] (تطابق فازي غير بديهي حقيقي!)
 *   search_recipes('دولمة')       -> [] (ماكو وصفة دولمة مزروعة)
 *   suggest_recipes_within(400)   -> ['دجاج مشوي مع سلطة'(380), 'بيض بالطماطة'(320)]
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { searchRecipes, suggestRecipesWithin } from "../recipeSearch.js";
import type { RecipeRecord } from "../db/repository.js";

function makeRecipe(overrides: Partial<RecipeRecord>): RecipeRecord {
  return {
    id: overrides.name!, name: "", slug: "", description: null, category_id: "c1",
    active: true, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: null,
    prep_time_min: null, cook_time_min: null, servings: 1, difficulty: "easy",
    match_keywords: null, ingredients: [], steps: [], substitutions: [],
    ...overrides,
  };
}

describe("searchRecipes — تكافؤ حرفي مع recipe_search.py (4 وصفات حقيقية من recipes_seed.py)", () => {
  let repo: InMemoryRepository;

  beforeEach(() => {
    repo = new InMemoryRepository();
    repo.recipes = [
      makeRecipe({ name: "بيض بالطماطة", slug: "eggs-tomato", calories: 320, match_keywords: "بيض بالطماطة|بيض وطماطة" }),
      makeRecipe({ name: "دجاج مشوي مع سلطة", slug: "grilled-chicken-salad", calories: 380, match_keywords: "دجاج مشوي|دجاج بالخضار|سلطة دجاج" }),
      makeRecipe({ name: "شوربة عدس", slug: "lentil-soup", calories: 220, match_keywords: "عدس|شوربة عدس" }),
      makeRecipe({ name: "مشروب بارد بالليمون", slug: "cold-lemon-drink", calories: 60, match_keywords: "مشروب بارد|شاي مثلج|ليمون بارد" }),
    ];
  });

  it("'دجاج' -> دجاج مشوي مع سلطة فقط", async () => {
    const names = (await searchRecipes(repo, "دجاج")).map((r) => r.name);
    expect(names).toEqual(["دجاج مشوي مع سلطة"]);
  });

  it("'بيظ' (خطأ إملائي) -> صفر نتائج (كلمة 'بيض' الحقيقية أقصر من 4 أحرف، تُستثنى من الفازي)", async () => {
    const names = (await searchRecipes(repo, "بيظ")).map((r) => r.name);
    expect(names).toEqual([]);
  });

  it("'شوربة عدس' -> تطابق حرفي + تطابق فازي غير متوقع مع 'مشروب بارد بالليمون' (سلوك حقيقي مؤكد)", async () => {
    const names = (await searchRecipes(repo, "شوربة عدس")).map((r) => r.name);
    expect(names).toEqual(["شوربة عدس", "مشروب بارد بالليمون"]);
  });

  it("'دولمة' -> صفر نتائج (ماكو وصفة كهذي مزروعة)", async () => {
    expect(await searchRecipes(repo, "دولمة")).toEqual([]);
  });

  it("بدون query -> يرجع كل الوصفات النشطة", async () => {
    expect(await searchRecipes(repo, "")).toHaveLength(4);
  });
});

describe("suggestRecipesWithin — تكافؤ حرفي", () => {
  let repo: InMemoryRepository;

  beforeEach(() => {
    repo = new InMemoryRepository();
    repo.recipes = [
      makeRecipe({ name: "بيض بالطماطة", calories: 320 }),
      makeRecipe({ name: "دجاج مشوي مع سلطة", calories: 380 }),
      makeRecipe({ name: "شوربة عدس", calories: 220 }),
      makeRecipe({ name: "مشروب بارد بالليمون", calories: 60 }),
    ];
  });

  it("400 سعرة متبقية -> دجاج مشوي (380) ثم بيض بالطماطة (320)، الأعلى سعرات أولًا", async () => {
    const names = (await suggestRecipesWithin(repo, 400)).map((r) => r.name);
    expect(names).toEqual(["دجاج مشوي مع سلطة", "بيض بالطماطة"]);
  });

  it("صفر سعرات متبقية -> قائمة فاضية", async () => {
    expect(await suggestRecipesWithin(repo, 0)).toEqual([]);
  });
});
