/**
 * GET /api/foods-search?q=... — بحث حر بقاعدة الأطعمة (foods.sqlite) لواجهة "إضافة وجبة يدويًا"
 * بمدير وجبات اليوم. أول Endpoint يعرض foodSearch.ts للواجهة مباشرة — قبل هذا كان استخدامه
 * حصريًا داخليًا من محرك الشات (تحليل نص المستخدم)، هذا استعلام صريح باسم طعام فقط.
 */
import type { Context } from "@netlify/functions";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { searchFoods, getPortionsFor } from "../../shared/nutrition-engine/foodSearch.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const foodIdParam = url.searchParams.get("food_id");

  try {
    if (foodIdParam) {
      const foodId = Number(foodIdParam);
      if (!Number.isFinite(foodId)) return jsonError(400, "VALIDATION_ERROR", "food_id غير صالح.");
      const portions = await getPortionsFor(foodId);
      return jsonOk({
        portions: portions.map((p) => ({ portion_name: String(p.portion_name), grams: Number(p.grams) })),
      });
    }

    if (q.trim().length < 2) return jsonOk({ results: [] });
    const results = await searchFoods(q);
    return jsonOk({ results });
  } catch (err) {
    console.error("foods-search error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
