/**
 * GET /api/recipes?q=...&category=... — يعادل recipes_bp.py's index()+api_search() (مدمجتان،
 * كانتا تعرضان نفس البيانات بالضبط عبر مسارين). بدون query/category يرجع كل الوصفات + التصنيفات.
 */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { searchRecipes } from "../../shared/nutrition-engine/recipeSearch.js";
import { build as buildContext } from "../../shared/nutrition-engine/context.js";
import type { RecipeRecord } from "../../shared/nutrition-engine/db/repository.js";

function recipeCard(
  r: RecipeRecord, remainingCalories: number | null, overTarget: boolean,
  categoryById: Map<string, { name: string; icon: string }>,
) {
  const fitsRemaining = remainingCalories !== null && !overTarget ? r.calories <= remainingCalories : null;
  const category = categoryById.get(r.category_id);
  return {
    slug: r.slug, name: r.name, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat,
    fits_remaining: fitsRemaining, category: category?.name ?? null, category_icon: category?.icon ?? null,
    prep_time_min: r.prep_time_min, cook_time_min: r.cook_time_min,
  };
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const categoryId = url.searchParams.get("category") || null;

  try {
    const repo = new FirestoreRepository();
    const [recipes, categories, profile] = await Promise.all([
      searchRecipes(repo, q, categoryId),
      repo.listRecipeCategories(),
      repo.findNutritionProfile(claims.sub),
    ]);
    const ctx = await buildContext(repo, claims.sub, profile);
    const categoryById = new Map(categories.map((c) => [c.id, { name: c.name, icon: c.icon }]));

    return jsonOk({
      categories,
      recipes: recipes.map((r) => recipeCard(r, ctx.remaining_calories, ctx.over_target, categoryById)),
      over_target: ctx.over_target, remaining_calories: ctx.remaining_calories,
    });
  } catch (err) {
    console.error("recipes-list error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
