/**
 * GET /api/me — بيانات المستخدم الحالي + ملفه الغذائي. لا مقابل مباشر بايثون (chat.py's app_home
 * يحقن هذي البيانات داخل Template مباشرة)؛ هنا Endpoint مستقل لأن الواجهة React ستحتاجه بكل صفحة.
 */
import type { Context, Config } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp, getUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { trialExhausted, freeMealsRemaining } from "../../shared/nutrition-engine/userStatus.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    const profile = await repo.findNutritionProfile(claims.sub);
    const display = await getUserDisplayFields(getFirestore(getFirebaseApp()), claims.sub);

    return jsonOk({
      id: user.id, role: claims.role, name: display?.name ?? "", username: display?.username ?? null,
      xp: user.xp, streak_days: user.streak_days,
      longest_streak: user.longest_streak, is_premium: user.is_premium,
      free_meals_remaining: freeMealsRemaining(user), trial_exhausted: trialExhausted(user),
      onboarding_completed: profile !== null, profile,
    });
  } catch (err) {
    console.error("me error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};

export const config: Config = { path: "/.netlify/functions/me" };
