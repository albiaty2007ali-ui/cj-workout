import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";

export interface BanDetails {
  reason: string;
  expires_at: string;
  permanent: string; // "true"/"false" — قادمة من jsonError's details (Record<string,string>)
}

/** صفحة الحساب المحظور — تُفتح لما login/chat/progress-daily يرجّعون ACCOUNT_BANNED. نفس مبدأ
 *  VerifyEmail.tsx: مخرج واضح دائمًا (تسجيل خروج)، صفر حبس. تفاصيل السبب/الانتهاء تجي عبر
 *  navigate state من نقطة الاكتشاف — لو مفقودة (فتح مباشر/تحديث الصفحة) تعرض رسالة عامة بس
 *  تبقى الصفحة وظيفية بالكامل. */
export default function AccountBanned() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const details = (location.state as { ban?: BanDetails } | null)?.ban ?? null;
  const permanent = details?.permanent === "true";

  async function logout() {
    await api.post("/auth/logout");
    navigate("/login");
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>🚫 {t("banned.title")}</h1>
        {details?.reason && (
          <p style={{ color: "var(--text-muted)" }}>
            {t("banned.reasonLabel")}: <strong>{details.reason}</strong>
          </p>
        )}
        {permanent ? (
          <p style={{ color: "var(--text-muted)" }}>{t("banned.permanent")}</p>
        ) : details?.expires_at ? (
          <p style={{ color: "var(--text-muted)" }}>
            {t("banned.expiresLabel")}: <strong>{new Date(details.expires_at).toLocaleString("ar-IQ")}</strong>
          </p>
        ) : (
          <p style={{ color: "var(--text-muted)" }}>{t("banned.genericBody")}</p>
        )}
        <button type="button" className="btn" style={{ marginTop: 18 }} onClick={logout}>
          {t("banned.logout")}
        </button>
      </div>
    </div>
  );
}
