/**
 * /api/progress/weight — يعادل progress_bp.py's مجموعة routes الوزن (GET إحصائيات، POST تسجيل/
 * هدف/حذف) مجمّعة بـFunction واحدة تفرّق حسب method + query param "action"، تماشيًا مع توصية
 * "لا تجعل function واحدة ضخمة... قسّم حسب المورد" (هذا مورد واحد: الوزن).
 */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { computeWeightStats } from "../../shared/nutrition-engine/weightStats.js";
import { applyWeightUpdate } from "../../shared/nutrition-engine/weightOps.js";

const PERIOD_DAYS: Record<string, number | null> = { "7": 7, "30": 30, "90": 90, "180": 180, "365": 365, all: null };

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);

  try {
    const repo = new FirestoreRepository();
    if (req.method === "GET") {
      const period = url.searchParams.get("period") ?? "30";
      const periodDays = PERIOD_DAYS[period] ?? 30;
      const sinceDate = periodDays ? new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000) : undefined;

      const [profile, history] = await Promise.all([
        repo.findNutritionProfile(claims.sub),
        repo.findWeightHistory(claims.sub, sinceDate),
      ]);

      const entries = history.map((h) => ({ date: h.recorded_at, weight_kg: h.weight_kg }));
      const stats = computeWeightStats(entries, profile?.goal_weight ?? null, profile?.goal ?? null);
      return jsonOk({ ...stats, entries: history.map((h) => ({ id: h.id, date: h.recorded_at, weight_kg: h.weight_kg })) });
    }

    if (req.method === "POST") {
      const action = url.searchParams.get("action");
      const body = await req.json().catch(() => ({}));

      if (action === "goal") {
        const goalWeight = typeof body.goal_weight === "number" ? body.goal_weight : null;
        if (goalWeight !== null && !(goalWeight >= 30 && goalWeight <= 300)) {
          return jsonError(400, "VALIDATION_ERROR", "وزن الهدف غير منطقي.");
        }
        await repo.updateNutritionProfile(claims.sub, { goal_weight: goalWeight });
        return jsonOk({ ok: true });
      }

      if (action === "delete") {
        const id = typeof body.id === "string" ? body.id : "";
        const entry = await repo.findWeightHistoryById(id);
        if (!entry || entry.user_id !== claims.sub) {
          return jsonError(404, "NOT_FOUND", "السجل غير موجود.");
        }
        await repo.deleteWeightHistory(id);
        return jsonOk({ ok: true });
      }

      // تسجيل وزن جديد (الافتراضي) — نفس weight_ops.apply_weight_update المستخدم بالشات بالضبط
      const weightKg = typeof body.weight_kg === "number" ? body.weight_kg : null;
      if (weightKg === null || !(weightKg >= 30 && weightKg <= 300)) {
        return jsonError(400, "VALIDATION_ERROR", "وزن غير منطقي.");
      }
      const result = await applyWeightUpdate(repo, claims.sub, weightKg);
      if (!result) return jsonError(400, "PROFILE_INCOMPLETE", "أكمل بياناتك الأساسية أول مرة.");
      return jsonOk({ ok: true, ...result });
    }

    return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
  } catch (err) {
    console.error("progress-weight error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
