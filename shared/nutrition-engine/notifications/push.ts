/**
 * منفذ من nutrition_ai/notifications/push.py — Wrapper رقيق حول web-push (مقابل pywebpush
 * بالأصل). بدون مفاتيح VAPID حقيقية بالبيئة، isConfigured() ترجع false وأي إرسال يُتجاهل بأمان
 * (صفر خطأ) — نفس سلوك الأصل الموثّق.
 *
 * `sendFcmPush` مسار توصيل ثانٍ لتطبيق أندرويد (Capacitor) — WebView لا يدعم Web Push المتصفحي
 * (راجع frontend/src/lib/push.ts)، فنرسل عبر Firebase Admin Messaging مباشرة لنفس مشروع
 * Firebase المستخدَم أصلاً لـFirestore (getFirebaseApp() نفسها، صفر بيانات اعتماد إضافية).
 */
import webpush from "web-push";
import { getMessaging } from "firebase-admin/messaging";
import { getFirebaseApp } from "../db/firestoreRepository.js";

export interface PushSubscriptionJson {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

let configured = false;
let vapidChecked = false;

function ensureConfigured(): boolean {
  if (vapidChecked) return configured;
  vapidChecked = true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const claimsEmail = process.env.VAPID_CLAIMS_EMAIL;
  if (!publicKey || !privateKey || !claimsEmail) return false;
  webpush.setVapidDetails(claimsEmail, publicKey, privateKey);
  configured = true;
  return true;
}

export function isConfigured(): boolean {
  return ensureConfigured();
}

export function getVapidPublicKey(): string | null {
  return ensureConfigured() ? process.env.VAPID_PUBLIC_KEY! : null;
}

/** يرجّع true لو نجح الإرسال. لا يرمي أبدًا — يسجّل بـconsole.warn ويرجّع false عند أي فشل. */
export async function sendPush(subscription: PushSubscriptionJson, payload: PushPayload): Promise<boolean> {
  if (!ensureConfigured()) return false;
  try {
    await webpush.sendNotification(subscription as never, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn("push send failed:", err);
    return false;
  }
}

/** إرسال حقيقي عبر FCM لتوكن أندرويد Native. يرجّع true/false بنفس منطق sendPush — لا يرمي أبدًا. */
export async function sendFcmPush(fcmToken: string, payload: PushPayload): Promise<boolean> {
  try {
    await getMessaging(getFirebaseApp()).send({
      token: fcmToken,
      notification: { title: payload.title, body: payload.body },
      data: { url: payload.url },
      webpush: { fcmOptions: { link: payload.url } },
    });
    return true;
  } catch (err) {
    console.warn("fcm push send failed:", err);
    return false;
  }
}
