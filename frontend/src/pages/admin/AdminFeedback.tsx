import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { backArrow } from "../../i18n/I18nContext";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

interface FeedbackItem {
  id: string; user_id: string; user_name: string;
  type: "bug" | "suggestion" | "other"; message: string;
  status: "new" | "reviewed"; created_at: string;
}

const TYPE_LABELS: Record<FeedbackItem["type"], string> = { bug: "🐞 بلاغ مشكلة", suggestion: "💡 مقترح", other: "📝 أخرى" };

export default function AdminFeedback() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [items, setItems] = useState<FeedbackItem[]>([]);

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<{ items: FeedbackItem[] }>("/admin/feedback").then((res) => {
      if (res.success && res.data) setItems(res.data.items);
    });
  }
  useEffect(load, []);

  async function markReviewed(id: string) { await api.post(`/admin/feedback?action=review&id=${id}`); load(); }
  async function del(id: string) { if (!confirm("حذف هذا البلاغ نهائيًا؟")) return; await api.post(`/admin/feedback?action=delete&id=${id}`); load(); }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin photoUrl={me.photo_url}>
      <main className="container" style={{ maxWidth: 900 }}>
        <div className="topbar"><Link to="/admin">{backArrow()} رجوع للوحة الإدارة</Link></div>
        <h1 className="font-display">مقترحات وبلاغات المستخدمين</h1>
        <p className="subtitle">{items.length} بلاغ/مقترح — {items.filter((i) => i.status === "new").length} بانتظار المراجعة</p>

        <div style={{ marginTop: 24 }}>
          {items.length === 0 && <p style={{ color: "var(--text-muted)" }}>ماكو بلاغات/مقترحات حاليًا.</p>}
          {items.map((it) => (
            <div className="admin-list-item" key={it.id}>
              <div>
                <p style={{ fontWeight: 700, color: "var(--heading)" }}>
                  {TYPE_LABELS[it.type]}{it.status === "reviewed" && " — تمت المراجعة ✓"}
                </p>
                <p style={{ fontSize: "0.9rem" }}>{it.message}</p>
                <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  من: {it.user_name} · {new Date(it.created_at).toLocaleString("ar-IQ")}
                </p>
              </div>
              <div className="admin-list-actions">
                {it.status !== "reviewed" && <button className="btn btn-moss" onClick={() => markReviewed(it.id)}>تمت المراجعة</button>}
                <button className="btn btn-danger-outline" onClick={() => del(it.id)}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
