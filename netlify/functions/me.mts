/**
 * GET /api/me — بيانات المستخدم الحالي + ملفه الغذائي. لا مقابل مباشر بايثون (chat.py's app_home
 * يحقن هذي البيانات داخل Template مباشرة)؛ هنا Endpoint مستقل لأن الواجهة React ستحتاجه بكل صفحة.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp, getUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, isAdminClaims } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { trialExhausted, freeMealsRemaining } from "../../shared/nutrition-engine/userStatus.js";
import { getConversationalMode } from "../../shared/nutrition-engine/conversation/config.js";
import { generateReferralCode } from "../../shared/nutrition-engine/auth.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    // Backfill كسول لحسابات قديمة أُنشئت قبل ميزة الإحالة (referral_code فارغ) — يولّد كود
    // حقيقي مرة وحدة ويحفظه، بدل رابط مشاركة مكسور بـ"?ref=" فارغ.
    if (!user.referral_code) {
      user.referral_code = generateReferralCode();
      await repo.saveUser(user);
    }

    const profile = await repo.findNutritionProfile(claims.sub);
    const display = await getUserDisplayFields(getFirestore(getFirebaseApp()), claims.sub);

    return jsonOk({
      id: user.id, role: isAdminClaims(claims) ? "admin" : "user", name: display?.name ?? "", username: display?.username ?? null,
      photo_url: display?.photo_url ?? null,
      xp: user.xp, streak_days: user.streak_days,
      longest_streak: user.longest_streak, is_premium: user.is_premium,
      free_meals_remaining: freeMealsRemaining(user), trial_exhausted: trialExhausted(user),
      onboarding_completed: profile !== null, profile,
      intro_completed: display?.intro_completed ?? false,
      language: display?.language ?? "ar",
      // دائمًا true — التحقق بالبريد أُلغي كشرط وصول (راجع auth.ts's isEmailVerified لسبب القرار)،
      // فالواجهة لا تحوّل أي مستخدم لشاشة /verify-email بعد الآن.
      email_verified: true,
      email: claims.email,
      notification_prompt_shown: display?.notification_prompt_shown ?? false,
      theme: display?.theme ?? "dark",
      referral_code: user.referral_code,
      // إشارة حقيقية (مو شارة ثابتة دائمًا خضراء) — يعكس هل GEMINI_API_KEY مضبوط فعليًا وGEMINI_
      // CONVERSATIONAL_MODE ليس OFF. لا يستدعي Gemini حقيقيًا (صفر تكلفة/تأخير)، بس لا يخترع حالة.
      ai_status: getConversationalMode() !== "OFF" && Boolean(process.env.GEMINI_API_KEY) ? "ok" : "not_configured",
    });
  } catch (err) {
    console.error("me error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
