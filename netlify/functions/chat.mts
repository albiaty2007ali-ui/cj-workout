/**
 * POST /api/chat — يعادل chat.py's api_chat بالإنتاج الحالي. Netlify Function v2 (Web-standard
 * Request/Response). Stateless بالكامل — كل الحالة (pending_meal_json، إلخ) تُقرأ/تُكتب من
 * Postgres عبر PostgresRepository بكل استدعاء، بدون أي متغير Module-level قابل للتغيّر.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { handleMessage } from "../../shared/nutrition-engine/orchestrator.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { sendNotification } from "../../shared/nutrition-engine/notifications/engine.js";

interface NewMilestone { days: number; label: string; xp_reward: number }

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

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) {
      return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");
    }

    const result = await handleMessage(repo, user, text);

    if (result.premium_required) {
      return jsonError(402, "TRIAL_EXHAUSTED", "خلصت وجباتك المجانية. تحتاج اشتراك لتكملة التسجيل.");
    }

    // Push حقيقي لأي محطة Streak جديدة — Best-effort دائمًا (sendNotification لا ترمي، ولا تؤخر
    // إرسال رد الشات نفسه لو فشلت). Event-driven هنا، عمدًا بدون انتظار Scheduled Function.
    const newMilestones = result.new_milestones as NewMilestone[] | undefined;
    if (newMilestones && newMilestones.length > 0) {
      const db = getFirestore(getFirebaseApp());
      for (const m of newMilestones) {
        // await عمدًا (مو fire-and-forget) — بيئة Serverless ما تضمن إكمال عمل بالخلفية بعد
        // رجوع الاستجابة؛ sendNotification نفسها لا ترمي أبدًا فما تؤخر الرد بفشل غير متوقع.
        await sendNotification(db, claims.sub, "STREAK", `streak_${m.days}`, "/profile", "🔥 محطة جديدة!", `${m.label} — +${m.xp_reward} XP`);
      }
    }

    return jsonOk(result);
  } catch (err) {
    // لا نكشف تفاصيل الخطأ الداخلي للمستخدم أبدًا — تُسجَّل بـLogs فقط (console.error يصل Netlify Logs)
    console.error("chat function error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
