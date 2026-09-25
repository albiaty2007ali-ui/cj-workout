import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";

const RESEND_COOLDOWN_SECONDS = 60;

/** شاشة تأكيد البريد الإلكتروني — كود 6 أرقام أُرسل بالتسجيل (auth-register.mts) عبر Resend.
 * صفر وصول فعلي للشات/تسجيل الوجبات/لوحة الإدارة قبل هذي الخطوة (حراس حقيقية بالباك إند —
 * chat.mts/progress-daily.mts — هذا مجرد الواجهة). */
export default function VerifyEmail() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.email_verified) { navigate("/chat"); return; }
      setEmail(res.data.email ?? "");
    });
  }, [navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) { setError(t("auth.verifyCodeFormatError")); return; }
    setLoading(true);
    try {
      const res = await api.post("/auth/verify-email", { code });
      if (!res.success) {
        setError(res.error?.message ?? t("auth.verifyGenericError"));
        return;
      }
      navigate("/chat");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setResendMsg("");
    setError(null);
    const res = await api.post<{ ok: boolean }>("/auth/verify-email?action=resend");
    if (!res.success) {
      const retryAfter = res.error?.details?.retry_after_seconds;
      if (retryAfter) setResendCooldown(Number(retryAfter));
      setError(res.error?.message ?? t("auth.verifyGenericError"));
      return;
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS);
    setResendMsg(t("auth.resendSuccess"));
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t("auth.verifyTitle")}</h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          {t("auth.verifyIntro")} <strong>{email}</strong>. {t("auth.verifyIntroSuffix")}
        </p>
        <div className="field">
          <label htmlFor="code">{t("auth.verificationCodeLabel")}</label>
          <input
            id="code" inputMode="numeric" maxLength={6} value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000" style={{ fontSize: "1.4rem", letterSpacing: "6px", textAlign: "center" }}
            required autoFocus
          />
        </div>
        {error && <p className="field-error">{error}</p>}
        {resendMsg && <p style={{ color: "var(--moss)", fontSize: "0.85rem" }}>{resendMsg}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? t("common.loading") : t("auth.verifySubmit")}</button>
        <button
          type="button" className="btn btn-outline-dark" disabled={resendCooldown > 0} onClick={resend}
          style={{ marginTop: 10 }}
        >
          {resendCooldown > 0 ? `${t("auth.resendCooldown")} (${resendCooldown})` : t("auth.resend")}
        </button>
      </form>
    </div>
  );
}
