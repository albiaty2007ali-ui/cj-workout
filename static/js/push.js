// تسجيل Service Worker + الاشتراك بـWeb Push — يُستدعى فقط لما المستخدم يفعّل الإشعارات
// صراحة من الإعدادات (settings.js). لا نطلب إذن Notification تلقائيًا أبدًا.

function cjUrlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function cjEnablePushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "المتصفح هذا ما يدعم الإشعارات." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "لازم توافق على إذن الإشعارات من المتصفح حتى تشتغل." };
  }

  const keyRes = await fetch("/settings/vapid-public-key");
  const keyData = await keyRes.json();
  if (!keyData.public_key) {
    return { ok: false, error: "الإشعارات غير مفعّلة على السيرفر هسه." };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: cjUrlBase64ToUint8Array(keyData.public_key),
  });

  const res = await fetch("/settings/push-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": window.CJ_CSRF_TOKEN },
    body: JSON.stringify(subscription.toJSON()),
  });
  return await res.json();
}

async function cjDisablePushNotifications() {
  if (!("serviceWorker" in navigator)) return { ok: true };
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return { ok: true };

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await fetch("/settings/push-unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": window.CJ_CSRF_TOKEN },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }
  return { ok: true };
}
