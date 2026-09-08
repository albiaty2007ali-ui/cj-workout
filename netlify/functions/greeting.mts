/**
 * GET /api/greeting — يعادل جزء chat.py's app_home() اللي يبني التحية الديناميكية عبر
 * build_greeting(). Endpoint مستقل عن /api/me عمدًا (وليس مدمج فيه) لأن له أثر جانبي حقيقي —
 * أول استدعاء اليوم لهذي الوجبة يعلّم MealStatus="asked" — فلازم يُستدعى فقط من صفحة الشات
 * نفسها (مرة عند الفتح)، مو من كل صفحة تجيب /api/me.
 */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { build as buildContext } from "../../shared/nutrition-engine/context.js";
import { buildGreeting } from "../../shared/nutrition-engine/greeting.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  try {
    const repo = new FirestoreRepository();
    const profile = await repo.findNutritionProfile(claims.sub);
    if (!profile) return jsonOk({ text: null, prompts: [] });

    const ctx = await buildContext(repo, claims.sub, profile);
    const greeting = await buildGreeting(repo, claims.sub, ctx.remaining_calories);
    return jsonOk(greeting);
  } catch (err) {
    console.error("greeting error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
