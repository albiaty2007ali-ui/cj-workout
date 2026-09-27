import { useEffect, useState } from "react";
import { api, type MeResponse } from "../lib/api";
import { pushSupported, currentSubscription, subscribeToPush } from "../lib/push";
import { useI18n } from "../i18n/I18nContext";

const SHOW_AFTER_MS = 45_000;

interface NotifSettingsResponse {
  vapid_public_key: string | null;
}

/** مودال "تفعيل الإشعارات" بعد أول دخول — يظهر مرة وحدة للأبد لكل مستخدم (محفوظ بالـbackend،
 * راجع settings.mts's action=dismiss-notif-prompt)، بعد 45 ثانية من فتح أي صفحة، وفقط لو
 * الإشعارات مدعومة وغير مفعّلة أصلاً وغير مرفوضة صراحة بالمتصفح. مكوّن مستقل بالكامل (يجلب
 * بياناته بنفسه) حتى يُركَّب مرة وحدة بـAppShell بلا حاجة لتمرير me عبر كل صفحة تستدعي AppShell. */
export default function NotificationPromptModal() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      if (!pushSupported()) return;
      if (typeof Notification !== "undefined" && Notification.permission === "denied") return;
      if (await currentSubscription()) return;

      const meRes = await api.get<MeResponse>("/me");
      if (cancelled || !meRes.success || !meRes.data) return;
      if (meRes.data.notification_prompt_shown) return;

      timer = setTimeout(() => { if (!cancelled) setVisible(true); }, SHOW_AFTER_MS);
    })();

    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  async function dismiss() {
    setVisible(false);
    await api.post("/settings?action=dismiss-notif-prompt", {});
  }

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const notifRes = await api.get<NotifSettingsResponse>("/settings?action=notifications");
      if (!notifRes.success || !notifRes.data?.vapid_public_key) {
        setError(t("notifPrompt.notConfigured"));
        setBusy(false);
        return;
      }
      await subscribeToPush(notifRes.data.vapid_public_key);
      await dismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("notifPrompt.genericError"));
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <p className="font-display" style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: 0 }}>
          🔔 {t("notifPrompt.title")}
        </p>
        <p style={{ color: "var(--text-muted)" }}>{t("notifPrompt.description")}</p>
        {error && <p className="field-error">{error}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-moss" onClick={activate} disabled={busy}>
            {busy ? t("common.loading") : t("notifPrompt.activate")}
          </button>
          <button type="button" className="btn" onClick={dismiss} disabled={busy}>
            {t("notifPrompt.dismiss")}
          </button>
        </div>
      </div>
    </div>
  );
}
