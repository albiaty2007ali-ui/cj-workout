/** GET /api/recipes-detail?slug=... — يعادل recipes_bp.py's detail(). */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { build as buildContext } from "../../shared/nutrition-engine/context.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!slug) return jsonError(400, "VALIDATION_ERROR", "slug مطلوب.");

  try {
    const repo = new FirestoreRepository();
    const recipe = await repo.findRecipeBySlug(slug);
    if (!recipe) return jsonError(404, "NOT_FOUND", "الوصفة غير موجودة.");

    const profile = await repo.findNutritionProfile(claims.sub);
    const ctx = await buildContext(repo, claims.sub, profile);

    return jsonOk({
      recipe: { ...recipe, steps: [...recipe.steps].sort((a, b) => a.step_number - b.step_number) },
      over_target: ctx.over_target, remaining_calories: ctx.remaining_calories,
    });
  } catch (err) {
    console.error("recipes-detail error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
