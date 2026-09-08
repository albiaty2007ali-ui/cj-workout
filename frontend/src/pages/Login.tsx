import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function Login() {
  const navigate = useNavigate();
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
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>تسجيل الدخول — CJ WORKOUT</h1>
        <div className="field">
          <label htmlFor="email">البريد الإلكتروني</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">كلمة المرور</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        {error && <p className="field-error">{error}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? "..." : "دخول"}</button>
        <p className="auth-switch">
          ماكو حساب؟ <Link to="/register">سجّل وحدة جديدة</Link>
        </p>
      </form>
    </div>
  );
}
