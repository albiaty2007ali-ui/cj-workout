/**
 * /api/intelligence — نقطة نهاية Captain CJ Intelligence، ?action= يحدد السلوك (نفس نمط
 * `/api/settings`/`/api/progress/*`). المرحلة 1: daily-summary (Personal Score). المرحلة 2:
 * missions (GET قائمة اليوم + POST claim)، challenges (GET قائمة متكيّفة مع Streak + POST start).
 */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { computePersonalScore } from "../../shared/nutrition-engine/personalScore.js";
import { listMissionsForToday, claimMission } from "../../shared/nutrition-engine/missions.js";
import { listChallenges, startChallenge } from "../../shared/nutrition-engine/challenges.js";

function insightText(score: number, hasData: boolean): string {
  if (!hasData) return "لسا ماكو نشاط كافي نحسب عليه نقاطك — سجّل وجباتك وراح نبني لك صورة واضحة كابتن.";
  if (score >= 80) return "أداءك ممتاز هالأسبوع كابتن! استمر بنفس الالتزام 🔥";
  if (score >= 50) return "أداءك زين هالأسبوع، تگدر تحسّنه شوي بالالتزام أكثر بالوجبات والماي.";
  return "لاحظت التزامك قل شوي هالأسبوع، خلّينا نرجّع نظبط الروتين سوا خطوة خطوة.";
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "daily-summary";

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    if (req.method === "GET" && action === "daily-summary") {
      const { score, breakdown } = await computePersonalScore(repo, claims.sub, user.streak_days);
      const hasData = !(breakdown.length === 1 && breakdown[0]!.delta === 0);
      return jsonOk({
        score, breakdown, streak_days: user.streak_days, xp: user.xp,
        insight: insightText(score, hasData),
      });
    }

    if (req.method === "GET" && action === "missions") {
      const missions = await listMissionsForToday(repo, claims.sub);
      return jsonOk({ missions });
    }

    if (req.method === "POST" && action === "missions") {
      const body = await req.json().catch(() => ({}));
      const missionId = typeof body.mission_id === "string" ? body.mission_id : "";
      if (!missionId) return jsonError(400, "VALIDATION_ERROR", "mission_id مطلوب.");
      const result = await claimMission(repo, user, missionId);
      if (!result.ok) return jsonError(400, "MISSION_NOT_COMPLETE", "المهمة غير مكتملة بعد أو استُلمت مسبقًا.");
      return jsonOk({ xp_awarded: result.xp_awarded });
    }

    if (req.method === "GET" && action === "challenges") {
      const challenges = await listChallenges(repo, user);
      return jsonOk({ challenges });
    }

    if (req.method === "POST" && action === "challenges") {
      const body = await req.json().catch(() => ({}));
      const challengeId = typeof body.challenge_id === "string" ? body.challenge_id : "";
      if (!challengeId) return jsonError(400, "VALIDATION_ERROR", "challenge_id مطلوب.");
      const started = await startChallenge(repo, user, challengeId);
      if (!started) return jsonError(400, "CHALLENGE_NOT_AVAILABLE", "التحدي غير متاح أو مبدوء مسبقًا.");
      return jsonOk({ ok: true });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("intelligence error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
