/**
 * POST /api/recipes-actions?slug=...&action=start|complete — يعادل recipes_bp.py's
 * start_cooking()/complete_cooking(). تحقق Backend حقيقي (تجاوز الهدف/انتهاء التجربة) قبل بدء
 * Tutorial جديد — لا علاقة له بتسجيل وجبة أُكلت فعليًا (ذاك القرار بـorchestrator.ts فقط).
 */
import type { Context, Config } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { build as buildContext } from "../../shared/nutrition-engine/context.js";
import { trialExhausted } from "../../shared/nutrition-engine/userStatus.js";
import { markRecipeAwaitingConfirmation } from "../../shared/nutrition-engine/orchestrator.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const action = url.searchParams.get("action");
  if (!slug || (action !== "start" && action !== "complete")) {
    return jsonError(400, "VALIDATION_ERROR", "slug وaction (start|complete) مطلوبان.");
  }

  const repo = new FirestoreRepository();
  try {
    const recipe = await repo.findRecipeBySlug(slug);
    if (!recipe) return jsonError(404, "NOT_FOUND", "الوصفة غير موجودة.");

    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    if (action === "start") {
      if (trialExhausted(user)) {
        return jsonOk({ ok: false, message: "انتهت وجباتك المجانية 🌱 اشترك للمتابعة من صفحة الاشتراك." });
      }
      const profile = await repo.findNutritionProfile(claims.sub);
      const ctx = await buildContext(repo, claims.sub, profile);
      if (ctx.over_target) {
        return jsonOk({ ok: false, message: `وصلت لهدف السعرات اليومي. "${recipe.name}" راح تزيد سعراتك أكثر من هدفك اليوم.` });
      }
      user.current_recipe_id = recipe.id;
      user.current_recipe_step = 0;
      await repo.saveUser(user);
      return jsonOk({ ok: true });
    }

    // action === "complete"
    if (user.current_recipe_id !== recipe.id) {
      return jsonError(400, "WRONG_STATE", "لازم تبدأ الطبخ أول من هذي الصفحة.");
    }
    const prompt = await markRecipeAwaitingConfirmation(repo, user, recipe.id);
    return jsonOk({ ok: true, reply: prompt });
  } catch (err) {
    console.error("recipes-actions error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};

export const config: Config = { path: "/.netlify/functions/recipes-actions" };
