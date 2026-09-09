/**
 * /api/push/subscribe — يخزّن/يحذف اشتراك إشعارات حقيقي لهذا الجهاز، بمسارين:
 *  - `platform: "web"` (افتراضي): PushSubscription متصفحي حقيقي (endpoint/keys) من
 *    navigator.serviceWorker.pushManager.subscribe() — كما كان قبل إضافة الأندرويد Native.
 *  - `platform: "android"`: توكن FCM حقيقي من @capacitor/push-notifications (WebView لا يدعم
 *    Push API المتصفحي، راجع frontend/src/lib/push.ts).
 * معرّف الوثيقة = هاش القيمة الفريدة (endpoint أو fcm_token) — إعادة الاشتراك تستبدل القديم
 * تلقائيًا بدل تكديس نسخ.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

function docIdForValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "subscribe";
  const body = await req.json().catch(() => ({}));

  try {
    const db = getFirestore(getFirebaseApp());
    const platform = body.platform === "android" ? "android" : "web";

    if (action === "unsubscribe") {
      if (platform === "android") {
        const fcmToken = typeof body.fcm_token === "string" ? body.fcm_token : "";
        if (!fcmToken) return jsonError(400, "VALIDATION_ERROR", "fcm_token مطلوب.");
        await db.collection("push_subscriptions").doc(docIdForValue(fcmToken)).delete();
        return jsonOk({ ok: true });
      }
      const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
      if (!endpoint) return jsonError(400, "VALIDATION_ERROR", "endpoint مطلوب.");
      await db.collection("push_subscriptions").doc(docIdForValue(endpoint)).delete();
      return jsonOk({ ok: true });
    }

    if (platform === "android") {
      const fcmToken = typeof body.fcm_token === "string" ? body.fcm_token : "";
      if (!fcmToken) return jsonError(400, "VALIDATION_ERROR", "fcm_token مطلوب.");
      await db.collection("push_subscriptions").doc(docIdForValue(fcmToken)).set({
        user_id: claims.sub, platform: "android", fcm_token: fcmToken, created_at: new Date(),
      });
      return jsonOk({ ok: true });
    }

    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const keys = body.keys as { p256dh?: unknown; auth?: unknown } | undefined;
    if (!endpoint || typeof keys?.p256dh !== "string" || typeof keys?.auth !== "string") {
      return jsonError(400, "VALIDATION_ERROR", "بيانات الاشتراك غير مكتملة.");
    }

    await db.collection("push_subscriptions").doc(docIdForValue(endpoint)).set({
      user_id: claims.sub, platform: "web", endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, created_at: new Date(),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    console.error("push-subscribe error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
