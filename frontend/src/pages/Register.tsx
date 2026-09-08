import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function Register() {
  const navigate = useNavigate();
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
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>حساب جديد — CJ WORKOUT</h1>
        <div className="field">
          <label htmlFor="name">الاسم</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          {errors.name && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="email">البريد الإلكتروني</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          {errors.email && <p className="field-error">{errors.email}</p>}
        </div>
        <div className="field">
          <label htmlFor="password">كلمة المرور</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          {errors.password && <p className="field-error">{errors.password}</p>}
        </div>
        <div className="field">
          <label htmlFor="confirm">تأكيد كلمة المرور</label>
          <input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          {errors.confirm && <p className="field-error">{errors.confirm}</p>}
        </div>
        {errors._ && <p className="field-error">{errors._}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? "..." : "إنشاء الحساب"}</button>
        <p className="auth-switch">
          عندك حساب؟ <Link to="/login">سجّل دخولك</Link>
        </p>
      </form>
    </div>
  );
}
