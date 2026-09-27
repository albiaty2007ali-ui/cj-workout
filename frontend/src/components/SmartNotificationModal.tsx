import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { isAnyModalOpen } from "../lib/modalCoordinator";
import { useI18n } from "../i18n/I18nContext";

const POLL_INTERVAL_MS = 4 * 60 * 1000; // 4 دقائق — بطيء عمدًا، غير مزعج

interface InAppNotifResponse {
  notification: { id: string; text: string; category: string } | null;
}

function isTypingNow(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.getAttribute("contenteditable") === "true";
}

/** رسائل منبثقة ذكية داخل التطبيق — مُركَّب مرة وحدة بـAppShell (مستوى عام، أي صفحة). يفحص
 *  "هل آمن أظهر الآن" (صفر مودال آخر مفتوح، المستخدم مو يكتب) **قبل** طلب الـbackend، حتى لا
 *  يُستهلَك id رسالة (يُسجَّل "معروض" فورًا هناك) بدون ما يشوفها المستخدم فعليًا. */
export default function SmartNotificationModal() {
  const { t } = useI18n();
  const [notif, setNotif] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      if (isAnyModalOpen() || isTypingNow()) return;
      const res = await api.get<InAppNotifResponse>("/notifications-inapp");
      if (cancelled || !res.success || !res.data?.notification) return;
      setNotif({ id: res.data.notification.id, text: res.data.notification.text });
    }

    const initialTimer = setTimeout(tick, 60_000); // دقيقة أولى بعد الدخول قبل أي محاولة
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(initialTimer); clearInterval(interval); };
  }, []);

  if (!notif) return null;

  return (
    <div className="modal-overlay" onClick={() => setNotif(null)}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("common.close")} onClick={() => setNotif(null)}>✕</button>
        <p style={{ margin: "8px 0 0", fontSize: "1rem", lineHeight: 1.7 }}>{notif.text}</p>
      </div>
    </div>
  );
}
