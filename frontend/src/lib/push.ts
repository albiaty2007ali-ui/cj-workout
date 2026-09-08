/** تسجيل Service Worker + اشتراك Web Push حقيقي — يعادل static/js/push.js الأصلي. */
import { api } from "./api";

function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))).buffer;
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

/** يطلب إذن الإشعارات من المستخدم صراحة، يسجّل الاشتراك، ويحفظه بالسيرفر. يرمي رسالة خطأ واضحة لو فشل. */
export async function subscribeToPush(vapidPublicKey: string): Promise<void> {
  if (!pushSupported()) throw new Error("المتصفح لا يدعم الإشعارات.");

  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("رفضت إذن الإشعارات من إعدادات المتصفح.");

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const json = subscription.toJSON();
  const res = await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
  if (!res.success) {
    await subscription.unsubscribe();
    throw new Error(res.error?.message ?? "صار خطأ بحفظ الاشتراك.");
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api.post(`/push/subscribe?action=unsubscribe`, { endpoint });
}
