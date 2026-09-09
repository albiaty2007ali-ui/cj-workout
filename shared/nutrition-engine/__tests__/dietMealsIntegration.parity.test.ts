/**
 * اختبارات ربط Chat ↔ Diet Meals (المرحلة 2 من "الذكاء الغذائي الذكي") — الشرط الحرج: أي
 * suggested_recipe بالرد لازم recipe_id حقيقي موجود فعليًا بقاعدة البيانات (صفر Hallucination)،
 * وصفر ادّعاء وصفة موجودة لو ماكو تطابق فعلي.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { handleMessage } from "../orchestrator.js";
import type { NutritionProfileRecord, RecipeRecord } from "../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

function makeRecipe(overrides: Partial<RecipeRecord>): RecipeRecord {
  return {
    id: overrides.name!, name: "", slug: "", description: null, category_id: "c1",
    active: true, calories: 0, protein: 0, carbs: 0, fat: 0, fiber: null,
    prep_time_min: null, cook_time_min: null, servings: 1, difficulty: "easy",
    match_keywords: null, source: null, tags: [], ingredients: [], steps: [], substitutions: [],
    ...overrides,
  };
}

async function freshUser(repo: InMemoryRepository, id: string): Promise<ReturnType<typeof makeUser>> {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

describe("ASK_RECOMMENDATION — يبحث بقسم وجبات الدايت فعليًا، recipe_id حقيقي أو null صريح", () => {
  it("وصفة حقيقية تناسب السعرات المتبقية -> suggested_recipe بـrecipe_id حقيقي، الرد يذكر 'قسم وجبات الدايت'", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u1");
    repo.recipes = [
      makeRecipe({ id: "r1", name: "دجاج مشوي مع سلطة", slug: "grilled-chicken-salad", calories: 380, protein: 30, carbs: 10, fat: 15, active: true }),
    ];
    const r = await handleMessage(repo, user, "شنو آكل هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(r.suggested_recipe).not.toBeNull();
    const suggested = r.suggested_recipe as { id: string; slug: string; name: string };
    expect(suggested.id).toBe("r1");
    expect(suggested.slug).toBe("grilled-chicken-salad");
    expect(r.reply).toContain("قسم وجبات الدايت");
  });

  it("صفر وصفة حقيقية تناسب -> suggested_recipe=null صريح، صفر ادّعاء وصفة موجودة", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u2");
    repo.recipes = []; // صفر وصفات بقاعدة البيانات إطلاقًا
    const r = await handleMessage(repo, user, "شنو آكل هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(r.suggested_recipe).toBeNull();
    expect(r.reply).not.toContain("قسم وجبات الدايت");
  });

  it("وصفة موجودة بس سعراتها أعلى من الباقي -> صفر ترشيح لها (suggestRecipesWithin الحقيقية تستثنيها)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u3");
    repo.recipes = [makeRecipe({ id: "r2", name: "وجبة دسمة", slug: "heavy-meal", calories: 5000, active: true })];
    const r = await handleMessage(repo, user, "شنو آكل هسه؟");
    expect(r.suggested_recipe).toBeNull();
  });
});
