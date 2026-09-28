// Service Worker لإشعارات Web Push الحقيقية — يعرض الإشعار حتى إذا الموقع مسكّر، ويفتح
// الرابط الصحيح عند الضغط عليه (نفس سلوك static/sw.js الأصلي، بدون تتبّع "فُتح" — ما بُني هذا
// المسار بالنسخة الجديدة بعد).

self.addEventListener("push", (event) => {
  let payload = { title: "CJ FOOD", body: "", url: "/chat" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: payload.url || "/chat" },
      actions: payload.actions || [],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";

  // زر "✅ شربت كوب" على إشعار الماي — يسجّل مباشرة عبر fetch بالخلفية، بدون فتح نافذة
  // (نفس جلسة تسجيل الدخول تُرفَق تلقائيًا لأن الطلب من نفس origin، كوكي الجلسة يوصل عادي).
  if (event.action === "log_water") {
    event.waitUntil(
      fetch("/api/water/quick-log", { method: "POST", credentials: "include" }).catch(() => {})
    );
    return;
  }

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});
