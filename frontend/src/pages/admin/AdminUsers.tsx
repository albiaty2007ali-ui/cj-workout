import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { backArrow } from "../../i18n/I18nContext";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";
import UserDetailModal from "../../components/admin/UserDetailModal";

interface UserRow {
  id: string; name: string; email: string; role: string; disabled: boolean; email_verified: boolean;
  created_at: string | null; xp: number; streak_days: number; free_meals_used: number;
  is_premium: boolean; subscription_end_date: string | null; tournament_active: boolean;
  calorie_target: number | null; category: "free" | "paid" | "tournament";
}

interface Stats { total_users: number; total_subscribers: number; active_today: number; meals_logged_today: number; }

const CATEGORY_LABELS: Record<UserRow["category"], string> = { free: "🆓 مجاني", paid: "💎 مدفوع", tournament: "🏆 بطولة" };

export default function AdminUsers() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  const [sub, setSub] = useState("all");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (sub !== "all") params.set("sub", sub);
    api.get<{ users: UserRow[]; stats: Stats }>(`/admin/users?${params.toString()}`).then((res) => {
      if (res.success && res.data) { setUsers(res.data.users); setStats(res.data.stats); }
      setLoading(false);
    });
  }
  useEffect(load, [q, sub]);

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin photoUrl={me.photo_url}>
      <main className="container" style={{ maxWidth: 1000 }}>
        <div className="topbar"><Link to="/admin">{backArrow()} رجوع للوحة الإدارة</Link></div>
        <h1 className="font-display">👥 إدارة المستخدمين</h1>
        <p className="subtitle">بحث، فلترة، ومتابعة تفصيلية لكل مشترك.</p>

        {stats && (
          <div className="admin-stats-grid">
            <div className="admin-stat-card"><div className="admin-stat-value">{stats.total_users}</div><div className="admin-stat-label">إجمالي المشتركين</div></div>
            <div className="admin-stat-card"><div className="admin-stat-value">{stats.total_subscribers}</div><div className="admin-stat-label">اشتراكات مدفوعة فعّالة</div></div>
            <div className="admin-stat-card"><div className="admin-stat-value">{stats.active_today}</div><div className="admin-stat-label">نشط اليوم</div></div>
            <div className="admin-stat-card"><div className="admin-stat-value">{stats.meals_logged_today}</div><div className="admin-stat-label">وجبة مسجَّلة اليوم</div></div>
          </div>
        )}

        <div className="admin-search-row">
          <input type="text" placeholder="بحث بالاسم أو البريد..." value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
          <select value={sub} onChange={(e) => setSub(e.target.value)}>
            <option value="all">كل الأنواع</option>
            <option value="free">🆓 مجاني</option>
            <option value="paid">💎 مدفوع</option>
            <option value="tournament">🏆 بطولة</option>
          </select>
        </div>

        {loading && <p style={{ color: "var(--text-muted)" }}>...</p>}
        {!loading && users.length === 0 && <p style={{ color: "var(--text-muted)" }}>ماكو نتائج مطابقة.</p>}

        {!loading && users.map((u) => (
          <div className="admin-list-item admin-user-row" key={u.id} onClick={() => setSelectedId(u.id)}>
            <div>
              <p style={{ fontWeight: 700, color: "var(--heading)", margin: 0 }}>
                {u.name || "(بدون اسم)"} <span className={`admin-badge admin-badge-${u.category}`}>{CATEGORY_LABELS[u.category]}</span>
                {!u.email_verified && <span className="admin-badge admin-badge-unverified" style={{ marginInlineStart: 6 }}>غير مؤكَّد</span>}
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "4px 0 0" }}>{u.email}</p>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "4px 0 0" }}>
                🔥 {u.streak_days} · ⭐ {u.xp} XP · هدف {u.calorie_target ?? "—"} سعرة
              </p>
            </div>
          </div>
        ))}

        {selectedId && <UserDetailModal userId={selectedId} onClose={() => { setSelectedId(null); load(); }} />}
      </main>
    </AppShell>
  );
}
