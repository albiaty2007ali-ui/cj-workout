/**
 * اختبارات تكافؤ شاملة لـorchestrator.ts — القيم المتوقعة من تشغيل حقيقي كامل لـ
 * nutrition_engine.handle_message() (نقطة الدخول الفعلية بالإنتاج) عبر تطبيق Flask+SQLAlchemy
 * حقيقي بالذاكرة، لمستخدمين طازجين بنفس بروفايل tests/conftest.py (25 سنة، 80كغم، 175سم، رجل،
 * هدف نزول، نشاط متوسط -> calorie_target=2249). الردود العشوائية (random.choice) تُتحقق بأنها
 * ضمن مجموعة القوالب الصحيحة، والأجزاء الحتمية (الأرقام، الأسماء) تُتحقق حرفيًا.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryRepository, DEFAULT_MILESTONES } from "../db/inMemoryRepository.js";
import { makeUser } from "./testHelpers.js";
import { handleMessage } from "../orchestrator.js";
import * as responses from "../responses.js";
import type { NutritionProfileRecord } from "../db/repository.js";

const STANDARD_PROFILE: Omit<NutritionProfileRecord, "user_id"> = {
  age: 25, weight_kg: 80, height_cm: 175, sex: "male", goal: "lose", activity_level: "moderate",
  bmr: 1774, tdee: 2749, calorie_target: 2249, water_target_ml: 2640, goal_weight: null,
};

function setupRepo(): InMemoryRepository {
  const repo = new InMemoryRepository();
  repo.streakMilestones = DEFAULT_MILESTONES;
  return repo;
}

async function freshUser(repo: InMemoryRepository, id: string): Promise<ReturnType<typeof makeUser>> {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  // يسجّل المستخدم فعليًا بالـRepository — يحاكي وجود الصف بالـDB الحقيقية قبل أي رسالة شات
  // (بدونه، incrementFreeMealsUsedIfBelowCap الذرية ما تلقى صف موجود وترفض التحديث بالخطأ).
  await repo.saveUser(user);
  return user;
}

describe("orchestrator.handleMessage — تكافؤ حرفي مع nutrition_engine.handle_message", () => {
  let repo: InMemoryRepository;

  beforeEach(() => {
    repo = setupRepo();
  });

  it("'هلا' -> GREETING (رد من ضمن GREETING_TEMPLATES، صفر تسجيل)", async () => {
    const user = await freshUser(repo, "g1");
    const r = await handleMessage(repo, user, "هلا");
    expect(r.meal_logged).toBe(false);
    expect(responses.GREETING_TEMPLATES).toContain(r.reply);
  });

  it("'شكد باقيلي' بيوم فاضي -> 2249 من أصل 2249 حرفيًا", async () => {
    const user = await freshUser(repo, "g2");
    const r = await handleMessage(repo, user, "شكد باقيلي");
    expect(r.reply).toBe("باقيلك تقريبًا 2249 سعرة من أصل 2249 kcal اليوم. تحب أقترحلك وجبة ضمنها؟");
  });

  it("'شنو فايدة البروتين' -> جواب من ضمن قوالب GENERAL_NUTRITION['protein']", async () => {
    const user = await freshUser(repo, "g3");
    const r = await handleMessage(repo, user, "شنو فايدة البروتين");
    expect(responses.GENERAL_NUTRITION_TEMPLATES.protein).toContain(r.reply);
  });

  it("'شربت نص لتر' -> 500 مل + محطة 'أول يوم' +5XP (أجزاء حتمية داخل رد فيه قوالب عشوائية)", async () => {
    const user = await freshUser(repo, "g4");
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now; // InMemoryRepository تختم created_at بالساعة الحقيقية إلا لو انضبطت صراحة
    const r = await handleMessage(repo, user, "شربت نص لتر", now);
    expect(r.reply).toContain("مجموع اليوم: 500 مل 💧");
    expect(r.reply).toContain('🔥 أول يوم 🔥! +5 XP');
  });

  it("'وزني هسه 78' -> يعيد حساب الهدف (2218) ويعرض '78.0' (تطابق تنسيق float بايثون)", async () => {
    const user = await freshUser(repo, "g5");
    const r = await handleMessage(repo, user, "وزني هسه 78");
    expect(r.target_calories).toBe(2218);
    expect(r.reply).toContain("78.0 كغم");
    expect(r.reply).toContain("2218 سعرة");
  });

  it("بناء وجبة عبر رسالتين (توضيح كمية) -> 'اكلت تمرات' ثم '5' -> نفس الأرقام الحقيقية (113 سعرة)", async () => {
    const user = await freshUser(repo, "g6");
    const lateNight = new Date("2026-09-08T01:00:00Z"); // بغداد 04:00 -> late_night -> dinner

    // النص كامل يجمع قالب Header عشوائي + سطر Portion حتمي + قالب Footer عشوائي (5×3 تركيبة) —
    // نتحقق من الجزء الحتمي فقط، لا نطابق نصًا واحدًا حرفيًا على رد أصلًا عشوائي بكلا اللغتين.
    const r1 = await handleMessage(repo, user, "اكلت تمرات", lateNight);
    const [headerLine, portionLine] = r1.reply!.split("\n");
    expect(portionLine).toBe("🍽️ حبة");
    expect(responses.CLARIFY_QUANTITY_HEADER_TEMPLATES.map((t) => t.replace("{food}", "تمرة"))).toContain(headerLine);

    const r2 = await handleMessage(repo, user, "5", lateNight);
    expect(r2.reply).toContain("صار عندي لـالعشاء: تمرة");
    expect(r2.reply).toContain("🔥 تقريباً 113 سعرة");
    expect(responses.MEAL_CONFIRM_PROMPT_TEMPLATES.map((t) => t.replace("{meal}", "العشاء"))).toContain(
      r2.reply!.split("\n\n")[1],
    );
  });

  it("'راح انام' (END_DAY) بيوم فاضي -> ملخص حرفي كامل", async () => {
    const user = await freshUser(repo, "g8");
    const r = await handleMessage(repo, user, "راح انام");
    expect(r.reply).toBe(
      "ملخص يومك 📋\n🔥 السعرات: 0 / 2249 kcal\n" +
      "🍗 بروتين: 0غ | 🍞 كارب: 0غ | 🥑 دهون: 0غ\n" +
      "💧 الماي: 0 مل\n" +
      "🍽️ عدد الوجبات المسجلة: 0\n⭐ XP الحالي: 0\n\n" +
      "\nبطل 🔥 اليوم كان مرتب جدًا. استمر، يوم وراء يوم راح تشوف الفرق.",
    );
  });

  it("'مشتهي دولمة' (EXPRESS_CRAVING) -> رد من ضمن قوالب craving مع اسم الطعام الحقيقي", async () => {
    const user = await freshUser(repo, "g9");
    const r = await handleMessage(repo, user, "مشتهي دولمة");
    const expectedOptions = responses.CRAVING_ACK_WITH_FOOD_TEMPLATES.map((t) => t.replace("{food}", "دولمة"));
    expect(expectedOptions).toContain(r.reply);
  });

  it("'راح اكل تمن' (PLAN_TO_EAT) -> رد من ضمن قوالب plan مع 'تمن (رز)'", async () => {
    const user = await freshUser(repo, "g9b");
    const r = await handleMessage(repo, user, "راح اكل تمن");
    const expectedOptions = responses.PLAN_ACK_WITH_FOOD_TEMPLATES.map((t) => t.replace("{food}", "تمن (رز)"));
    expect(expectedOptions).toContain(r.reply);
  });

  it("'اكلت بيضتين' (DIRECT_LOG) -> تطابق حرفي كامل مع الحقول الرقمية الحقيقية", async () => {
    const user = await freshUser(repo, "direct1");
    const now = new Date("2026-09-08T10:00:00Z");
    repo.now = now; // InMemoryRepository تختم created_at بالساعة الحقيقية إلا لو انضبطت صراحة
    const r = await handleMessage(repo, user, "اكلت بيضتين", now);
    expect(r.meal_logged).toBe(true);
    expect(r.today_calories).toBe(155); // بيضتين = 2×50غ -> computeNutrition(1,100) = 155 kcal
    expect(r.target_calories).toBe(2249);
    expect(r.remaining).toBe(2094);
    expect(r.xp).toBe(15); // 10 وجبة + 5 محطة "أول يوم"
    expect(r.free_meals_used).toBe(1);
    expect(r.reply).toContain("155 سعرة");
  });

  it("'وصفة دجاج' (ASK_RECIPE) -> تطابق حرفي كامل مع بيانات recipes_seed.py الحقيقية", async () => {
    repo.recipes = [
      {
        id: "r1", name: "دجاج مشوي مع سلطة", slug: "grilled-chicken-salad",
        description: "وجبة غداء عالية البروتين ومنخفضة الدهون.", category_id: "c1", active: true,
        calories: 380, protein: 40, carbs: 10, fat: 18, fiber: null,
        prep_time_min: 10, cook_time_min: 15, servings: 1, difficulty: "medium",
        match_keywords: "دجاج مشوي|دجاج بالخضار|سلطة دجاج", source: null, tags: [],
        ingredients: [
          { name: "صدر دجاج", quantity: "1", unit: "قطعة" },
          { name: "خس وخيار وطماطة", quantity: null, unit: "للسلطة" },
          { name: "زيت زيتون", quantity: "1", unit: "ملعقة" },
          { name: "ليمون", quantity: null, unit: "حسب الرغبة" },
          { name: "ملح وبهار", quantity: null, unit: "حسب الرغبة" },
        ],
        steps: [], substitutions: [],
      },
    ];
    const user = await freshUser(repo, "r1user");
    const r = await handleMessage(repo, user, "وصفة دجاج");
    // مطابقة جزئية للأجزاء الرقمية/النصية الحساسة (تفادي مخاطرة كتابة يدوية لتسلسل ايموجي ZWJ)
    expect(r.reply).toContain("🍳 دجاج مشوي مع سلطة");
    expect(r.reply).toContain("السعرات التقريبية: 380 kcal | بروتين 40.0غ | كارب 10.0غ | دهون 18.0غ");
    expect(r.reply).toContain(
      "المكونات:\n- صدر دجاج (1 قطعة)\n- خس وخيار وطماطة (للسلطة)\n- زيت زيتون (1 ملعقة)\n- ليمون (حسب الرغبة)\n- ملح وبهار (حسب الرغبة)",
    );
    expect(r.reply).toContain("أو شوف الوصفة كاملة: /recipes/grilled-chicken-salad");
  });

  it("'وصفة دجاج' (ASK_RECIPE) بعد تجاوز الهدف اليومي -> رفض بدء طبخة جديدة، صفر current_recipe_id", async () => {
    repo.recipes = [
      {
        id: "r2", name: "دجاج مشوي مع سلطة", slug: "grilled-chicken-salad",
        description: "وجبة غداء عالية البروتين ومنخفضة الدهون.", category_id: "c1", active: true,
        calories: 380, protein: 40, carbs: 10, fat: 18, fiber: null,
        prep_time_min: 10, cook_time_min: 15, servings: 1, difficulty: "medium",
        match_keywords: "دجاج مشوي|دجاج بالخضار|سلطة دجاج", source: null, tags: [],
        ingredients: [], steps: [], substitutions: [],
      },
    ];
    const user = await freshUser(repo, "r2user");
    // تجاوز الهدف (2249) مباشرة بصف MealLog حقيقي — نفس تحقق /api/recipes-actions?action=start
    await repo.insertMealLog({
      user_id: user.id, meal_type: "lunch", raw_text: "test", matched_foods_json: null,
      total_calories: 2500, total_protein: 0, total_carbs: 0, total_fat: 0, is_free_meal: true,
    });
    const r = await handleMessage(repo, user, "وصفة دجاج");
    expect(r.reply).toBe(
      'وصلت لهدف السعرات اليومي 🎯 "دجاج مشوي مع سلطة" راح تزيد سعراتك أكثر من هدفك اليوم. تحب تشوف وصفة أخف بدالها؟',
    );
    expect(r.meal_logged).toBe(false);
    expect(user.current_recipe_id).toBeNull(); // ما بدأ الـTutorial فعليًا
  });
});
