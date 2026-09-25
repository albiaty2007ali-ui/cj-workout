/**
 * GET /api/tournament-mode — حالة "عندي بطولة" الحالية (مفعّل؟ حتى متى؟ الهدف الأصلي/الحالي).
 * POST ?action=activate {days} / ?action=deactivate — تفعيل/إلغاء (shared/nutrition-engine/
 * tournamentMode.ts هو المصدر الوحيد للمنطق، هنا مجرد واجهة HTTP رقيقة).
 */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import * as tournamentMode from "../../shared/nutrition-engine/tournamentMode.js";
import * as context from "../../shared/nutrition-engine/context.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const repo = new FirestoreRepository();
  const profile = await repo.findNutritionProfile(claims.sub);
  if (!profile) return jsonError(400, "NO_PROFILE", "أكمل بياناتك الأساسية أول مرة.");

  try {
    if (req.method === "GET") {
      // يستدعي context.build حتى نفس فحص انتهاء النافذة التلقائي يشتغل قبل عرض الحالة
      // (صفر تكرار منطق — نفس النقطة المركزية المستخدَمة بكل مكان ثاني)
      await context.build(repo, claims.sub, profile);
      return jsonOk({
        active: Boolean(profile.tournament_deficit_until),
        until: profile.tournament_deficit_until ?? null,
        original_target: profile.tournament_original_target ?? null,
        current_target: profile.calorie_target,
      });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "activate") {
      const body = await req.json().catch(() => ({}));
      const days = Number(body.days);
      const result = await tournamentMode.activate(repo, profile, days);
      if (!result.ok) {
        const msg = result.error === "ALREADY_ACTIVE" ? "وضع البطولة مفعّل أصلًا." : `عدد الأيام لازم يكون بين ${tournamentMode.MIN_DAYS} و${tournamentMode.MAX_DAYS}.`;
        return jsonError(400, result.error ?? "VALIDATION_ERROR", msg);
      }
      return jsonOk({ ok: true, new_target: result.new_target, until: result.until });
    }

    if (action === "deactivate") {
      await tournamentMode.deactivate(repo, profile);
      return jsonOk({ ok: true, new_target: profile.calorie_target });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("tournament-mode error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
