import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import AppShell from "../components/AppShell";
import ThemeToggle from "../components/ThemeToggle";
import { pushSupported, currentSubscription, subscribeToPush, unsubscribeFromPush } from "../lib/push";
import { useIntroSlides } from "./IntroTour";
import { useI18n } from "../i18n/I18nContext";
import LanguageToggle from "../components/LanguageToggle";

interface SettingsData {
  ai_response_style: string;
  profile_visibility: string;
}

interface NotificationSettingsData {
  enabled: boolean;
  meals: boolean;
  water: boolean;
  streak: boolean;
  tips: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  wake_time: string | null;
  sleep_time: string | null;
  vapid_public_key: string | null;
}

export default function Settings() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const introSlides = useIntroSlides();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [notif, setNotif] = useState<NotificationSettingsData | null>(null);
  const [notifError, setNotifError] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);

  const [recoveryDayActive, setRecoveryDayActive] = useState<boolean | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [meRes, settingsRes, notifRes, recoveryRes] = await Promise.all([
        api.get<MeResponse>("/me"),
        api.get<SettingsData>("/settings"),
        api.get<NotificationSettingsData>("/settings?action=notifications"),
        api.get<{ active: boolean }>("/intelligence?action=recovery-day"),
      ]);
      if (!meRes.success || !meRes.data) {
        navigate("/login");
        return;
      }
      setMe(meRes.data);
      if (settingsRes.success && settingsRes.data) setSettings(settingsRes.data);
      if (notifRes.success && notifRes.data) setNotif(notifRes.data);
      if (recoveryRes.success && recoveryRes.data) setRecoveryDayActive(recoveryRes.data.active);
      if (pushSupported()) setDeviceSubscribed(!!(await currentSubscription()));
    })();
  }, [navigate]);

  async function toggleRecoveryDay() {
    if (recoveryDayActive === null) return;
    setRecoveryBusy(true);
    const nextValue = !recoveryDayActive;
    const res = await api.post<{ active: boolean }>("/intelligence?action=recovery-day", { enable: nextValue });
    setRecoveryBusy(false);
    if (res.success && res.data) {
      setRecoveryDayActive(res.data.active);
      flashSaved();
    }
  }

  async function saveNotif(patch: Partial<NotificationSettingsData>) {
    const res = await api.post("/settings?action=notifications", patch);
    if (res.success) {
      setNotif((n) => (n ? { ...n, ...patch } : n));
      flashSaved();
    }
  }

  async function toggleMasterNotif() {
    if (!notif) return;
    setNotifError("");
    setNotifBusy(true);
    try {
      if (!notif.enabled) {
        if (!notif.vapid_public_key) { setNotifError("الإشعارات غير مُجهَّزة بهذا الموقع بعد."); return; }
        await subscribeToPush(notif.vapid_public_key);
        setDeviceSubscribed(true);
        await saveNotif({ enabled: true });
      } else {
        await unsubscribeFromPush();
        setDeviceSubscribed(false);
        await saveNotif({ enabled: false });
      }
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : "صار خطأ");
    } finally {
      setNotifBusy(false);
    }
  }

  function flashSaved() {
    setSavedMsg("تم الحفظ ✓");
    setTimeout(() => setSavedMsg(""), 2000);
  }

  async function setAiStyle(style: string) {
    const res = await api.post<{ style: string }>("/settings?action=ai-style", { style });
    if (res.success) {
      setSettings((s) => (s ? { ...s, ai_response_style: style } : s));
      flashSaved();
    }
  }

  async function setVisibility(visibility: string) {
    const res = await api.post<{ visibility: string }>("/settings?action=privacy", { visibility });
    if (res.success) {
      setSettings((s) => (s ? { ...s, profile_visibility: visibility } : s));
      flashSaved();
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaving(true);
    try {
      const res = await api.post("/settings?action=password", {
        current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword,
      });
      if (!res.success) {
        setPasswordError(res.error?.message ?? "صار خطأ");
        return;
      }
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      flashSaved();
    } finally {
      setPasswordSaving(false);
    }
  }

  async function exportData() {
    const res = await api.get("/settings?action=export");
    if (!res.success) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cjworkout_data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteError("");
    const res = await api.post("/settings?action=delete-account", { password: deletePassword });
    if (!res.success) {
      setDeleteError(res.error?.message ?? "صار خطأ");
      return;
    }
    navigate("/login");
  }

  if (!me || !settings) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="page-container">
        <h1 className="font-display">⚙️ الإعدادات</h1>
        {savedMsg && <div className="notice-box" style={{ background: "rgba(76, 122, 94, 0.15)", borderColor: "var(--moss)" }}>{savedMsg}</div>}

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>المظهر</h3>
          <ThemeToggle />
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>{t("settings.languageTitle")}</h3>
          <LanguageToggle />
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>{t("settings.aboutTitle")}</h3>
          <div className="about-sections">
            {introSlides.map((s) => (
              <div className="about-item" key={s.title}>
                <p className="about-item-title">{s.icon} {s.title}</p>
                <p className="about-item-body">{s.body}</p>
              </div>
            ))}
            <div className="about-item">
              <p className="about-item-title">{t("settings.subscriptionTitle")}</p>
              <p className="about-item-body">{t("settings.subscriptionBody")}</p>
            </div>
            <div className="about-item">
              <p className="about-item-title">{t("settings.privacyTitle")}</p>
              <p className="about-item-body">{t("settings.privacyBody")}</p>
            </div>
          </div>
          <button type="button" className="btn btn-outline-dark" style={{ marginTop: 14 }} onClick={() => navigate("/intro/replay")}>
            {t("settings.replayIntro")}
          </button>
        </div>

        {notif && (
          <div className="notice-box">
            <h3 style={{ marginTop: 0 }}>🔔 الإشعارات</h3>
            <div className="notif-row">
              <span className="notif-row-label">تشغيل إشعارات هذا الجهاز</span>
              <label className="switch">
                <input type="checkbox" checked={notif.enabled} disabled={notifBusy} onChange={toggleMasterNotif} />
                <span className="switch-track" />
              </label>
            </div>
            {notifError && <p className="field-error">{notifError}</p>}
            {notif.enabled && !deviceSubscribed && (
              <p style={{ color: "var(--danger)", fontSize: "0.85rem" }}>الإعداد مفعّل لكن هذا الجهاز غير مشترك فعليًا — بدّل مرة ثانية.</p>
            )}

            {notif.enabled && (
              <>
                <div className="notif-row">
                  <span className="notif-row-label">🍽️ تذكير الوجبات</span>
                  <label className="switch">
                    <input type="checkbox" checked={notif.meals} onChange={(e) => saveNotif({ meals: e.target.checked })} />
                    <span className="switch-track" />
                  </label>
                </div>
                <div className="notif-row">
                  <span className="notif-row-label">💧 تذكير الماي</span>
                  <label className="switch">
                    <input type="checkbox" checked={notif.water} onChange={(e) => saveNotif({ water: e.target.checked })} />
                    <span className="switch-track" />
                  </label>
                </div>
                <div className="notif-row">
                  <span className="notif-row-label">🔥 الستريك وXP</span>
                  <label className="switch">
                    <input type="checkbox" checked={notif.streak} onChange={(e) => saveNotif({ streak: e.target.checked })} />
                    <span className="switch-track" />
                  </label>
                </div>
                <div className="notif-row">
                  <span className="notif-row-label">🌱 نصائح وتقدّم</span>
                  <label className="switch">
                    <input type="checkbox" checked={notif.tips} onChange={(e) => saveNotif({ tips: e.target.checked })} />
                    <span className="switch-track" />
                  </label>
                </div>
                <div style={{ marginTop: 12 }}>
                  <p className="notif-row-label" style={{ marginBottom: 6 }}>ساعات الهدوء (بدون إشعارات)</p>
                  <div className="admin-form-row">
                    <select
                      value={notif.quiet_hours_start ?? ""}
                      onChange={(e) => saveNotif({ quiet_hours_start: e.target.value === "" ? null : Number(e.target.value) })}
                    >
                      <option value="">بدون</option>
                      {Array.from({ length: 24 }).map((_, h) => <option value={h} key={h}>{h}:00</option>)}
                    </select>
                    <span style={{ alignSelf: "center", color: "var(--text-muted)" }}>إلى</span>
                    <select
                      value={notif.quiet_hours_end ?? ""}
                      onChange={(e) => saveNotif({ quiet_hours_end: e.target.value === "" ? null : Number(e.target.value) })}
                    >
                      <option value="">بدون</option>
                      {Array.from({ length: 24 }).map((_, h) => <option value={h} key={h}>{h}:00</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <p className="notif-row-label" style={{ marginBottom: 6 }}>😴 جدول نومك (اختياري — يخلي مواعيد تذكير الوجبات والماي تتكيّف مع وقتك الحقيقي بدل ساعات ثابتة)</p>
                  <div className="admin-form-row">
                    <input
                      type="time" value={notif.wake_time ?? ""}
                      onChange={(e) => saveNotif({ wake_time: e.target.value || null })}
                    />
                    <span style={{ alignSelf: "center", color: "var(--text-muted)" }}>إلى</span>
                    <input
                      type="time" value={notif.sleep_time ?? ""}
                      onChange={(e) => saveNotif({ sleep_time: e.target.value || null })}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {recoveryDayActive !== null && (
          <div className="notice-box">
            <h3 style={{ marginTop: 0 }}>🔄 يوم مرن</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              يومك اليوم مختلف عن المعتاد؟ فعّل هذا وراح نعيد توزيع باقي وجباتك ونوقف تذكيرات وقت الوجبات لهذا اليوم بس — صفر تأثير على الستريك أو XP أو سجلّك السابق.
            </p>
            <div className="notif-row">
              <span className="notif-row-label">تفعيل اليوم المرن</span>
              <label className="switch">
                <input type="checkbox" checked={recoveryDayActive} disabled={recoveryBusy} onChange={toggleRecoveryDay} />
                <span className="switch-track" />
              </label>
            </div>
          </div>
        )}

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>أسلوب ردود الشات</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["concise", "مختصر"], ["balanced", "متوازن"], ["detailed", "مفصّل"]].map(([value, label]) => (
              <button
                key={value}
                className={`btn ${settings.ai_response_style === value ? "btn-moss" : "btn-outline-dark"}`}
                onClick={() => setAiStyle(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>خصوصية البروفايل</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`btn ${settings.profile_visibility === "public" ? "btn-moss" : "btn-outline-dark"}`}
              onClick={() => setVisibility("public")}
            >
              عام
            </button>
            <button
              className={`btn ${settings.profile_visibility === "private" ? "btn-moss" : "btn-outline-dark"}`}
              onClick={() => setVisibility("private")}
            >
              خاص
            </button>
          </div>
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>تغيير كلمة المرور</h3>
          <form onSubmit={changePassword}>
            <div className="field">
              <label>كلمة المرور الحالية</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="field">
              <label>كلمة المرور الجديدة</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <div className="field">
              <label>تأكيد كلمة المرور الجديدة</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            {passwordError && <p className="field-error">{passwordError}</p>}
            <button className="btn btn-moss" type="submit" disabled={passwordSaving}>{passwordSaving ? "..." : "تغيير كلمة المرور"}</button>
          </form>
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>بياناتك</h3>
          <button className="btn btn-outline-dark" onClick={exportData}>⬇️ تنزيل نسخة من بياناتي</button>
        </div>

        <div className="notice-box" style={{ borderColor: "var(--danger)" }}>
          <h3 style={{ marginTop: 0, color: "var(--danger)" }}>منطقة الخطر</h3>
          {!confirmingDelete ? (
            <button className="btn" style={{ background: "var(--danger)" }} onClick={() => setConfirmingDelete(true)}>
              حذف الحساب
            </button>
          ) : (
            <form onSubmit={deleteAccount}>
              <p>هذا الإجراء لا يمكن التراجع عنه. اكتب كلمة المرور للتأكيد:</p>
              <div className="field">
                <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required />
              </div>
              {deleteError && <p className="field-error">{deleteError}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" style={{ background: "var(--danger)" }} type="submit">تأكيد الحذف</button>
                <button className="btn btn-outline-dark" type="button" onClick={() => setConfirmingDelete(false)}>إلغاء</button>
              </div>
            </form>
          )}
        </div>
      </main>
    </AppShell>
  );
}
