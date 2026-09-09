/**
 * اختبارات Cook From What I Have (المرحلة 3) — الشرط الحرج المعتاد: صفر تسجيل وجبة أبدًا،
 * وصفر وصفة مقترحة بدون تطابق مكونات حقيقي فعلي.
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

describe("Cook From What I Have — تطابق مكونات حقيقي، صفر تسجيل وجبة أبدًا", () => {
  it("100% تطابق (كل مكونات الوصفة مذكورة) -> suggested_recipe حقيقي، صفر تسجيل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u1");
    repo.recipes = [
      makeRecipe({
        id: "r1", name: "بيض بالطماطة", slug: "eggs-tomato", calories: 320, active: true,
        ingredients: [{ name: "بيضة", quantity: "2", unit: "حبة" }, { name: "طماطة", quantity: "1", unit: "حبة" }],
      }),
    ];
    const r = await handleMessage(repo, user, "عندي بيضة وطماطة، شنو اگدر اطبخ؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
    expect(r.suggested_recipe).not.toBeNull();
    expect((r.suggested_recipe as { id: string }).id).toBe("r1");
    expect(r.reply).toContain("بيض بالطماطة");
    expect(r.reply).toContain("100%");
  });

  it("تطابق جزئي (مكوّن ناقص) -> يذكر النسبة الحقيقية والمكوّن الناقص، صفر suggested_recipe كامل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u2");
    repo.recipes = [
      makeRecipe({
        id: "r2", name: "دجاج مشوي مع سلطة", slug: "grilled-chicken-salad", calories: 380, active: true,
        ingredients: [{ name: "دجاج", quantity: "200", unit: "غم" }, { name: "خس", quantity: "1", unit: "حبة" }],
      }),
    ];
    const r = await handleMessage(repo, user, "عندي دجاج بس، شنو اگدر اطبخ؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("دجاج مشوي مع سلطة");
    expect(r.reply).toContain("خس"); // المكوّن الناقص مذكور صراحة
    expect(r.suggested_recipe).toBeNull(); // مو 100%، صفر اقتراح "جاهز" كامل
  });

  it("صفر مكوّن معروف بالرسالة -> سؤال توضيحي، صفر تسجيل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u3");
    const r = await handleMessage(repo, user, "شنو اگدر اطبخ اليوم؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("صفر وصفة حقيقية تحتوي المكوّن المذكور -> رد صريح بعدم وجود تطابق، صفر ادّعاء وصفة", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u4");
    repo.recipes = [makeRecipe({ id: "r3", name: "شوربة عدس", slug: "lentil-soup", active: true, ingredients: [{ name: "عدس", quantity: "1", unit: "كوب" }] })];
    const r = await handleMessage(repo, user, "عندي بيضة، شنو اگدر اطبخ؟");
    expect(r.meal_logged).toBe(false);
    expect(r.suggested_recipe).toBeNull();
  });
});

describe("Cook From What I Have — مطابقة عبر food_id حقيقي (ingredientResolver.ts، المرحلة 4)", () => {
  it("100% تطابق عبر food_id (رز=8 حقيقي، مو substring) -> EXACT_MATCH، suggested_recipe حقيقي", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u5");
    repo.recipes = [
      makeRecipe({
        id: "r5", name: "رز بسيط", slug: "simple-rice", calories: 200, active: true,
        ingredients: [{ name: "أرز أبيض مطبوخ", quantity: "1", unit: "كوب", food_id: 8, required: true }],
      }),
    ];
    // "تمن" alias مختلفة لفظيًا عن "أرز أبيض مطبوخ" بالوصفة، بس نفس food_id=8 حقيقي بالقاعدة
    const r = await handleMessage(repo, user, "عندي تمن، شنو اگدر اطبخ؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("100%");
    expect(r.suggested_recipe).not.toBeNull();
    expect((r.suggested_recipe as { id: string }).id).toBe("r5");
  });

  it("80% تطابق (HIGH_MATCH) -> suggested_recipe يُملأ الآن (كان محصور بـ100% بس قبل الترقية)، وصياغة صادقة 'إذا توفر'", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u6");
    repo.recipes = [
      makeRecipe({
        id: "r6", name: "دجاج ورز وطماطة وبطاطا", slug: "chicken-rice-tomato-potato", calories: 400, active: true,
        ingredients: [
          { name: "دجاج", quantity: "200", unit: "غم", food_id: 20, required: true },
          { name: "رز", quantity: "1", unit: "كوب", food_id: 8, required: true },
          { name: "طماطة", quantity: "1", unit: "حبة", food_id: 42, required: true },
          { name: "بطاطا مسلوقة", quantity: "1", unit: "حبة", food_id: 11, required: true },
          { name: "بصل", quantity: "1", unit: "حبة", food_id: 999999, required: true },
        ],
      }),
    ];
    const r = await handleMessage(repo, user, "عندي دجاج وتمن وطماطة وبطاطا مسلوقة، شنو اگدر اطبخ؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("80%");
    expect(r.suggested_recipe).not.toBeNull();
    expect(r.reply).toContain("إذا توفر");
  });

  it("60% تطابق (PARTIAL_MATCH) -> يُذكَر بالرد بس suggested_recipe يبقى null (تحت عتبة HIGH_MATCH)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u7");
    repo.recipes = [
      makeRecipe({
        id: "r7", name: "طبخة مشتركة", slug: "shared-dish", calories: 350, active: true,
        ingredients: [
          { name: "دجاج", quantity: "200", unit: "غم", food_id: 20, required: true },
          { name: "رز", quantity: "1", unit: "كوب", food_id: 8, required: true },
          { name: "بصل", quantity: "1", unit: "حبة", food_id: 999999, required: true },
        ],
      }),
    ];
    const r = await handleMessage(repo, user, "عندي دجاج وتمن، شنو اگدر اطبخ؟");
    expect(r.reply).toContain("67%"); // 2 من 3 = 66.67% مقرّب لـ67%
    expect(r.suggested_recipe).toBeNull();
  });

  it("مكوّن optional ناقص لا يمنع تصنيف 'جاهزة' ولا يخفّض النسبة", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u8");
    repo.recipes = [
      makeRecipe({
        id: "r8", name: "دجاج بالبهارات", slug: "spiced-chicken", calories: 300, active: true,
        ingredients: [
          { name: "دجاج", quantity: "200", unit: "غم", food_id: 20, required: true },
          { name: "فلفل حار، اختياري", quantity: null, unit: "اختياري", food_id: 999996, required: false },
        ],
      }),
    ];
    const r = await handleMessage(repo, user, "عندي دجاج، شنو اگدر اطبخ؟");
    expect(r.reply).toContain("100%");
    expect(r.reply).toContain("اختياري");
    expect(r.suggested_recipe).not.toBeNull();
  });

  it("مكوّن وصفة بـfood_id غير مذكور إطلاقًا -> صفر تطابق خاطئ (False Positive)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u9");
    repo.recipes = [
      makeRecipe({
        id: "r9", name: "وصفة بعيدة", slug: "unrelated-recipe", calories: 100, active: true,
        ingredients: [{ name: "طعام غير مذكور", quantity: "1", unit: "حبة", food_id: 777, required: true }],
      }),
    ];
    const r = await handleMessage(repo, user, "عندي دجاج، شنو اگدر اطبخ؟");
    expect(r.reply).not.toContain("وصفة بعيدة");
    expect(r.suggested_recipe).toBeNull();
  });

  it("مكوّن مذكور بمسافات زائدة بالرسالة -> يتطابق نفس الشي (arabicNormalize يطبّع المسافات)", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "u10");
    repo.recipes = [
      makeRecipe({
        id: "r10", name: "رز بسيط", slug: "simple-rice-2", calories: 200, active: true,
        ingredients: [{ name: "رز", quantity: "1", unit: "كوب", food_id: 8, required: true }],
      }),
    ];
    const r = await handleMessage(repo, user, "عندي   تمن   ،  شنو اگدر اطبخ؟");
    expect(r.suggested_recipe).not.toBeNull();
  });
});
