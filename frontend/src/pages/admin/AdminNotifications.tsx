import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

interface Template {
  id: string; category: string; title: string; body: string; active: boolean;
  priority: number; meal_type: string | null; cooldown_minutes: number;
}

export default function AdminNotifications() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [mealType, setMealType] = useState("");
  const [priority, setPriority] = useState("0");
  const [cooldown, setCooldown] = useState("0");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<{ templates: Template[]; categories: string[] }>("/admin/notifications").then((res) => {
      if (res.success && res.data) { setTemplates(res.data.templates); setCategories(res.data.categories); }
    });
  }
  useEffect(load, []);

  async function addTemplate(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api.post("/admin/notifications?action=add", {
      title, body, category, meal_type: mealType || null,
      priority: Number(priority), cooldown_minutes: Number(cooldown),
    });
    if (!res.success) { setError(res.error?.message ?? "صار خطأ"); return; }
    setTitle(""); setBody(""); setCategory(""); setMealType(""); setPriority("0"); setCooldown("0");
    load();
  }

  async function toggle(id: string) { await api.post(`/admin/notifications?action=toggle&id=${id}`); load(); }
  async function del(id: string) { if (!confirm("حذف هذا القالب نهائيًا؟")) return; await api.post(`/admin/notifications?action=delete&id=${id}`); load(); }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin>
      <main className="container" style={{ maxWidth: 900 }}>
        <div className="topbar"><Link to="/admin">→ رجوع للوحة الإدارة</Link></div>
        <h1 className="font-display">إدارة قوالب الإشعارات</h1>
        <p className="subtitle">{templates.length} قالب بقاعدة البيانات — بدون تسليم Push فعلي بعد (راجع سجل الهجرة).</p>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>إضافة قالب جديد</h3>
          <form onSubmit={addTemplate} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input placeholder="عنوان الإشعار (مثلاً: 🍳 صباح الخير كابتن)" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea placeholder="نص الإشعار..." required minLength={5} rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="admin-form-row">
              <input list="notif-categories" placeholder="التصنيف (مثلاً: BREAKFAST)" required value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              <datalist id="notif-categories">{categories.map((c) => <option value={c} key={c} />)}</datalist>
              <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
                <option value="">بدون وجبة محددة</option>
                <option value="breakfast">فطور</option>
                <option value="lunch">غداء</option>
                <option value="dinner">عشاء</option>
                <option value="snack">سناك</option>
              </select>
              <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} title="الأولوية" style={{ width: 80 }} />
              <input type="number" value={cooldown} onChange={(e) => setCooldown(e.target.value)} title="Cooldown بالدقائق" style={{ width: 100 }} />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-moss" style={{ alignSelf: "flex-start" }}>إضافة القالب</button>
          </form>
        </div>

        <div style={{ marginTop: 32 }}>
          {templates.map((t) => (
            <div className="admin-list-item" key={t.id}>
              <div>
                <p style={{ fontWeight: 700, color: "var(--heading)" }}>{t.category}{!t.active && " — معطّل"}</p>
                <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>{t.title}</p>
                <p style={{ fontSize: "0.85rem" }}>{t.body}</p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{t.meal_type && `وجبة: ${t.meal_type} · `}أولوية: {t.priority}</p>
              </div>
              <div className="admin-list-actions">
                <button className="btn btn-moss" onClick={() => toggle(t.id)}>{t.active ? "تعطيل" : "تفعيل"}</button>
                <button className="btn btn-danger-outline" onClick={() => del(t.id)}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
