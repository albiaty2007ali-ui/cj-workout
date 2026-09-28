/**
 * GET /api/referral-stats — بيانات لوحة "دعوة صديق" (حزمة الإحالة/Premium). لا يكرر منطق
 * referral.ts's grantReferralXp — قراءة فقط، صفر تأثير على قواعد منح XP.
 * referred_count عبر countUsersReferredBy الجديدة (كل من سجّل عبر رابط المستخدم، بلا حد أقصى)،
 * referral_xp_total/history عبر listXpTransactionsByReason الموجودة أصلًا (محدودة بسقف
 * MAX_REFERRAL_XP_GRANTS=20 لمنح XP فقط — العددان قد يختلفان، وهذا صحيح ومقصود).
 * history لا يحتوي أي بيانات شخصية عن الصديق (source هو "referral_<uuid>" فقط) — يُعرَض
 * كـ"صديق جديد" + تاريخ بالواجهة، صفر بريد/اسم/id مكشوف.
 */
import type { Context } from "@netlify/functions";
import { FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { REFERRAL_XP, REFERRAL_XP_REASON, MAX_REFERRAL_XP_GRANTS } from "../../shared/nutrition-engine/referral.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    const [referredCount, xpTxs] = await Promise.all([
      repo.countUsersReferredBy(claims.sub),
      repo.listXpTransactionsByReason(claims.sub, REFERRAL_XP_REASON),
    ]);

    return jsonOk({
      referral_code: user.referral_code,
      referred_count: referredCount,
      referral_xp_total: xpTxs.reduce((sum, tx) => sum + tx.amount, 0),
      xp_per_referral: REFERRAL_XP,
      xp_grants_used: xpTxs.length,
      xp_grants_cap: MAX_REFERRAL_XP_GRANTS,
      history: xpTxs.map((tx) => ({ date: tx.created_at.toISOString(), xp: tx.amount })).reverse(),
    });
  } catch (err) {
    console.error("referral-stats error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
