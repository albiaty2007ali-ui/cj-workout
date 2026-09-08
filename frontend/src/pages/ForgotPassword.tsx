import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export default function ForgotPassword() {
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
        <h1>استرجاع كلمة المرور</h1>
        {sent ? (
          <p>لو الإيميل مسجّل عندنا، وصلتك رسالة فيها رابط لإعادة تعيين كلمة المرور (صالح 30 دقيقة).</p>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">البريد الإلكتروني</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <button className="btn" type="submit" disabled={loading}>{loading ? "..." : "أرسل رابط الاستعادة"}</button>
          </form>
        )}
        <p className="auth-switch"><Link to="/login">رجوع لتسجيل الدخول</Link></p>
      </div>
    </div>
  );
}
