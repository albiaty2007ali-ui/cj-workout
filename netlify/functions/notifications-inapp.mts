/**
 * GET /api/notifications-inapp — الرسالة المنبثقة الذكية التالية المؤهَّلة للمستخدم الحالي
 * (حزمة تطوير الإشعارات)، أو null لو ماكو شي مناسب الآن. يسجّل الرسالة كـ"معروضة" فورًا بنفس
 * الاستدعاء (مرة وحدة للأبد لكل id — راجع inAppNotifications.ts).
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, checkBanStatus } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import * as context from "../../shared/nutrition-engine/context.js";
import { IN_APP_CATALOG, pickNextInAppNotification } from "../../shared/nutrition-engine/inAppNotifications.js";
import { getConversationalPeriod } from "../../shared/nutrition-engine/iraqTime.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  try {
    const db = getFirestore(getFirebaseApp());
    // حساب محظور لا يشوف رسائل تشجيعية أثناء حظره — يطابق نفس بوابة chat.mts/progress-daily.mts
    const banStatus = await checkBanStatus(db, claims.sub);
    if (banStatus.banned) return jsonOk({ notification: null });

    const repo = new FirestoreRepository(db);
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    const doc = await db.collection("users").doc(claims.sub).get();
    const raw = doc.data() ?? {};
    const shownRaw: { id: string; at: unknown }[] = Array.isArray(raw.shown_notifications) ? raw.shown_notifications : [];
    const shown = shownRaw.map((s) => ({
      id: s.id,
      at: (s.at as { toDate?: () => Date })?.toDate?.() ?? new Date(s.at as string),
    }));

    const now = new Date();
    const profile = await repo.findNutritionProfile(claims.sub);
    const nutritionCtx = await context.build(repo, claims.sub, profile, now);
    const createdAt = (raw.created_at as { toDate?: () => Date })?.toDate?.() ?? now;
    const accountAgeDays = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));

    const ctx = {
      account_age_days: accountAgeDays, is_premium: user.is_premium, streak_days: user.streak_days,
      meals_logged_today: nutritionCtx.meals_logged_today, water_ml: nutritionCtx.water_ml,
      water_target_ml: nutritionCtx.water_target_ml, remaining_calories: nutritionCtx.remaining_calories,
      period: getConversationalPeriod(now),
    };

    const picked = pickNextInAppNotification(IN_APP_CATALOG, shown, ctx, now);
    if (!picked) return jsonOk({ notification: null });

    await db.collection("users").doc(claims.sub).set({
      shown_notifications: [...shownRaw, { id: picked.id, at: now }],
    }, { merge: true });

    return jsonOk({ notification: { id: picked.id, text: picked.text, category: picked.category } });
  } catch (err) {
    console.error("notifications-inapp error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
