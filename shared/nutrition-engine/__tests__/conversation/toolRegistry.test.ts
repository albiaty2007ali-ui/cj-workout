/**
 * اختبارات سجل الأدوات (conversation/tools.ts) — كل أداة قراءة فقط تُختبر مباشرة (بدون Gemini
 * إطلاقًا بهذا الملف) ضد InMemoryRepository + foods.sqlite الحقيقي، نفس نمط بقية اختبارات
 * Parity بالمشروع. الهدف: تأكيد كل أداة تُرجع بيانات حقيقية فقط، وترفض/تتجاهل أي food_id أو
 * recipe_id مخترع بدل اختراع نتيجة.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository } from "../../db/inMemoryRepository.js";
import { makeUser } from "../testHelpers.js";
import { resolveIngredientName } from "../../ingredientResolver.js";
import * as tools from "../../conversation/tools.js";
import type { ToolExecContext } from "../../conversation/types.js";
import { EMPTY_CONVERSATION_STATE } from "../../conversation/stateStore.js";
import type { NutritionProfileRecord, RecipeRecord, UserRecord } from "../../db/repository.js";

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

async function buildCtx(repo: InMemoryRepository, user: UserRecord): Promise<ToolExecContext> {
  repo.nutritionProfiles.set(user.id, { user_id: user.id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return { repo, user, rawText: "", ctxFlags: {}, now: new Date("2026-01-01T09:00:00Z"), conversationState: EMPTY_CONVERSATION_STATE };
}

let riceId: number;
let chickenId: number;

describe("conversation/tools.ts — أدوات القراءة فقط", () => {
  beforeEach(async () => {
    const rice = await resolveIngredientName("رز");
    const chicken = await resolveIngredientName("دجاج");
    riceId = rice!.food_id;
    chickenId = chicken!.food_id;
  });

  it("search_food: يرجع تطابقات حقيقية لطعام معروف", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u1" }));
    const r = await tools.searchFood.execute(ctx, { query: "رز" });
    expect(r.matches.length).toBeGreaterThan(0);
    expect(r.matches[0].food_id).toBe(riceId);
  });

  it("search_food: نص غير موجود بالقاعدة -> صفر نتائج، صفر اختراع", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u2" }));
    const r = await tools.searchFood.execute(ctx, { query: "شي غريب غير موجود إطلاقًا xyz123" });
    expect(r.matches).toEqual([]);
  });

  it("get_food_nutrition: food_id حقيقي -> رقم حقيقي من القاعدة", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u3" }));
    const r = await tools.getFoodNutrition.execute(ctx, { food_id: riceId, grams: 100 });
    expect(r.found).toBe(true);
    expect(r.calories).toBeGreaterThan(0);
  });

  it("get_food_nutrition: food_id مخترع -> found:false، صفر رقم مختلَق", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u4" }));
    const r = await tools.getFoodNutrition.execute(ctx, { food_id: 999999, grams: 100 });
    expect(r.found).toBe(false);
  });

  it("get_food_nutrition: food_query بدل food_id -> يُحل تلقائيًا لنفس food_id الحقيقي", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u5" }));
    const r = await tools.getFoodNutrition.execute(ctx, { food_query: "رز", grams: 100 });
    expect(r.found).toBe(true);
    expect(r.food_id).toBe(riceId);
  });

  it("get_food_nutrition: كمية ضخمة غير معقولة تُحصر لأقصى حد مسموح", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u6" }));
    const normal = await tools.getFoodNutrition.execute(ctx, { food_id: riceId, grams: 100 });
    const huge = await tools.getFoodNutrition.execute(ctx, { food_id: riceId, grams: 999999999 });
    expect(huge.grams).toBe(5000);
    expect(huge.calories).toBeCloseTo((normal.calories ?? 0) * 50, -1);
  });

  it("resolve_portion: طعام حقيقي -> قائمة حصص (قد تكون فاضية لو ماكو Portion مسجّل)", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u7" }));
    const r = await tools.resolvePortion.execute(ctx, { food_id: riceId });
    expect(r.found).toBe(true);
    expect(Array.isArray(r.portions)).toBe(true);
  });

  it("resolve_portion: food_id مخترع -> found:false", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u8" }));
    const r = await tools.resolvePortion.execute(ctx, { food_id: 999999 });
    expect(r.found).toBe(false);
  });

  it("calculate_meal_nutrition: يجمع أطعمة حقيقية ويتجاهل food_id مخترع بصمت (يوثّقه بـdropped)", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u9" }));
    const r = await tools.calculateMealNutrition.execute(ctx, {
      items: [{ food_id: riceId, grams: 100 }, { food_id: chickenId, grams: 100 }, { food_id: 999999, grams: 100 }],
    });
    expect(r.items.length).toBe(2);
    expect(r.dropped_unknown_food_ids).toEqual([999999]);
    expect(r.totals.calories).toBeGreaterThan(0);
  });

  it("get_daily_summary: يعكس بروفايل المستخدم الحقيقي (calorie_target)", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u10" }));
    const r = await tools.getDailySummary.execute(ctx, {});
    expect(r.target_calories).toBe(STANDARD_PROFILE.calorie_target);
    expect(r.consumed_calories).toBe(0);
    expect(r.remaining_calories).toBe(STANDARD_PROFILE.calorie_target);
  });

  it("get_user_profile: صفر معلومة شخصية حساسة (بدون عمر/وزن/طول)", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u11", xp: 40, streak_days: 3 }));
    const r = await tools.getUserProfile.execute(ctx, {});
    expect(r.goal).toBe("lose");
    expect(r.xp).toBe(40);
    expect(r.streak_days).toBe(3);
    expect(r).not.toHaveProperty("age");
    expect(r).not.toHaveProperty("weight_kg");
  });

  it("search_diet_meals: يرجع وصفات حقيقية فقط من repo، أقصى 5", async () => {
    const repo = new InMemoryRepository();
    repo.recipes = Array.from({ length: 8 }, (_, i) =>
      makeRecipe({ id: `r${i}`, name: `وصفة ${i}`, slug: `recipe-${i}`, active: true, calories: 300 }));
    const ctx = await buildCtx(repo, makeUser({ id: "u12" }));
    const r = await tools.searchDietMeals.execute(ctx, {});
    expect(r.recipes.length).toBeLessThanOrEqual(5);
  });

  it("get_recipe: id حقيقي -> found:true، id مخترع -> found:false", async () => {
    const repo = new InMemoryRepository();
    repo.recipes = [makeRecipe({ id: "real-1", name: "بيض بالطماطة", slug: "eggs-tomato", active: true, calories: 250 })];
    const ctx = await buildCtx(repo, makeUser({ id: "u13" }));
    const found = await tools.getRecipe.execute(ctx, { recipe_id: "real-1" });
    expect(found.found).toBe(true);
    expect(found.recipe?.name).toBe("بيض بالطماطة");
    const notFound = await tools.getRecipe.execute(ctx, { recipe_id: "invented-id-123" });
    expect(notFound.found).toBe(false);
  });

  it("find_recipes_from_ingredients: يطابق food_id حقيقي بمكوّن الوصفة", async () => {
    const repo = new InMemoryRepository();
    repo.recipes = [makeRecipe({
      id: "r1", name: "رز بدجاج", slug: "rice-chicken", active: true, calories: 400,
      ingredients: [{ name: "رز", quantity: "1", unit: "كوب", food_id: riceId }, { name: "دجاج", quantity: "200", unit: "غم", food_id: chickenId }],
    })];
    const ctx = await buildCtx(repo, makeUser({ id: "u14" }));
    const r = await tools.findRecipesFromIngredients.execute(ctx, { mentioned_food_ids: [riceId, chickenId] });
    expect(r.recipes.length).toBe(1);
    expect(r.recipes[0].match_percentage).toBe(100);
    expect(r.recipes[0].tier).toBe("EXACT_MATCH");
  });

  it("recommend_foods: نص + وصفات حقيقية ضمن الباقي، صفر اختراع", async () => {
    const repo = new InMemoryRepository();
    repo.recipes = [makeRecipe({ id: "light-1", name: "سلطة خفيفة", slug: "light-salad", active: true, calories: 150 })];
    const ctx = await buildCtx(repo, makeUser({ id: "u15" }));
    const r = await tools.recommendFoods.execute(ctx, { remaining_calories: 500 });
    expect(typeof r.text).toBe("string");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("check_food_fit: طعام حقيقي -> نص حقيقي، food_id مخترع -> found:false", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u16" }));
    const ok = await tools.checkFoodFit.execute(ctx, { food_id: riceId });
    expect(ok.found).toBe(true);
    expect(typeof ok.text).toBe("string");
    const bad = await tools.checkFoodFit.execute(ctx, { food_id: 999999 });
    expect(bad.found).toBe(false);
  });

  it("suggest_substitution: طعام حقيقي -> found:true دائمًا (حتى لو صفر بديل، النص يقوله بصراحة)", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u17" }));
    const r = await tools.suggestSubstitution.execute(ctx, { food_id: riceId });
    expect(r.found).toBe(true);
    expect(typeof r.text).toBe("string");
  });

  it("simulate_what_if: محاكاة حسابية بحتة — صفر MealLog يُكتب مهما صار", async () => {
    const repo = new InMemoryRepository();
    const user = makeUser({ id: "u18" });
    const ctx = await buildCtx(repo, user);
    const r = await tools.simulateWhatIf.execute(ctx, { items: [{ food_id: riceId, grams: 200 }] });
    expect(r.found).toBe(true);
    expect(r.simulated_calories).toBeGreaterThan(0);
    expect(r.remaining_after).toBe(r.remaining_before! - r.simulated_calories!);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("simulate_what_if: صفر items وصفر target_calories -> found:false", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u19" }));
    const r = await tools.simulateWhatIf.execute(ctx, {});
    expect(r.found).toBe(false);
  });

  it("calculate_allowed_portion: food_query + الباقي التلقائي (من بروفايل المستخدم) -> رقم حقيقي", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u20" }));
    const r = await tools.calculateAllowedPortion.execute(ctx, { food_query: "رز" });
    expect(r.found).toBe(true);
    expect(r.text).toContain("خاشوقة");
    expect(r.text).toMatch(/\d+/);
  });

  it("calculate_allowed_portion: remaining_calories صريح -> يتجاوز بروفايل المستخدم", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u21" }));
    const r = await tools.calculateAllowedPortion.execute(ctx, { food_id: riceId, remaining_calories: 100 });
    expect(r.found).toBe(true);
    expect(r.text).toContain("100");
  });

  it("calculate_allowed_portion: food_id مخترع -> found:false", async () => {
    const repo = new InMemoryRepository();
    const ctx = await buildCtx(repo, makeUser({ id: "u22" }));
    const r = await tools.calculateAllowedPortion.execute(ctx, { food_id: 999999 });
    expect(r.found).toBe(false);
  });
});
