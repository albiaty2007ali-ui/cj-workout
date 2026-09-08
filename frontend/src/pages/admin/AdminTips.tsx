import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

interface Tip {
  id: string; text: string; category: string; active: boolean; priority: number;
  meal_type: string | null; goal: string | null; time_period: string | null;
}

export default function AdminTips() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [mealType, setMealType] = useState("");
  const [goal, setGoal] = useState("");
  const [priority, setPriority] = useState("0");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<{ tips: Tip[]; categories: string[] }>("/admin/tips").then((res) => {
      if (res.success && res.data) { setTips(res.data.tips); setCategories(res.data.categories); }
    });
  }
  useEffect(load, []);

  async function addTip(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api.post("/admin/tips?action=add", { text, category, meal_type: mealType || null, goal: goal || null, priority: Number(priority) });
    if (!res.success) { setError(res.error?.message ?? "صار خطأ"); return; }
    setText(""); setCategory(""); setMealType(""); setGoal(""); setPriority("0");
    load();
  }

  async function toggle(id: string) { await api.post(`/admin/tips?action=toggle&id=${id}`); load(); }
  async function del(id: string) { if (!confirm("حذف هذي النصيحة نهائيًا؟")) return; await api.post(`/admin/tips?action=delete&id=${id}`); load(); }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin>
      <main className="container" style={{ maxWidth: 900 }}>
        <div className="topbar"><Link to="/admin">→ رجوع للوحة الإدارة</Link></div>
        <h1 className="font-display">إدارة النصائح الغذائية</h1>
        <p className="subtitle">{tips.length} نصيحة بقاعدة البيانات — تقدر تضيف نصيحة جديدة بدون أي تعديل بالكود</p>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>إضافة نصيحة جديدة</h3>
          <form onSubmit={addTip} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea placeholder="نص النصيحة..." required minLength={5} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="admin-form-row">
              <input list="tip-categories" placeholder="التصنيف (مثلاً: protein)" required value={category} onChange={(e) => setCategory(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              <datalist id="tip-categories">{categories.map((c) => <option value={c} key={c} />)}</datalist>
              <select value={mealType} onChange={(e) => setMealType(e.target.value)}>
                <option value="">أي وقت وجبة</option>
                <option value="breakfast">فطور</option>
                <option value="lunch">غداء</option>
                <option value="dinner">عشاء</option>
                <option value="snack">سناك</option>
              </select>
              <select value={goal} onChange={(e) => setGoal(e.target.value)}>
                <option value="">أي هدف</option>
                <option value="lose">تنزيل وزن</option>
                <option value="maintain">ثبات</option>
                <option value="gain">تضخيم</option>
              </select>
              <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} title="الأولوية" style={{ width: 80 }} />
            </div>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-moss" style={{ alignSelf: "flex-start" }}>إضافة النصيحة</button>
          </form>
        </div>

        <div style={{ marginTop: 32 }}>
          {tips.map((t) => (
            <div className="admin-list-item" key={t.id}>
              <div>
                <p style={{ fontWeight: 700, color: "var(--heading)" }}>{t.category}{!t.active && " — معطّلة"}</p>
                <p style={{ fontSize: "0.9rem" }}>{t.text}</p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  {t.meal_type && `وجبة: ${t.meal_type} · `}{t.goal && `هدف: ${t.goal} · `}أولوية: {t.priority}
                </p>
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
