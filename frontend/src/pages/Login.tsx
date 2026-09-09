import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";
import LanguageToggle from "../components/LanguageToggle";

export default function Login() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ user_id: string }>("/auth/login", { email, password });
      if (!res.success) {
        setError(res.error?.message ?? "صار خطأ، جرب مرة ثانية");
        return;
      }
      navigate("/chat");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <LanguageToggle persistToBackend={false} />
      </div>
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t("auth.loginTitle")}</h1>
        <div className="field">
          <label htmlFor="email">{t("auth.email")}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">{t("auth.password")}</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {error && <p className="field-error">{error}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? t("common.loading") : t("auth.login")}</button>
        <p className="auth-switch">
          {t("auth.noAccount")} <Link to="/register">{t("auth.registerLink")}</Link>
        </p>
        <p className="auth-switch">
          <Link to="/forgot-password">{t("auth.forgotPassword")}</Link>
        </p>
      </form>
    </div>
  );
}
