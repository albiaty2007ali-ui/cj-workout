import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{t("auth.forgotTitle")}</h1>
        {sent ? (
          <p>{t("auth.forgotSent")}</p>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">{t("auth.email")}</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <button className="btn" type="submit" disabled={loading}>{loading ? t("common.loading") : t("auth.sendResetLink")}</button>
          </form>
        )}
        <p className="auth-switch"><Link to="/login">{t("auth.backToLogin")}</Link></p>
      </div>
    </div>
  );
}
