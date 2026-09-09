/**
 * /api/settings — يعادل settings_bp.py's أقسام (ai-style, privacy, password, delete-account,
 * export, notifications). قسم الإشعارات هسه حقيقي: تفضيلات تُحفَظ فعليًا بـFirestore وتُفحَص عند
 * كل إرسال (notifications/engine.ts). التذكيرات المجدولة (فطور/غداء/عشاء بوقت ثابت) تحتاج Netlify
 * Scheduled Function منفصلة — لسا غير مبنية؛ الإشعار الحقيقي المُفعَّل فعليًا هسه هو محطات الستريك
 * (يُرسل مباشرة من netlify/functions/chat.mts، Event-driven بدون حاجة لجدولة).
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, getUserDisplayFields, FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, checkPassword, hashPassword, buildLogoutCookie } from "../../shared/nutrition-engine/auth.js";
import { validatePassword } from "../../shared/nutrition-engine/validation.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { randomUUID } from "node:crypto";
import { getSettings as getNotificationSettings, updateSettings as updateNotificationSettings } from "../../shared/nutrition-engine/notifications/engine.js";
import { getVapidPublicKey } from "../../shared/nutrition-engine/notifications/push.js";

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
      if (action === "notifications") {
        const settings = await getNotificationSettings(db, claims.sub);
        return jsonOk({ ...settings, vapid_public_key: getVapidPublicKey() });
      }
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

    if (action === "language") {
      const language = body.language;
      if (language !== "ar" && language !== "en") return jsonError(400, "VALIDATION_ERROR", "خيار غير صحيح");
      await userRef.set({ language }, { merge: true });
      return jsonOk({ language });
    }

    if (action === "intro") {
      // جولة "هلا بيك" التعريفية — تُعلَّم مكتملة لما المستخدم يخلّصها أو يضغط "تخطي"، وكلاهما
      // "شافها" بمعنى ما تظهر تلقائيًا مرة ثانية (يبقى فيه "إعادة مشاهدة المقدمة" من الإعدادات).
      await userRef.set({ intro_completed: true }, { merge: true });
      return jsonOk({ ok: true });
    }

    if (action === "notifications") {
      const patch: Record<string, unknown> = {};
      if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
      for (const key of ["meals", "water", "streak", "tips"] as const) {
        if (typeof body[key] === "boolean") patch[key] = body[key];
      }
      if (body.quiet_hours_start === null || (Number.isInteger(body.quiet_hours_start) && body.quiet_hours_start >= 0 && body.quiet_hours_start <= 23)) {
        patch.quiet_hours_start = body.quiet_hours_start;
      }
      if (body.quiet_hours_end === null || (Number.isInteger(body.quiet_hours_end) && body.quiet_hours_end >= 0 && body.quiet_hours_end <= 23)) {
        patch.quiet_hours_end = body.quiet_hours_end;
      }
      await updateNotificationSettings(db, claims.sub, patch);
      return jsonOk({ ok: true });
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
