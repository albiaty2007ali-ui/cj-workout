/**
 * POST /api/chat — يعادل chat.py's api_chat بالإنتاج الحالي. Netlify Function v2 (Web-standard
 * Request/Response). Stateless بالكامل — كل الحالة (pending_meal_json، إلخ) تُقرأ/تُكتب من
 * Postgres عبر PostgresRepository بكل استدعاء، بدون أي متغير Module-level قابل للتغيّر.
 */
import type { Context, Config } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { handleMessage } from "../../shared/nutrition-engine/orchestrator.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");
  }

  const claims = authenticateRequest(req);
  if (!claims) {
    return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");
  }

  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "جسم الطلب غير صالح.");
  }

  const text = typeof body.message === "string" ? body.message : "";
  if (!text.trim()) {
    return jsonError(400, "VALIDATION_ERROR", "الرسالة فاضية.");
  }

  const repo = new FirestoreRepository();

  try {
    const user = await repo.findUser(claims.sub);
    if (!user) {
      return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");
    }

    const result = await handleMessage(repo, user, text);

    if (result.premium_required) {
      return jsonError(402, "TRIAL_EXHAUSTED", "خلصت وجباتك المجانية. تحتاج اشتراك لتكملة التسجيل.");
    }

    return jsonOk(result);
  } catch (err) {
    // لا نكشف تفاصيل الخطأ الداخلي للمستخدم أبدًا — تُسجَّل بـLogs فقط (console.error يصل Netlify Logs)
    console.error("chat function error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};

export const config: Config = {
  path: "/.netlify/functions/chat",
};
