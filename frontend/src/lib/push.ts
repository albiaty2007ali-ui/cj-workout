/**
 * تسجيل Service Worker + اشتراك Web Push حقيقي (متصفح) — يعادل static/js/push.js الأصلي.
 *
 * داخل تطبيق أندرويد (Capacitor WebView)، Push API المتصفحي غير مدعوم بشكل موثوق — يفشل بخطأ
 * "Registration failed - push service error" لأن WebView (بعكس Chrome الحقيقي) ما عنده اتصال
 * حقيقي بخدمة FCM. الحل: مسار منفصل بالكامل عبر @capacitor/push-notifications (FCM Native
 * مباشرة، خارج WebView تمامًا) — نفس نقطة النهاية بالسيرفر (/push/subscribe) تخزّن الاثنين بحقل
 * `platform` يميّز طريقة الإرسال المناسبة لاحقًا (راجع shared/nutrition-engine/notifications/).
 */
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { api } from "./api";

const NATIVE_TOKEN_KEY = "cj_push_native_token";

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer;
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function pushSupported(): boolean {
  if (isNativeApp()) return true; // FCM Native مدعوم دايمًا داخل تطبيق أندرويد الحقيقي
  return "serviceWorker" in navigator && "PushManager" in window;
}

/** بعكس السابق (كان يرجّع PushSubscription|null): موحّد لـboolean لأن المسار الأصلي (native) ما عنده كائن اشتراك متصفحي أصلاً. */
export async function currentSubscription(): Promise<boolean> {
  if (isNativeApp()) return !!localStorage.getItem(NATIVE_TOKEN_KEY);
  if (!("serviceWorker" in navigator && "PushManager" in window)) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  return !!(await reg.pushManager.getSubscription());
}

async function subscribeNative(): Promise<void> {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") throw new Error("رفضت إذن الإشعارات من إعدادات التطبيق.");

  const token = await new Promise<string>((resolve, reject) => {
    PushNotifications.addListener("registration", (t) => resolve(t.value));
    PushNotifications.addListener("registrationError", (err) => reject(new Error(err.error || "فشل تسجيل الإشعارات بالتطبيق.")));
    PushNotifications.register();
  });

  const res = await api.post("/push/subscribe", { platform: "android", fcm_token: token });
  if (!res.success) throw new Error(res.error?.message ?? "صار خطأ بحفظ الاشتراك.");
  localStorage.setItem(NATIVE_TOKEN_KEY, token);
}

/** يطلب إذن الإشعارات من المستخدم صراحة، يسجّل الاشتراك، ويحفظه بالسيرفر. يرمي رسالة خطأ واضحة لو فشل. */
export async function subscribeToPush(vapidPublicKey: string): Promise<void> {
  if (isNativeApp()) return subscribeNative();

  if (!pushSupported()) throw new Error("المتصفح لا يدعم الإشعارات.");

  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("رفضت إذن الإشعارات من إعدادات المتصفح.");

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const json = subscription.toJSON();
  const res = await api.post("/push/subscribe", { platform: "web", endpoint: json.endpoint, keys: json.keys });
  if (!res.success) {
    await subscription.unsubscribe();
    throw new Error(res.error?.message ?? "صار خطأ بحفظ الاشتراك.");
  }
}

/** يُستدعى مرة وحدة عند إقلاع التطبيق (main.tsx) — يفتح رابط الإشعار عند الضغط عليه (متل notificationclick بـsw.js للويب). بدون تأثير خارج تطبيق أندرويد. */
export function setupNativePushTapHandler(): void {
  if (!isNativeApp()) return;
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const url = action.notification.data?.url;
    if (typeof url === "string" && url) window.location.href = url;
  });
}

export async function unsubscribeFromPush(): Promise<void> {
  if (isNativeApp()) {
    const token = localStorage.getItem(NATIVE_TOKEN_KEY);
    localStorage.removeItem(NATIVE_TOKEN_KEY);
    if (token) await api.post(`/push/subscribe?action=unsubscribe`, { platform: "android", fcm_token: token });
    return;
  }
  if (!("serviceWorker" in navigator && "PushManager" in window)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api.post(`/push/subscribe?action=unsubscribe`, { endpoint });
}
