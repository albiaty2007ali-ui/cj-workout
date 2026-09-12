/**
 * سجل الأدوات (CJTool Registry) — الجسر الوحيد بين Gemini وأي بيانات/حساب حقيقي. كل أداة هنا
 * غلاف رقيق فوق دالة موجودة فعلًا (foodSearch.ts/calculator.ts/context.ts/recommendations.ts/
 * recipeSearch.ts/ingredientResolver.ts/recipeMatching.ts) — صفر منطق أعمال جديد يُخترع هنا.
 *
 * أدوات القراءة فقط (10) بهذا الملف — أدوات التحوّر (log_meal/undo_last_meal) بملف منفصل
 * conversation/mutationTools.ts (المرحلة 2) لفصل واضح بين "صفر مخاطر" و"يحتاج تحقق صارم".
 *
 * كل أداة تُحصر نتائجها (Top 5-10 كحد أقصى) — أبدًا لا تُرسَل قائمة كاملة (foods.sqlite/كل
 * الوصفات) لـGemini، سواء لتوفير التكلفة أو لأن نموذج اللغة لا يحتاج أكثر من بضع خيارات ليصوغ ردًا.
 */
import { getFoodDb, queryOne } from "../db/foodDb.js";
import * as calculatorMod from "../calculator.js";
import * as contextMod from "../context.js";
import * as foodSearchMod from "../foodSearch.js";
import * as recommendationsMod from "../recommendations.js";
import * as recipeSearchMod from "../recipeSearch.js";
import { resolveIngredientName } from "../ingredientResolver.js";
import { scoreRecipesByIngredients, classifyMatchTier, type MentionedFood } from "../recipeMatching.js";
import type { CJTool, ToolExecContext } from "./types.js";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

async function foodNameById(foodId: number): Promise<string | null> {
  const db = await getFoodDb();
  const row = queryOne(db, "SELECT name FROM foods WHERE id=?", [foodId]);
  return row ? String(row.name) : null;
}

// ---------------------------------------------------------------------------
// search_food
// ---------------------------------------------------------------------------
interface SearchFoodArgs { query: string }
interface SearchFoodMatch { food_id: number; food_name: string; resolved: boolean; grams?: number; tier: "exact" | "fuzzy" }
interface SearchFoodResult { matches: SearchFoodMatch[] }

export const searchFood: CJTool<SearchFoodArgs, SearchFoodResult> = {
  name: "search_food",
  description:
    "يبحث عن طعام بالاسم داخل قاعدة بيانات الأطعمة الحقيقية ويرجّع أفضل التطابقات المعروفة " +
    "(أقصى 5). استخدمها أول شي إذا ما عندك food_id جاهز لأداة ثانية.",
  parameters: {
    type: "OBJECT",
    properties: { query: { type: "STRING", description: "اسم الطعام بالعربي، مثلاً: بيضة أو رز أو طماطة" } },
    required: ["query"],
  },
  mutates: false,
  async execute(_ctx: ToolExecContext, args: SearchFoodArgs): Promise<SearchFoodResult> {
    const query = String(args?.query ?? "").trim();
    if (!query) return { matches: [] };
    const { results } = await foodSearchMod.matchMessageWithMeta(query);
    if (results.length > 0) {
      return {
        matches: results.slice(0, 5).map((r) => ({
          food_id: r.food_id, food_name: r.food_name, resolved: r.resolved, grams: r.grams, tier: "exact" as const,
        })),
      };
    }
    const fuzzy = await resolveIngredientName(query);
    if (fuzzy) {
      return { matches: [{ food_id: fuzzy.food_id, food_name: fuzzy.food_name, resolved: true, tier: fuzzy.tier }] };
    }
    return { matches: [] };
  },
};

// ---------------------------------------------------------------------------
// get_food_nutrition
// ---------------------------------------------------------------------------
interface GetFoodNutritionArgs { food_id?: number; food_query?: string; grams: number }
interface GetFoodNutritionResult {
  found: boolean; food_id?: number; food_name?: string | null; grams?: number;
  calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number;
}

export const getFoodNutrition: CJTool<GetFoodNutritionArgs, GetFoodNutritionResult> = {
  name: "get_food_nutrition",
  description:
    "يحسب السعرات/البروتين/الكارب/الدهون الحقيقية لوزن معيّن (بالغرام) من طعام معروف. مرّر " +
    "food_id إذا متوفر (من search_food)، وإلا food_query وسيُحل تلقائيًا.",
  parameters: {
    type: "OBJECT",
    properties: {
      food_id: { type: "NUMBER", description: "معرّف الطعام الحقيقي" },
      food_query: { type: "STRING", description: "اسم الطعام إذا ما توفر food_id" },
      grams: { type: "NUMBER", description: "الوزن بالغرام" },
    },
    required: ["grams"],
  },
  mutates: false,
  async execute(_ctx: ToolExecContext, args: GetFoodNutritionArgs): Promise<GetFoodNutritionResult> {
    const grams = clamp(Number(args?.grams), 1, 5000);
    let foodId = args?.food_id != null ? Number(args.food_id) : null;
    let foodName: string | null = null;
    if (foodId == null && args?.food_query) {
      const { results } = await foodSearchMod.matchMessageWithMeta(String(args.food_query));
      if (results[0]) {
        foodId = results[0].food_id; foodName = results[0].food_name;
      } else {
        const fuzzy = await resolveIngredientName(String(args.food_query));
        if (fuzzy) { foodId = fuzzy.food_id; foodName = fuzzy.food_name; }
      }
    }
    if (foodId == null) return { found: false };
    if (foodName == null) foodName = await foodNameById(foodId);
    if (foodName == null) return { found: false }; // food_id مخترع/غير موجود فعلًا بالقاعدة
    const nutrition = await calculatorMod.computeFood(foodId, grams);
    return { found: true, food_id: foodId, food_name: foodName, grams, ...nutrition };
  },
};

// ---------------------------------------------------------------------------
// resolve_portion
// ---------------------------------------------------------------------------
interface ResolvePortionArgs { food_id: number; portion_text?: string }
interface ResolvePortionResult {
  found: boolean;
  portions?: { portion_name: string; grams: number }[];
  resolved_from_text?: { resolved: boolean; grams?: number; portion_name?: string };
}

export const resolvePortion: CJTool<ResolvePortionArgs, ResolvePortionResult> = {
  name: "resolve_portion",
  description: "يرجّع كل الأحجام/الحصص الحقيقية المعروفة لطعام معيّن (خاشوقة/صحن/حبة...)، أو يحاول فهم كمية نصية محددة إذا انعطت.",
  parameters: {
    type: "OBJECT",
    properties: {
      food_id: { type: "NUMBER", description: "معرّف الطعام" },
      portion_text: { type: "STRING", description: "نص كمية حر لتفسيره، مثلاً: صحن متوسط أو 300 غرام" },
    },
    required: ["food_id"],
  },
  mutates: false,
  async execute(_ctx: ToolExecContext, args: ResolvePortionArgs): Promise<ResolvePortionResult> {
    const foodId = Number(args?.food_id);
    if (!Number.isFinite(foodId)) return { found: false };
    const name = await foodNameById(foodId);
    if (name == null) return { found: false };
    const rows = await foodSearchMod.getPortionsFor(foodId);
    const portions = rows.map((r) => ({ portion_name: String(r.portion_name ?? "حصة"), grams: Number(r.grams) }));
    const result: ResolvePortionResult = { found: true, portions };
    if (args?.portion_text) {
      result.resolved_from_text = await foodSearchMod.resolveQuantityForFood(foodId, String(args.portion_text));
    }
    return result;
  },
};

// ---------------------------------------------------------------------------
// calculate_meal_nutrition
// ---------------------------------------------------------------------------
interface CalcMealItemArg { food_id: number; grams: number }
interface CalcMealNutritionArgs { items: CalcMealItemArg[] }
interface CalcMealItemResult { food_id: number; food_name: string; grams: number; calories: number; protein: number; carbs: number; fat: number }
interface CalcMealNutritionResult {
  items: CalcMealItemResult[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
  dropped_unknown_food_ids: number[];
}

export const calculateMealNutrition: CJTool<CalcMealNutritionArgs, CalcMealNutritionResult> = {
  name: "calculate_meal_nutrition",
  description: "يحسب مجموع السعرات/الماكروز لعدة أطعمة (food_id + غرام) معًا — لوجبة فيها أكثر من صنف.",
  parameters: {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { food_id: { type: "NUMBER" }, grams: { type: "NUMBER" } },
          required: ["food_id", "grams"],
        },
      },
    },
    required: ["items"],
  },
  mutates: false,
  async execute(_ctx: ToolExecContext, args: CalcMealNutritionArgs): Promise<CalcMealNutritionResult> {
    const items: CalcMealItemResult[] = [];
    const dropped: number[] = [];
    for (const raw of Array.isArray(args?.items) ? args.items : []) {
      const foodId = Number(raw?.food_id);
      if (!Number.isFinite(foodId)) continue;
      const name = await foodNameById(foodId);
      if (name == null) { dropped.push(foodId); continue; } // food_id غير حقيقي — يُهمَل، صفر تخمين
      const grams = clamp(Number(raw?.grams), 1, 5000);
      const n = await calculatorMod.computeFood(foodId, grams);
      items.push({ food_id: foodId, food_name: name, grams, ...n });
    }
    const totals = calculatorMod.totalsForItems(items);
    return { items, totals, dropped_unknown_food_ids: dropped };
  },
};

// ---------------------------------------------------------------------------
// get_daily_summary  (يدمج get_remaining_calories + get_current_day_state)
// ---------------------------------------------------------------------------
export const getDailySummary: CJTool<Record<string, never>, contextMod.NutritionContext> = {
  name: "get_daily_summary",
  description: "يرجّع ملخص اليوم الحقيقي للمستخدم: السعرات المستهلكة/المتبقية/الهدف، الماكروز، الماء، عدد الوجبات، الهدف، الفترة الحالية.",
  parameters: { type: "OBJECT", properties: {} },
  mutates: false,
  async execute(ctx: ToolExecContext): Promise<contextMod.NutritionContext> {
    const profile = await ctx.repo.findNutritionProfile(ctx.user.id);
    return contextMod.build(ctx.repo, ctx.user.id, profile, ctx.now);
  },
};

// ---------------------------------------------------------------------------
// get_user_profile
// ---------------------------------------------------------------------------
interface GetUserProfileResult {
  goal: string | null; activity_level: string | null; calorie_target: number | null; water_target_ml: number | null;
  is_premium: boolean; free_meals_used: number; xp: number; streak_days: number;
}

export const getUserProfile: CJTool<Record<string, never>, GetUserProfileResult> = {
  name: "get_user_profile",
  description: "يرجّع ملف المستخدم الغذائي المختصر (الهدف/مستوى النشاط/هدف السعرات) + حالة الاشتراك/XP/الستريك — بدون أي معلومة شخصية حساسة.",
  parameters: { type: "OBJECT", properties: {} },
  mutates: false,
  async execute(ctx: ToolExecContext): Promise<GetUserProfileResult> {
    const profile = await ctx.repo.findNutritionProfile(ctx.user.id);
    return {
      goal: profile?.goal ?? null,
      activity_level: profile?.activity_level ?? null,
      calorie_target: profile?.calorie_target ?? null,
      water_target_ml: profile?.water_target_ml ?? null,
      is_premium: ctx.user.is_premium,
      free_meals_used: ctx.user.free_meals_used,
      xp: ctx.user.xp,
      streak_days: ctx.user.streak_days,
    };
  },
};

// ---------------------------------------------------------------------------
// search_diet_meals
// ---------------------------------------------------------------------------
interface SearchDietMealsArgs { query?: string; category_id?: string | null }
interface RecipeSummary {
  id: string; slug: string; name: string; calories: number; protein: number; carbs: number; fat: number; difficulty: string;
}
interface SearchDietMealsResult { recipes: RecipeSummary[] }

function toSummary(r: { id: string; slug: string; name: string; calories: number; protein: number; carbs: number; fat: number; difficulty: string }): RecipeSummary {
  return { id: r.id, slug: r.slug, name: r.name, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, difficulty: r.difficulty };
}

export const searchDietMeals: CJTool<SearchDietMealsArgs, SearchDietMealsResult> = {
  name: "search_diet_meals",
  description: "يبحث عن وصفات حقيقية بقسم وجبات الدايت (بالاسم أو التصنيف) — يرجّع أعلى 5 نتائج فقط، أبدًا لا يخترع وصفة.",
  parameters: {
    type: "OBJECT",
    properties: {
      query: { type: "STRING", description: "كلمة بحث اختيارية (اسم وصفة/مكوّن)" },
      category_id: { type: "STRING", description: "معرّف تصنيف اختياري" },
    },
  },
  mutates: false,
  async execute(ctx: ToolExecContext, args: SearchDietMealsArgs): Promise<SearchDietMealsResult> {
    const results = await recipeSearchMod.searchRecipes(ctx.repo, args?.query ?? "", args?.category_id ?? null);
    return { recipes: results.slice(0, 5).map(toSummary) };
  },
};

// ---------------------------------------------------------------------------
// get_recipe
// ---------------------------------------------------------------------------
interface GetRecipeArgs { recipe_id?: string; slug?: string }
interface GetRecipeResult { found: boolean; recipe?: RecipeSummary & { ingredients: { name: string; quantity: string | null; unit: string | null }[] } }

export const getRecipe: CJTool<GetRecipeArgs, GetRecipeResult> = {
  name: "get_recipe",
  description: "يرجّع تفاصيل وصفة حقيقية واحدة عبر id أو slug فعلي — لو المعرّف غير موجود بالقاعدة يرجّع found:false (لا يخترع وصفة).",
  parameters: {
    type: "OBJECT",
    properties: { recipe_id: { type: "STRING" }, slug: { type: "STRING" } },
  },
  mutates: false,
  async execute(ctx: ToolExecContext, args: GetRecipeArgs): Promise<GetRecipeResult> {
    const recipe = args?.recipe_id
      ? await ctx.repo.findRecipeById(args.recipe_id)
      : args?.slug ? await ctx.repo.findRecipeBySlug(args.slug) : null;
    if (!recipe) return { found: false };
    return {
      found: true,
      recipe: {
        ...toSummary(recipe),
        ingredients: recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// find_recipes_from_ingredients
// ---------------------------------------------------------------------------
interface FindRecipesArgs { mentioned_food_ids?: number[]; mentioned_names?: string[] }
interface ScoredRecipeResult extends RecipeSummary {
  match_percentage: number; tier: string; missing_required: string[]; missing_optional: string[];
}
interface FindRecipesResult { recipes: ScoredRecipeResult[] }

export const findRecipesFromIngredients: CJTool<FindRecipesArgs, FindRecipesResult> = {
  name: "find_recipes_from_ingredients",
  description: "يبحث عن وصفات حقيقية من قسم وجبات الدايت تناسب مكونات موجودة عند المستخدم (food_id حقيقية بالأولوية، أسماء كـfallback).",
  parameters: {
    type: "OBJECT",
    properties: {
      mentioned_food_ids: { type: "ARRAY", items: { type: "NUMBER" } },
      mentioned_names: { type: "ARRAY", items: { type: "STRING" } },
    },
  },
  mutates: false,
  async execute(ctx: ToolExecContext, args: FindRecipesArgs): Promise<FindRecipesResult> {
    const byId: MentionedFood[] = (args?.mentioned_food_ids ?? []).map((id) => ({ food_id: Number(id), food_name: "" }));
    const byName: MentionedFood[] = (args?.mentioned_names ?? []).map((name) => ({ food_id: null, food_name: String(name) }));
    const mentioned: MentionedFood[] = [...byId, ...byName];
    if (mentioned.length === 0) return { recipes: [] };
    const recipes = await ctx.repo.findActiveRecipes(null);
    const scored = scoreRecipesByIngredients(recipes, mentioned).slice(0, 3);
    return {
      recipes: scored.map((s) => ({
        ...toSummary(s.recipe), match_percentage: Math.round(s.matchPercentage * 100),
        tier: classifyMatchTier(s.matchPercentage), missing_required: s.missingRequired, missing_optional: s.missingOptional,
      })),
    };
  },
};

// ---------------------------------------------------------------------------
// recommend_foods
// ---------------------------------------------------------------------------
interface RecommendFoodsArgs { remaining_calories?: number; protein_needed?: number }
interface RecommendFoodsResult { text: string; recipes: RecipeSummary[] }

export const recommendFoods: CJTool<RecommendFoodsArgs, RecommendFoodsResult> = {
  name: "recommend_foods",
  description: "يقترح أطعمة/وجبات حقيقية تناسب السعرات المتبقية (ومرجّحة للبروتين إذا ناقص) — صفر اختراع.",
  parameters: {
    type: "OBJECT",
    properties: {
      remaining_calories: { type: "NUMBER" },
      protein_needed: { type: "NUMBER" },
    },
  },
  mutates: false,
  async execute(ctx: ToolExecContext, args: RecommendFoodsArgs): Promise<RecommendFoodsResult> {
    const remaining = clamp(Number(args?.remaining_calories) || 0, 0, 10000);
    const protein = clamp(Number(args?.protein_needed) || 0, 0, 500);
    const text = await recommendationsMod.suggestMealWithin(remaining, protein);
    const recipeAlts = await recipeSearchMod.suggestRecipesWithin(ctx.repo, remaining);
    return { text, recipes: recipeAlts.map(toSummary) };
  },
};

// ---------------------------------------------------------------------------
// check_food_fit
// ---------------------------------------------------------------------------
interface CheckFoodFitArgs { food_id: number; grams?: number }
interface CheckFoodFitResult { found: boolean; text?: string }

export const checkFoodFit: CJTool<CheckFoodFitArgs, CheckFoodFitResult> = {
  name: "check_food_fit",
  description: "يتحقق هل طعام معيّن يناسب السعرات المتبقية اليوم (يعتمد أصغر كمية حقيقية معروفة له).",
  parameters: { type: "OBJECT", properties: { food_id: { type: "NUMBER" }, grams: { type: "NUMBER" } }, required: ["food_id"] },
  mutates: false,
  async execute(ctx: ToolExecContext, args: CheckFoodFitArgs): Promise<CheckFoodFitResult> {
    const foodId = Number(args?.food_id);
    if (!Number.isFinite(foodId)) return { found: false };
    const name = await foodNameById(foodId);
    if (name == null) return { found: false };
    const profile = await ctx.repo.findNutritionProfile(ctx.user.id);
    const nutritionCtx = await contextMod.build(ctx.repo, ctx.user.id, profile, ctx.now);
    const text = await recommendationsMod.checkFoodFits(foodId, name, nutritionCtx.remaining_calories);
    return { found: true, text };
  },
};

// ---------------------------------------------------------------------------
// suggest_substitution
// ---------------------------------------------------------------------------
interface SuggestSubstitutionArgs { food_id: number }
interface SuggestSubstitutionResult { found: boolean; text?: string }

export const suggestSubstitution: CJTool<SuggestSubstitutionArgs, SuggestSubstitutionResult> = {
  name: "suggest_substitution",
  description: "يقترح بديل حقيقي أخف سعرات لنفس تصنيف طعام معيّن — صفر اختراع بديل غير موجود بالقاعدة.",
  parameters: { type: "OBJECT", properties: { food_id: { type: "NUMBER" } }, required: ["food_id"] },
  mutates: false,
  async execute(_ctx: ToolExecContext, args: SuggestSubstitutionArgs): Promise<SuggestSubstitutionResult> {
    const foodId = Number(args?.food_id);
    if (!Number.isFinite(foodId)) return { found: false };
    const name = await foodNameById(foodId);
    if (name == null) return { found: false };
    const text = await recommendationsMod.suggestLighterAlternative(foodId, name);
    return { found: true, text };
  },
};

// ---------------------------------------------------------------------------
// calculate_allowed_portion — "اليوم غدانا تمن" (وجبة مخطَّطة، لسا ما صارت): عدد دقيق (قسمة
// صحيحة) من أصغر حصة حقيقية مسجّلة يدخل بالسعرات المتبقية، صفر مدى مخترَع.
// ---------------------------------------------------------------------------
interface CalculateAllowedPortionArgs { food_id?: number; food_query?: string; remaining_calories?: number }
interface CalculateAllowedPortionResult { found: boolean; text?: string }

export const calculateAllowedPortion: CJTool<CalculateAllowedPortionArgs, CalculateAllowedPortionResult> = {
  name: "calculate_allowed_portion",
  description:
    "يحسب عدد الوحدات المسموحة (خاشوقة/قطعة/حبة...، أصغر وحدة حقيقية مسجّلة للطعام) من طعام معيّن " +
    "حسب السعرات المتبقية — استخدمها لوجبة مخطَّطة لليوم (\"اليوم غدانا تمن\") قبل ما تصير فعليًا، " +
    "مو للاستهلاك الفعلي. مرّر food_id إذا متوفر، وإلا food_query وسيُحل تلقائيًا. لو ما مرّرت " +
    "remaining_calories، يُستخدَم الباقي الحقيقي لليوم تلقائيًا (نفس get_daily_summary).",
  parameters: {
    type: "OBJECT",
    properties: {
      food_id: { type: "NUMBER" },
      food_query: { type: "STRING" },
      remaining_calories: { type: "NUMBER", description: "اختياري — الباقي الحقيقي لليوم يُستخدَم افتراضيًا" },
    },
  },
  mutates: false,
  async execute(ctx: ToolExecContext, args: CalculateAllowedPortionArgs): Promise<CalculateAllowedPortionResult> {
    let foodId = args?.food_id != null ? Number(args.food_id) : null;
    let foodName: string | null = null;
    if (foodId == null && args?.food_query) {
      const { results } = await foodSearchMod.matchMessageWithMeta(String(args.food_query));
      if (results[0]) {
        foodId = results[0].food_id; foodName = results[0].food_name;
      } else {
        const fuzzy = await resolveIngredientName(String(args.food_query));
        if (fuzzy) { foodId = fuzzy.food_id; foodName = fuzzy.food_name; }
      }
    }
    if (foodId == null) return { found: false };
    if (foodName == null) foodName = await foodNameById(foodId);
    if (foodName == null) return { found: false };

    let remaining = args?.remaining_calories;
    if (remaining == null) {
      const profile = await ctx.repo.findNutritionProfile(ctx.user.id);
      const nutritionCtx = await contextMod.build(ctx.repo, ctx.user.id, profile, ctx.now);
      remaining = nutritionCtx.remaining_calories;
    }
    const text = await recommendationsMod.suggestPortionCountForRemaining(foodId, foodName, remaining);
    return { found: true, text };
  },
};

// ---------------------------------------------------------------------------
// simulate_what_if — قراءة بحتة، صفر استدعاء لأي دالة كتابة بجسم الدالة (نفس ضمان handleWhatIf)
// ---------------------------------------------------------------------------
interface SimulateWhatIfArgs { items?: { food_id: number; grams: number }[]; target_calories?: number }
interface SimulateWhatIfResult {
  found: boolean; simulated_calories?: number; remaining_before?: number; remaining_after?: number;
  over_target_after?: boolean; single_food_id?: number | null;
}

export const simulateWhatIf: CJTool<SimulateWhatIfArgs, SimulateWhatIfResult> = {
  name: "simulate_what_if",
  description:
    "محاكاة حسابية بحتة لتأثير أكل شي معيّن على سعرات اليوم — صفر تسجيل وجبة أو أي تغيير فعلي، " +
    "فقط رقم متوقع. استخدمها لأسئلة \"لو أكلت X\" أو \"إذا آخذ وجبة N سعرة\".",
  parameters: {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: { type: "OBJECT", properties: { food_id: { type: "NUMBER" }, grams: { type: "NUMBER" } }, required: ["food_id", "grams"] },
      },
      target_calories: { type: "NUMBER" },
    },
  },
  mutates: false,
  async execute(ctx: ToolExecContext, args: SimulateWhatIfArgs): Promise<SimulateWhatIfResult> {
    const profile = await ctx.repo.findNutritionProfile(ctx.user.id);
    const nutritionCtx = await contextMod.build(ctx.repo, ctx.user.id, profile, ctx.now);

    let simulatedCalories = 0;
    let singleFoodId: number | null = null;
    if (args?.items && args.items.length > 0) {
      for (const it of args.items) {
        const foodId = Number(it.food_id);
        if (!Number.isFinite(foodId)) continue;
        const name = await foodNameById(foodId);
        if (name == null) continue; // food_id مخترع — يُتجاهَل، صفر تخمين
        const grams = clamp(Number(it.grams), 1, 5000);
        const n = await calculatorMod.computeFood(foodId, grams);
        simulatedCalories += n.calories;
      }
      if (args.items.length === 1) singleFoodId = Number(args.items[0].food_id);
    } else if (args?.target_calories != null) {
      simulatedCalories = clamp(Number(args.target_calories), 0, 10000);
    } else {
      return { found: false };
    }

    const remainingAfter = nutritionCtx.remaining_calories - simulatedCalories;
    return {
      found: true, simulated_calories: simulatedCalories, remaining_before: nutritionCtx.remaining_calories,
      remaining_after: remainingAfter, over_target_after: remainingAfter < 0, single_food_id: singleFoodId,
    };
  },
};

export const READ_ONLY_TOOLS: CJTool<any, any>[] = [
  searchFood, getFoodNutrition, resolvePortion, calculateMealNutrition, getDailySummary,
  getUserProfile, searchDietMeals, getRecipe, findRecipesFromIngredients, recommendFoods,
  checkFoodFit, suggestSubstitution, simulateWhatIf, calculateAllowedPortion,
];
