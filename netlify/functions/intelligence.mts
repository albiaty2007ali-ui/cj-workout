/**
 * /api/intelligence — نقطة نهاية Captain CJ Intelligence، ?action= يحدد السلوك (نفس نمط
 * `/api/settings`/`/api/progress/*`). المرحلة 1: daily-summary (Personal Score). المرحلة 2:
 * missions/challenges. المرحلة 3: streak-freeze (POST use)، leaderboard (GET Top 10). المرحلة 4:
 * recovery-day (GET حالة اليوم + POST تفعيل/إلغاء). المرحلة 6 (Smart Food Intelligence):
 * goal-forecast/consistency-score/best-worst-day/progress-replay (كلها GET، قراءة فقط).
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp, getStreakLeaderboard, getUserStreakRank } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { computePersonalScore } from "../../shared/nutrition-engine/personalScore.js";
import { listMissionsForToday, claimMission } from "../../shared/nutrition-engine/missions.js";
import { listChallenges, startChallenge } from "../../shared/nutrition-engine/challenges.js";
import { useStreakFreeze } from "../../shared/nutrition-engine/streakFreeze.js";
import { todayBaghdadIso } from "../../shared/nutrition-engine/iraqTime.js";
import type { RecoveryDayRecord } from "../../shared/nutrition-engine/db/repository.js";
import { computeWeightStats, computeGoalForecast, type WeightEntry } from "../../shared/nutrition-engine/weightStats.js";
import { computeConsistencyScore } from "../../shared/nutrition-engine/consistencyScore.js";
import { analyzeBestWorstDay } from "../../shared/nutrition-engine/bestWorstDay.js";
import { buildProgressReplay } from "../../shared/nutrition-engine/progressReplay.js";

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
        freeze_balance: user.streak_freeze_balance ?? 0,
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

    if (req.method === "POST" && action === "streak-freeze") {
      const result = await useStreakFreeze(repo, user);
      if (!result.ok) {
        const message = result.reason === "NO_FREEZE_BALANCE"
          ? "ماكو رصيد Streak Freeze عندك حاليًا."
          : "أمس أصلاً مسجّل نشط، ماكو داعي تستخدم Freeze.";
        return jsonError(400, result.reason, message);
      }
      return jsonOk({ streak_days: user.streak_days, freeze_balance: user.streak_freeze_balance });
    }

    if (req.method === "GET" && action === "leaderboard") {
      const db = getFirestore(getFirebaseApp());
      const [leaderboard, myRank] = await Promise.all([
        getStreakLeaderboard(db), getUserStreakRank(db, claims.sub),
      ]);
      return jsonOk({ leaderboard, my_rank: myRank, my_streak_days: user.streak_days });
    }

    if (req.method === "GET" && action === "goal-forecast") {
      const [profile, history] = await Promise.all([
        repo.findNutritionProfile(claims.sub),
        repo.findWeightHistory(claims.sub),
      ]);
      const entries: WeightEntry[] = history.map((h) => ({ date: h.recorded_at, weight_kg: h.weight_kg }));
      const stats = computeWeightStats(entries, profile?.goal_weight ?? null, profile?.goal ?? null);
      const forecast = computeGoalForecast(stats, profile?.goal ?? null);
      return jsonOk({ ...forecast, distance_to_goal: stats.distance_to_goal, goal_direction: stats.goal_direction, weekly_change: stats.weekly_change });
    }

    if (req.method === "GET" && action === "consistency-score") {
      const result = await computeConsistencyScore(repo, claims.sub);
      return jsonOk(result);
    }

    if (req.method === "GET" && action === "best-worst-day") {
      const result = await analyzeBestWorstDay(repo, claims.sub);
      return jsonOk(result);
    }

    if (req.method === "GET" && action === "progress-replay") {
      const result = await buildProgressReplay(repo, user);
      return jsonOk(result);
    }

    if (req.method === "GET" && action === "recovery-day") {
      const today = todayBaghdadIso();
      const row = await repo.findRecoveryDay(claims.sub, today);
      return jsonOk({ active: row !== null, mode: row?.mode ?? null });
    }

    if (req.method === "POST" && action === "recovery-day") {
      const body = await req.json().catch(() => ({}));
      const today = todayBaghdadIso();
      if (body.enable === false) {
        await repo.clearRecoveryDay(claims.sub, today);
        return jsonOk({ active: false });
      }
      const row: RecoveryDayRecord = {
        user_id: claims.sub, date: today, mode: "FLEXIBLE_DAY", activated_at: new Date().toISOString(),
      };
      await repo.setRecoveryDay(row);
      return jsonOk({ active: true, mode: row.mode });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("intelligence error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
