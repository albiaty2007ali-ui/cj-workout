import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import AppShell from "../components/AppShell";
import ThemeSelector from "../components/ThemeSelector";
import AboutAppModal from "../components/AboutAppModal";
import PremiumFeatureModal from "../components/PremiumFeatureModal";
import { pushSupported, currentSubscription, subscribeToPush, unsubscribeFromPush } from "../lib/push";
import { useIntroSlides } from "./IntroTour";
import { useI18n } from "../i18n/I18nContext";

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
  const [showAboutApp, setShowAboutApp] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [feedbackType, setFeedbackType] = useState<"bug" | "suggestion" | "other">("suggestion");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const [notif, setNotif] = useState<NotificationSettingsData | null>(null);
  const [notifError, setNotifError] = useState("");
  const [notifBusy, setNotifBusy] = useState(false);
  const [deviceSubscribed, setDeviceSubscribed] = useState(false);

  type RecoveryMode = "FLEXIBLE_DAY" | "BUSY_DAY" | "TRAVEL_DAY";
  const [recoveryDayActive, setRecoveryDayActive] = useState<boolean | null>(null);
  const [recoveryMode, setRecoveryMode] = useState<RecoveryMode>("FLEXIBLE_DAY");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [travelStart, setTravelStart] = useState("");
  const [travelEnd, setTravelEnd] = useState("");
  const [travelBusy, setTravelBusy] = useState(false);
  const [travelMsg, setTravelMsg] = useState("");
  const [showRecoveryPremiumLock, setShowRecoveryPremiumLock] = useState(false);

  useEffect(() => {
    (async () => {
      const [meRes, settingsRes, notifRes, recoveryRes] = await Promise.all([
        api.get<MeResponse>("/me"),
        api.get<SettingsData>("/settings"),
        api.get<NotificationSettingsData>("/settings?action=notifications"),
        api.get<{ active: boolean; mode: RecoveryMode | null }>("/intelligence?action=recovery-day"),
      ]);
      if (!meRes.success || !meRes.data) {
        navigate("/login");
        return;
      }
      setMe(meRes.data);
      if (settingsRes.success && settingsRes.data) setSettings(settingsRes.data);
      if (notifRes.success && notifRes.data) setNotif(notifRes.data);
      if (recoveryRes.success && recoveryRes.data) {
        setRecoveryDayActive(recoveryRes.data.active);
        if (recoveryRes.data.mode) setRecoveryMode(recoveryRes.data.mode);
      }
      if (pushSupported()) setDeviceSubscribed(!!(await currentSubscription()));
    })();
  }, [navigate]);

  async function toggleRecoveryDay() {
    if (recoveryDayActive === null) return;
    const nextValue = !recoveryDayActive;
    if (nextValue && !me?.is_premium) { setShowRecoveryPremiumLock(true); return; }
    setRecoveryBusy(true);
    const res = await api.post<{ active: boolean; mode?: RecoveryMode }>(
      "/intelligence?action=recovery-day",
      nextValue ? { enable: true, mode: recoveryMode } : { enable: false },
    );
    setRecoveryBusy(false);
    if (res.success && res.data) {
      setRecoveryDayActive(res.data.active);
      flashSaved();
    } else if (res.error?.code === "PREMIUM_REQUIRED") {
      setShowRecoveryPremiumLock(true);
    }
  }

  async function activateTravelMode() {
    if (!travelStart || !travelEnd) return;
    if (!me?.is_premium) { setShowRecoveryPremiumLock(true); return; }
    setTravelBusy(true);
    setTravelMsg("");
    const res = await api.post<{ days_activated: number }>("/intelligence?action=travel-mode", { start_date: travelStart, end_date: travelEnd });
    setTravelBusy(false);
    if (res.success && res.data) {
      setTravelMsg(`✓ فعّلنا وضع السفر لـ${res.data.days_activated} يوم`);
      if (travelStart === todayIso()) { setRecoveryDayActive(true); setRecoveryMode("TRAVEL_DAY"); }
    } else if (res.error?.code === "PREMIUM_REQUIRED") {
      setShowRecoveryPremiumLock(true);
    } else {
      setTravelMsg(res.error?.message ?? "صار خطأ");
    }
  }

  function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
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

  async function submitFeedback(e: FormEvent) {
    e.preventDefault();
    setFeedbackError("");
    if (feedbackMsg.trim().length < 5) { setFeedbackError("اكتب رسالة أوضح شوي (5 أحرف على الأقل)."); return; }
    setFeedbackBusy(true);
    const res = await api.post("/feedback", { type: feedbackType, message: feedbackMsg.trim() });
    setFeedbackBusy(false);
    if (!res.success) { setFeedbackError(res.error?.message ?? "صار خطأ"); return; }
    setFeedbackMsg("");
    setFeedbackSent(true);
    setTimeout(() => setFeedbackSent(false), 3000);
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

  async function shareApp() {
    // رابط إحالة حقيقي (حزمة تطوير الإحالة) — منح XP يصير فقط لما يسجّل حساب جديد فعليًا عبر
    // هذا الرابط (auth-register.mts)، صفر XP لمجرد الضغط على هذا الزر.
    const url = `https://cjworkout.netlify.app/register?ref=${encodeURIComponent(me?.referral_code ?? "")}`;
    const text = "جرب تطبيق CJ FOOD لحساب السعرات وتنظيم التغذية بالذكاء الاصطناعي!";
    if (navigator.share) {
      try {
        await navigator.share({ title: "CJ FOOD", text, url });
      } catch {
        // المستخدم ألغى نافذة المشاركة — تجاهل بأمان، صفر خطأ يظهر له
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"} photoUrl={me.photo_url}>
      <main className="page-container">
        <h1 className="font-display">⚙️ الإعدادات</h1>
        {/* إشارة حقيقية من /me's ai_status — مو شارة مزيّفة دائمًا خضراء بغض النظر عن الحالة الفعلية */}
        <p className={`ai-status-badge ${me.ai_status === "ok" ? "ok" : "warn"}`}>
          {me.ai_status === "ok" ? "🟢 مساعد Captain CJ الذكي شغّال" : "🟡 مساعد Captain CJ الذكي غير مفعّل حاليًا"}
        </p>
        {savedMsg && <div className="notice-box" style={{ background: "rgba(76, 122, 94, 0.15)", borderColor: "var(--moss)" }}>{savedMsg}</div>}

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>المظهر</h3>
          <ThemeSelector isPremium={me.is_premium} currentTheme={me.theme} />
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>🔗 المشاركة والمجتمع</h3>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-moss" onClick={shareApp}>📤 شارك التطبيق مع أصدقائك</button>
            <a href="https://instagram.com/tfxo1" target="_blank" rel="noopener noreferrer" className="btn btn-outline-dark">📷 تابعنا على إنستغرام</a>
          </div>
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
          <button type="button" className="btn btn-outline-dark" style={{ marginTop: 14, marginInlineStart: 10 }} onClick={() => setShowAboutApp(true)}>
            ℹ️ حول التطبيق والشروط
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
                  <p className="notif-row-label" style={{ marginBottom: 6 }}>{t("settings.sleepScheduleLabel")}</p>
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
            <h3 style={{ marginTop: 0 }}>{t("settings.recoveryDayTitle")}</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
              {t("settings.recoveryDayBody")}
            </p>
            {!recoveryDayActive && (
              <select value={recoveryMode} onChange={(e) => setRecoveryMode(e.target.value as RecoveryMode)} style={{ marginBottom: 10 }}>
                <option value="FLEXIBLE_DAY">{t("settings.recoveryModeFlexible")}</option>
                <option value="BUSY_DAY">{t("settings.recoveryModeBusy")}</option>
              </select>
            )}
            <div className="notif-row">
              <span className="notif-row-label">
                {t("settings.recoveryDayToggle")}
                {recoveryDayActive && recoveryMode === "TRAVEL_DAY" && " ✈️"}
              </span>
              <label className="switch">
                <input type="checkbox" checked={recoveryDayActive} disabled={recoveryBusy} onChange={toggleRecoveryDay} />
                <span className="switch-track" />
              </label>
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <p style={{ fontWeight: 600, marginBottom: 4 }}>{t("settings.travelModeTitle")}</p>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 8 }}>{t("settings.travelModeBody")}</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input type="date" value={travelStart} onChange={(e) => setTravelStart(e.target.value)} />
                <span>—</span>
                <input type="date" value={travelEnd} onChange={(e) => setTravelEnd(e.target.value)} />
                <button className="btn btn-outline-dark" disabled={travelBusy || !travelStart || !travelEnd} onClick={activateTravelMode}>
                  {t("settings.travelModeActivate")}
                </button>
              </div>
              {travelMsg && <p style={{ marginTop: 8, fontSize: "0.85rem" }}>{travelMsg}</p>}
            </div>
          </div>
        )}
        {showRecoveryPremiumLock && (
          <PremiumFeatureModal featureName={t("settings.recoveryDayTitle")} onClose={() => setShowRecoveryPremiumLock(false)} />
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
          <h3 style={{ marginTop: 0 }}>📝 اقتراح أو بلاغ</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: -6 }}>
            لاحظت مشكلة تقنية أو عندك اقتراح يحسّن التطبيق؟ خبرنا مباشرة من هني.
          </p>
          <form onSubmit={submitFeedback} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[["suggestion", "💡 مقترح"], ["bug", "🐞 بلاغ مشكلة"], ["other", "📝 أخرى"]].map(([value, label]) => (
                <button
                  key={value} type="button"
                  className={`btn ${feedbackType === value ? "btn-moss" : "btn-outline-dark"}`}
                  onClick={() => setFeedbackType(value as typeof feedbackType)}
                >
                  {label}
                </button>
              ))}
            </div>
            <textarea
              rows={3} placeholder="اكتب رسالتك هني..." required minLength={5}
              value={feedbackMsg} onChange={(e) => setFeedbackMsg(e.target.value)}
            />
            {feedbackError && <p className="field-error">{feedbackError}</p>}
            {feedbackSent && <p style={{ color: "var(--moss)", fontSize: "0.85rem" }}>تم الإرسال، تسلم! ✓</p>}
            <button type="submit" className="btn btn-moss" disabled={feedbackBusy} style={{ alignSelf: "flex-start" }}>
              {feedbackBusy ? "..." : "إرسال"}
            </button>
          </form>
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
      {showAboutApp && <AboutAppModal onClose={() => setShowAboutApp(false)} />}
    </AppShell>
  );
}
