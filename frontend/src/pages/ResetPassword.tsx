import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const uid = params.get("uid") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token || !uid) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>رابط غير صالح</h1>
          <p className="field-error">رابط إعادة التعيين غير صالح أو منتهي.</p>
          <p className="auth-switch"><Link to="/forgot-password">اطلب رابط جديد</Link></p>
        </div>
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post("/auth/reset-password", { token, uid, password, confirm });
      if (!res.success) {
        setError(res.error?.message ?? "صار خطأ، جرب مرة ثانية");
        return;
      }
      navigate("/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>كلمة مرور جديدة</h1>
        <div className="field">
          <label htmlFor="password">كلمة المرور الجديدة</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        </div>
        <div className="field">
          <label htmlFor="confirm">تأكيد كلمة المرور</label>
          <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        </div>
        {error && <p className="field-error">{error}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? "..." : "غيّر كلمة المرور"}</button>
      </form>
    </div>
  );
}
