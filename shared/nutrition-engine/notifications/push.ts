/**
 * منفذ من nutrition_ai/notifications/push.py — Wrapper رقيق حول web-push (مقابل pywebpush
 * بالأصل). بدون مفاتيح VAPID حقيقية بالبيئة، isConfigured() ترجع false وأي إرسال يُتجاهل بأمان
 * (صفر خطأ) — نفس سلوك الأصل الموثّق.
 */
import webpush from "web-push";

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
