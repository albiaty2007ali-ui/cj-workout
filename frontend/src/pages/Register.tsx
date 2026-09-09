import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";
import LanguageToggle from "../components/LanguageToggle";

export default function Register() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);
    try {
      const res = await api.post<{ user_id: string }>("/auth/register", { name, email, password, confirm });
      if (!res.success) {
        setErrors(res.error?.details ?? { _: res.error?.message ?? "صار خطأ، جرب مرة ثانية" });
        return;
      }
      navigate("/chat");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <LanguageToggle persistToBackend={false} />
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>{t("auth.registerTitle")}</h1>
        <div className="field">
          <label htmlFor="name">{t("auth.name")}</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="email">{t("auth.email")}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>
        <div className="field">
          <label htmlFor="password">{t("auth.password")}</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          {errors.password && <p className="field-error">{errors.password}</p>}
        </div>
        <div className="field">
          <label htmlFor="confirm">{t("auth.confirmPassword")}</label>
          <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          {errors.confirm && <p className="field-error">{errors.confirm}</p>}
        </div>
        {errors._ && <p className="field-error">{errors._}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? t("common.loading") : t("auth.createAccount")}</button>
        <p className="auth-switch">
          {t("auth.haveAccount")} <Link to="/login">{t("auth.loginLink")}</Link>
        </p>
      </form>
    </div>
  );
}
