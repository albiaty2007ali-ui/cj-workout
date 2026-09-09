/**
 * GET /api/recipes-detail?slug=...&servings=N — يعادل recipes_bp.py's detail()، بالإضافة
 * لتحجيم اختياري حقيقي (المرحلة 4 من "الذكاء الغذائي الذكي") — لو servings مذكورة وتختلف عن
 * حصص الوصفة الأصلية، المكونات وNutinition ترجع مُعاد حسابها فعليًا عبر recipeScaling.ts.
 */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { build as buildContext } from "../../shared/nutrition-engine/context.js";
import { scaleRecipe } from "../../shared/nutrition-engine/recipeScaling.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  if (!slug) return jsonError(400, "VALIDATION_ERROR", "slug مطلوب.");
  const servingsParam = url.searchParams.get("servings");
  const targetServings = servingsParam ? Number(servingsParam) : null;
  if (servingsParam && (!Number.isFinite(targetServings) || (targetServings as number) <= 0)) {
    return jsonError(400, "VALIDATION_ERROR", "عدد الحصص لازم يكون رقم موجب.");
  }

  try {
    const repo = new FirestoreRepository();
    const recipe = await repo.findRecipeBySlug(slug);
    if (!recipe) return jsonError(404, "NOT_FOUND", "الوصفة غير موجودة.");

    const profile = await repo.findNutritionProfile(claims.sub);
    const ctx = await buildContext(repo, claims.sub, profile);

    const sortedRecipe = { ...recipe, steps: [...recipe.steps].sort((a, b) => a.step_number - b.step_number) };
    const scaled = targetServings && targetServings !== recipe.servings ? scaleRecipe(recipe, targetServings) : null;

    return jsonOk({
      recipe: scaled ? { ...sortedRecipe, ...scaled } : sortedRecipe,
      original_servings: recipe.servings,
      over_target: ctx.over_target, remaining_calories: ctx.remaining_calories,
    });
  } catch (err) {
    console.error("recipes-detail error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
