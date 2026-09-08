// Service Worker لإشعارات Web Push الحقيقية — يعرض الإشعار حتى إذا الموقع مسكّر، ويفتح
// الرابط الصحيح عند الضغط عليه (فطور -> الشات، وصفة -> صفحتها، Streak -> البروفايل).

self.addEventListener("push", (event) => {
  let payload = { title: "CJ WORKOUT", body: "", url: "/app" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/static/img/icon-192.png",
      badge: "/static/img/icon-192.png",
      data: { url: payload.url || "/app", notification_id: payload.notification_id || null },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";

  event.waitUntil(
    (async () => {
      const notificationId = event.notification.data && event.notification.data.notification_id;
      if (notificationId) {
        try {
          await fetch("/settings/push-opened", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notification_id: notificationId }),
          });
        } catch (e) {}
      }

      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
