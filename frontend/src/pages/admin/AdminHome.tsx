import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

const LINKS = [
  { to: "/admin/tips", label: "💡 النصائح الغذائية", desc: "بنك النصائح المعروضة بالشات" },
  { to: "/admin/levels", label: "⭐ المستويات", desc: "منحنى XP والعناوين" },
  { to: "/admin/streak-milestones", label: "🔥 محطات الـStreak", desc: "مكافآت الاستمرارية" },
  { to: "/admin/recipes", label: "🍳 الوصفات", desc: "وصفات ومكوّنات وخطوات الطبخ" },
  { to: "/admin/notifications", label: "🔔 قوالب الإشعارات", desc: "نصوص الإشعارات (بدون تسليم Push بعد)" },
  { to: "/admin/payments", label: "💳 مراجعة الدفعات", desc: "تفعيل/رفض عمليات الاشتراك اليدوية" },
];

export default function AdminHome() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin>
      <main className="container" style={{ maxWidth: 900 }}>
        <h1 className="font-display">🛠️ لوحة الإدارة</h1>
        <p className="subtitle">إدارة البيانات المرجعية بدون لمس الكود.</p>
        <div className="admin-nav-grid">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="admin-nav-card">
              {l.label}
              <div className="desc">{l.desc}</div>
            </Link>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
