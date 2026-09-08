/**
 * /api/settings — يعادل settings_bp.py's أقسام حقيقية فقط (ai-style, privacy, password,
 * delete-account, export). قسم الإشعارات (Web Push) غير منفَّذ هنا عمدًا — نظام الجدولة/الإرسال
 * نفسه (Scheduled Functions) لسا ما تحوّل بجهة Netlify (راجع NETLIFY_MIGRATION_AUDIT.md)، وبناء
 * واجهة لتفضيلات إشعارات ما ترسل أي شي فعليًا يخالف قاعدة "لا واجهة وهمية" الموثّقة بالمشروع.
 */
import type { Context, Config } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, getUserDisplayFields, FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, checkPassword, hashPassword, buildLogoutCookie } from "../../shared/nutrition-engine/auth.js";
import { validatePassword } from "../../shared/nutrition-engine/validation.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { randomUUID } from "node:crypto";

const AI_STYLES = new Set(["concise", "balanced", "detailed"]);
const VISIBILITY_OPTIONS = new Set(["public", "private"]);

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    const db = getFirestore(getFirebaseApp());
    const userRef = db.collection("users").doc(claims.sub);

    if (req.method === "GET") {
      const display = await getUserDisplayFields(db, claims.sub);
      const userDoc = await userRef.get();
      return jsonOk({
        ai_response_style: userDoc.data()?.ai_response_style ?? "balanced",
        profile_visibility: display?.profile_visibility ?? "public",
      });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");

    const body = await req.json().catch(() => ({}));

    if (action === "ai-style") {
      const style = body.style;
      if (!AI_STYLES.has(style)) return jsonError(400, "VALIDATION_ERROR", "خيار غير صحيح");
      await userRef.set({ ai_response_style: style }, { merge: true });
      return jsonOk({ style });
    }

    if (action === "privacy") {
      const visibility = body.visibility;
      if (!VISIBILITY_OPTIONS.has(visibility)) return jsonError(400, "VALIDATION_ERROR", "خيار غير صحيح");
      await userRef.set({ profile_visibility: visibility }, { merge: true });
      return jsonOk({ visibility });
    }

    if (action === "password") {
      const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
      const newPassword = typeof body.new_password === "string" ? body.new_password : "";
      const confirmPassword = typeof body.confirm_password === "string" ? body.confirm_password : "";

      const userDoc = await userRef.get();
      const currentHash = userDoc.data()?.password_hash as string | undefined;
      if (!currentHash || !checkPassword(currentPassword, currentHash)) {
        return jsonError(400, "INVALID_PASSWORD", "كلمة المرور الحالية غير صحيحة");
      }
      if (newPassword !== confirmPassword) {
        return jsonError(400, "PASSWORD_MISMATCH", "كلمتا المرور الجديدتان غير متطابقتين");
      }
      const validationError = validatePassword(newPassword);
      if (validationError) return jsonError(400, "VALIDATION_ERROR", validationError);

      await userRef.set({ password_hash: hashPassword(newPassword) }, { merge: true });
      return jsonOk({ ok: true });
    }

    if (action === "delete-account") {
      const password = typeof body.password === "string" ? body.password : "";
      const userDoc = await userRef.get();
      const currentHash = userDoc.data()?.password_hash as string | undefined;
      if (!currentHash || !checkPassword(password, currentHash)) {
        return jsonError(400, "INVALID_PASSWORD", "كلمة المرور غير صحيحة");
      }
      // تعطيل + مسح البيانات الشخصية — نبقي سجلات الدفع/الاشتراك للتدقيق المالي بدل حذفها
      await userRef.set({
        disabled: true, name: "مستخدم محذوف", username: null, bio: null, photo_url: null,
        email: `deleted-${randomUUID()}@deleted.cjworkout.local`,
      }, { merge: true });
      return jsonOk({ ok: true }, { headers: { "Set-Cookie": buildLogoutCookie() } });
    }

    if (action === "export") {
      const repo = new FirestoreRepository();
      const [user, profile, display, mealLogs, waterLogs, weightHistory] = await Promise.all([
        repo.findUser(claims.sub),
        repo.findNutritionProfile(claims.sub),
        getUserDisplayFields(db, claims.sub),
        repo.findMealLogsInRange(claims.sub, new Date(0), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        repo.findWaterLogsInRange(claims.sub, new Date(0), new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        repo.findWeightHistory(claims.sub),
      ]);

      return jsonOk({
        account: { name: display?.name, email: display?.email, username: display?.username },
        nutrition_profile: profile
          ? { age: profile.age, weight_kg: profile.weight_kg, height_cm: profile.height_cm, goal: profile.goal, calorie_target: profile.calorie_target }
          : null,
        meals: mealLogs.map((m) => ({
          meal_type: m.meal_type, raw_text: m.raw_text, total_calories: m.total_calories,
          total_protein: m.total_protein, total_carbs: m.total_carbs, total_fat: m.total_fat,
          created_at: m.created_at.toISOString(),
        })),
        water_logs: waterLogs.map((w) => ({ ml: w.ml, created_at: w.created_at.toISOString() })),
        weight_history: weightHistory.map((w) => ({ weight_kg: w.weight_kg, recorded_at: w.recorded_at.toISOString() })),
        xp: user?.xp, streak_days: user?.streak_days, longest_streak: user?.longest_streak,
        exported_at: new Date().toISOString(),
      });
    }

    return jsonError(400, "UNKNOWN_ACTION", "action غير معروف.");
  } catch (err) {
    console.error("settings error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};

export const config: Config = { path: "/.netlify/functions/settings" };
