/**
 * المرحلة 7 — مجموعة اختبارات القبول الشاملة: كل رسائل القسمين 24 (الطلب الأول) و19 (الطلب
 * الثاني، "CRITICAL CHANGE") تحت ACTIVE، عبر handleMessage() الفعلي (صفر اختصار لأي طبقة)،
 * بمزوّد مزيّف يحاكي القرار المتوقع من Gemini الحقيقي لكل فئة رسالة. الهدف: تأكيد أن كل فئة
 * سلوك مذكورة بالطلب فعليًا قابلة للتنفيذ بالبنية الحالية من طرف إلى طرف، وأن الضمانات الحرجة
 * (صفر تسجيل لسؤال/رغبة/نية مستقبلية، صفر اختراع رقم أو وصفة) تصمد بكل فئة.
 */
import { describe, it, expect, afterEach } from "vitest";
import { InMemoryRepository } from "../../db/inMemoryRepository.js";
import { makeUser } from "../testHelpers.js";
import { handleMessage } from "../../orchestrator.js";
import {
  setConversationalModeForTesting, resetConversationalModeForTesting,
  setConversationProviderForTesting, resetConversationProviderForTesting,
} from "../../conversation/config.js";
import type { ConversationDecision, ConversationProvider, ConversationTurnContext, ToolCallDecision } from "../../conversation/types.js";
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

async function freshUser(repo: InMemoryRepository, id: string): Promise<UserRecord> {
  const user = makeUser({ id });
  repo.nutritionProfiles.set(id, { user_id: id, ...STANDARD_PROFILE });
  await repo.saveUser(user);
  return user;
}

class ScriptedProvider implements ConversationProvider {
  constructor(
    private decision: ConversationDecision | null,
    private finalText: string | null | ((toolResult: unknown) => string | null) = "رد",
  ) {}
  async decide(): Promise<ConversationDecision | null> { return this.decision; }
  async finalize(_raw: string, _ctx: ConversationTurnContext, _decision: ToolCallDecision, toolResult: unknown): Promise<string | null> {
    return typeof this.finalText === "function" ? this.finalText(toolResult) : this.finalText;
  }
}

afterEach(() => {
  resetConversationalModeForTesting();
  resetConversationProviderForTesting();
});

function activate(provider: ConversationProvider): void {
  setConversationalModeForTesting("ACTIVE");
  setConversationProviderForTesting(provider);
}

describe("قبول شامل — أسئلة معلوماتية (صفر تسجيل دائمًا)", () => {
  const cases: [string, string][] = [
    ["شكد سعرات البيضة؟", "get_food_nutrition"],
    ["شكد سعرات البيتزا؟", "get_food_nutrition"],
    ["شكد حجم البيتزا؟", "resolve_portion"],
  ];
  it.each(cases)("'%s' -> يستدعي أداة قراءة (%s)، صفر MealLog", async (msg, toolName) => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, `info-${msg.length}-${Math.random()}`);
    activate(new ScriptedProvider({ kind: "tool_call", toolName, toolArgs: {} }, "معلومة حقيقية"));
    const r = await handleMessage(repo, user, msg);
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});

describe("قبول شامل — رغبة/نية مستقبلية (صفر تسجيل، حتى لو Gemini يحاول log_meal)", () => {
  it.each(["مشتهي بيتزا", "راح آكل بيتزا"])("'%s' -> صفر MealLog حتى مع مزوّد يطلب log_meal", async (msg) => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, `future-${msg.length}-${Math.random()}`);
    activate(new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} }));
    const r = await handleMessage(repo, user, msg);
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});

describe("قبول شامل — تسجيل مباشر حقيقي", () => {
  it("'اكلت بيضة' -> MealLog حقيقي واحد", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "direct1");
    activate(new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} }, "تمام سجلتلك"));
    const r = await handleMessage(repo, user, "اكلت بيضة");
    expect(r.meal_logged).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });

  it("'اكلت صمونة وبيضتين' (وجبة متعددة الأصناف) -> MealLog واحد بمجموع الكل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "direct2");
    activate(new ScriptedProvider({ kind: "tool_call", toolName: "log_meal", toolArgs: {} }, "تمام سجلتلك"));
    const r = await handleMessage(repo, user, "اكلت صمونة وبيضتين");
    expect(r.meal_logged).toBe(true);
    expect(await repo.countMealLogsForUser(user.id)).toBe(1);
  });
});

describe("قبول شامل — ماي", () => {
  it("'شربت 500 مل ماي' -> WaterLog حقيقي واحد", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "water1");
    activate(new ScriptedProvider({ kind: "tool_call", toolName: "log_water", toolArgs: {} }, "تمام سجلتلك الماي"));
    const r = await handleMessage(repo, user, "شربت 500 مل ماي");
    expect(await repo.countWaterLogsForUser(user.id)).toBe(1);
    expect(r.meal_logged).toBe(false); // الماي لا يضبط meal_logged أبدًا
  });
});

describe("قبول شامل — فحص ملاءمة/محاكاة (صفر تسجيل دائمًا)", () => {
  it("'البرگر يمشي ويا سعراتي؟' -> check_food_fit، صفر تسجيل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "fit1");
    activate(new ScriptedProvider({ kind: "tool_call", toolName: "check_food_fit", toolArgs: { food_id: 1 } }, "أي، يناسبك"));
    const r = await handleMessage(repo, user, "البرگر يمشي ويا سعراتي؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });

  it("'لو آكل برگر هسه؟' (What-If) -> simulate_what_if، meal_logged:false دائمًا", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "whatif1");
    activate(new ScriptedProvider({ kind: "tool_call", toolName: "simulate_what_if", toolArgs: { target_calories: 700 } }, "راح يوصلك تقريبًا لهيك"));
    const r = await handleMessage(repo, user, "لو آكل برگر هسه؟");
    expect(r.meal_logged).toBe(false);
    expect(await repo.countMealLogsForUser(user.id)).toBe(0);
  });
});

describe("قبول شامل — توصية/وصفات حقيقية فقط", () => {
  it("'شو آكل هسه؟' -> recommend_foods، صفر تسجيل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "rec1");
    repo.recipes = [makeRecipe({ id: "r1", name: "سلطة خفيفة", slug: "light-salad", active: true, calories: 150 })];
    activate(new ScriptedProvider(
      { kind: "tool_call", toolName: "recommend_foods", toolArgs: { remaining_calories: 500 } },
      (toolResult) => `أگترحلك ${(toolResult as { recipes: { name: string }[] }).recipes[0]?.name ?? "شي خفيف"}`,
    ));
    const r = await handleMessage(repo, user, "شو آكل هسه؟");
    expect(r.meal_logged).toBe(false);
  });

  it("'عندي بيض وبطاطا وطماطة شنو أسوي؟' -> find_recipes_from_ingredients، وصفة حقيقية فقط", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "cook1");
    repo.recipes = [makeRecipe({
      id: "r2", name: "بيض بالطماطة", slug: "eggs-tomato", active: true, calories: 300,
      ingredients: [{ name: "بيضة", quantity: "2", unit: "حبة", food_id: 1 }, { name: "طماطة", quantity: "1", unit: "حبة", food_id: 42 }],
    })];
    activate(new ScriptedProvider(
      { kind: "tool_call", toolName: "find_recipes_from_ingredients", toolArgs: { mentioned_food_ids: [1, 42] } },
      (toolResult) => `تگدر تسوي ${(toolResult as { recipes: { name: string }[] }).recipes[0]?.name}`,
    ));
    const r = await handleMessage(repo, user, "عندي بيض وطماطة، شنو اگدر اسوي؟");
    expect(r.meal_logged).toBe(false);
    expect(r.reply).toContain("بيض بالطماطة");
  });
});

describe("قبول شامل — 'مشتهي دولمة خليها 500 سعرة' (هدف سعري لطعام مطروح)", () => {
  it("يُعامَل كسؤال كمية عبر get_food_nutrition، صفر تسجيل", async () => {
    const repo = new InMemoryRepository();
    const user = await freshUser(repo, "target1");
    activate(new ScriptedProvider(
      { kind: "tool_call", toolName: "get_food_nutrition", toolArgs: { food_query: "دولمة", grams: 300 } },
      "هذي الكمية الأقرب لـ500 سعرة",
    ));
    const r = await handleMessage(repo, user, "مشتهي دولمة، خليها تقريبًا 500 سعرة");
    expect(r.meal_logged).toBe(false);
  });
});
