/**
 * اختبارات What If Simulator — الشرط غير القابل للتفاوض بكل اختبار هنا: meal_logged يجب يبقى
 * false **و** صفر صف MealLog حقيقي، لأن هذا بالضبط الـBug الأمان الحقيقي المكتشَف: "إذا أكلت
 * برگر هسه؟" كانت تُسجَّل كوجبة فعلية (نفس فئة باگ "شكد حجم البيتزا؟" التاريخي — راجع
 * askFoodInfo.parity.test.ts). نستخدم "برجر" (تهجئة قاعدة foods.sqlite الحقيقية) بدل "برگر"
 * حتى نضمن تطابق حتمي — جوهر الاختبار هو تصنيف النية، مو تطابق الاسم بالضبط.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRepository } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { handleMessage } from "../orchestrator.js";
import { detectIntent, WHAT_IF, LOG_MEAL } from "../intents.js";
import type { NutritionProfileRecord, RecipeRecord } from "../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

function setupRepo(): InMemoryRepository {
  return new InMemoryRepository();
}

async function freshUser(repo: InMemoryRepository, id: string): Promise<ReturnType<typeof makeUser>> {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

describe("🚨 What If Simulator — Regression الأمان الحرج: صفر تسجيل وجبة أبدًا", () => {
  it("'إذا أكلت برجر هسه؟' -> meal_logged=false، صفر صف MealLog حقيقي (كان Bug: يسجّلها فعليًا)", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u1");
    const r = await handleMessage(repo, user, "إذا أكلت برجر هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("'اذا اكل برجر هسه؟' (صيغة مضارع/أمر عراقية بدون ت، مو 'اكلت' الماضي) -> نفس الضمان، شكوى مستخدم حقيقية", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u1b");
    const r = await handleMessage(repo, user, "اذا اكل برجر هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
    expect(r.reply).toContain("برجر");
  });

  it("'لو اكلت برجر هسه؟' (صيغة لو بدل إذا) -> نفس الضمان", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u2");
    const r = await handleMessage(repo, user, "لو اكلت برجر هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("طعام محدَّد -> الرد يتضمّن كمية حقيقية موصى بيها (بالخاشوقة/اللقمة/الحبة الفعلية)، مو بس تأثير الكمية الكاملة", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u1c");
    const r = await handleMessage(repo, user, "اذا اكل بيتزا هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("بيتزا");
    expect(r.reply).toContain("🍽️"); // سطر كمية حقيقية من suggestPortionForFood
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("طعام يناسب السعرات المتبقية -> رد يذكر الطعام والتأثير، صفر تسجيل", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u3");
    const r = await handleMessage(repo, user, "اذا اكلت برجر هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("برجر");
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("طعام يتجاوز السعرات المتبقية بوضوح -> يذكر التجاوز ويقترح بدائل حقيقية، صفر تسجيل", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u4");
    // نستهلك تقريبًا كل السعرات المسموحة اليوم حتى نضمن سيناريو تجاوز واضح
    await repo.insertMealLog({
      user_id: "u4", meal_type: "lunch", raw_text: "غداء", matched_foods_json: "[]",
      total_calories: 2200, total_protein: 100, total_carbs: 200, total_fat: 60, is_free_meal: false,
    });
    const r = await handleMessage(repo, user, "اذا اكلت برجر هسه؟");
    expect(r.meal_logged).toBe(false);
    // صفر صف MealLog جديد غير الصف اللي زرعناه احنا يدويًا فوق (يبقى 1 بالضبط، مو 2)
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });

  it("تجاوز واضح + وصفة حقيقية ضمن الميزانية المتبقية -> suggested_recipe حقيقي (بطاقة وصفة بالشات، المرحلة 5/Prompt 2)", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u_recipe_alt");
    const recipe: RecipeRecord = {
      id: "r1", name: "سلطة خفيفة", slug: "light-salad", description: null, category_id: "c1",
      active: true, calories: 300, protein: 20, carbs: 20, fat: 10, fiber: null,
      prep_time_min: null, cook_time_min: null, servings: 1, difficulty: "easy",
      match_keywords: null, source: null, tags: [], ingredients: [], steps: [], substitutions: [],
    };
    repo.recipes = [recipe];
    const r = await handleMessage(repo, user, "اذا اكلت وجبة 3000 سعرة هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
    expect(r.suggested_recipe).not.toBeNull();
    expect((r.suggested_recipe as { slug: string }).slug).toBe("light-salad");
    expect(r.reply).toContain("سلطة خفيفة");
  });

  it("رقم سعرات صريح بدون اسم طعام ('اذا اخذت وجبة 700 سعرة؟') -> يحسب من الرقم مباشرة، صفر تسجيل", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u5");
    const r = await handleMessage(repo, user, "اذا اخذت وجبة 700 سعرة؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("صفر طعام معروف وصفر رقم سعرات -> سؤال توضيحي، صفر تسجيل", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u6");
    const r = await handleMessage(repo, user, "شنو اذا اكلت؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("تسجيل حقيقي يبقى يعمل بالضبط كالسابق ('اكلت بيضتين' بدون 'إذا'/'لو') -> meal_logged=true", async () => {
    const repo = setupRepo();
    const user = await freshUser(repo, "u7");
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now;
    const r = await handleMessage(repo, user, "اكلت بيضتين", now);
    expect(r.meal_logged).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });
});

describe("detectIntent — WHAT_IF لا يتفعّل بدون فعل استهلاك حقيقي بالرسالة", () => {
  it("'لو' بدون أي فعل استهلاك -> لا يصنَّف WHAT_IF أبدًا", () => {
    const intent = detectIntent("لو تگدر تساعدني بشي", {});
    expect(intent).not.toBe(WHAT_IF);
  });

  it("'اذا اكلت برجر هسه' مع فعل استهلاك حقيقي -> WHAT_IF بالضبط", () => {
    const intent = detectIntent("اذا اكلت برجر هسه", {});
    expect(intent).toBe(WHAT_IF);
  });

  it("رسالة استهلاك حقيقية عادية بدون 'إذا'/'لو' -> تبقى تتجه لـLOG_MEAL كالمعتاد", () => {
    const intent = detectIntent("اكلت برجر", {});
    expect(intent).toBe(LOG_MEAL);
  });
});
