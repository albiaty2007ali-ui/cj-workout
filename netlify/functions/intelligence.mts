/**
 * GET /api/intelligence?action=daily-summary — أول نقطة نهاية لـCaptain CJ Intelligence
 * (المرحلة 1 من خارطة الطريق: Behavior Aggregator + Personal Score). نفس نمط `/api/settings`/
 * `/api/progress/*` — دالة واحدة، ?action= يحدد السلوك، مراحل لاحقة تضيف actions جديدة هنا
 * (missions/challenges/leaderboard/...) بدل دوال منفصلة.
 */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { computePersonalScore } from "../../shared/nutrition-engine/personalScore.js";

function insightText(score: number, hasData: boolean): string {
  if (!hasData) return "لسا ماكو نشاط كافي نحسب عليه نقاطك — سجّل وجباتك وراح نبني لك صورة واضحة كابتن.";
  if (score >= 80) return "أداءك ممتاز هالأسبوع كابتن! استمر بنفس الالتزام 🔥";
  if (score >= 50) return "أداءك زين هالأسبوع، تگدر تحسّنه شوي بالالتزام أكثر بالوجبات والماي.";
  return "لاحظت التزامك قل شوي هالأسبوع، خلّينا نرجّع نظبط الروتين سوا خطوة خطوة.";
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "daily-summary";

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    if (action === "daily-summary") {
      const { score, breakdown } = await computePersonalScore(repo, claims.sub, user.streak_days);
      const hasData = !(breakdown.length === 1 && breakdown[0]!.delta === 0);
      return jsonOk({
        score, breakdown, streak_days: user.streak_days, xp: user.xp,
        insight: insightText(score, hasData),
      });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("intelligence error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
