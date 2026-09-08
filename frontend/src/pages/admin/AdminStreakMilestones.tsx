import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

interface Milestone { id: string; days: number; xp_reward: number; label: string; active: boolean; }

export default function AdminStreakMilestones() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [days, setDays] = useState("");
  const [xpReward, setXpReward] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<{ milestones: Milestone[] }>("/admin/streak-milestones").then((res) => {
      if (res.success && res.data) setMilestones(res.data.milestones);
    });
  }
  useEffect(load, []);

  async function addMilestone(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api.post("/admin/streak-milestones?action=add", { days: Number(days), xp_reward: Number(xpReward), label });
    if (!res.success) { setError(res.error?.message ?? "صار خطأ"); return; }
    setDays(""); setXpReward(""); setLabel("");
    load();
  }

  async function toggle(id: string) { await api.post(`/admin/streak-milestones?action=toggle&id=${id}`); load(); }
  async function del(id: string) { if (!confirm("حذف هذي المحطة نهائيًا؟")) return; await api.post(`/admin/streak-milestones?action=delete&id=${id}`); load(); }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin>
      <main className="container" style={{ maxWidth: 900 }}>
        <div className="topbar"><Link to="/admin">→ رجوع للوحة الإدارة</Link></div>
        <h1 className="font-display">إدارة محطات الستريك (Milestones)</h1>
        <p className="subtitle">{milestones.length} محطة — كل محطة تُمنح XP مرة وحدة فقط لكل مستخدم</p>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>إضافة محطة جديدة</h3>
          <form onSubmit={addMilestone} className="admin-form-row">
            <input type="number" placeholder="عدد الأيام" required value={days} onChange={(e) => setDays(e.target.value)} style={{ width: 120 }} />
            <input type="number" placeholder="XP المكافأة" required value={xpReward} onChange={(e) => setXpReward(e.target.value)} style={{ width: 130 }} />
            <input placeholder="الوصف (مثلاً: أسبوع كامل)" required value={label} onChange={(e) => setLabel(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <button type="submit" className="btn btn-moss">إضافة</button>
          </form>
          {error && <p className="field-error">{error}</p>}
        </div>

        <div style={{ marginTop: 32 }}>
          {milestones.map((m) => (
            <div className="admin-list-item" key={m.id}>
              <div>
                <p style={{ fontWeight: 700, color: "var(--heading)" }}>🔥 {m.days} يوم — {m.label}{!m.active && " (معطّلة)"}</p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>مكافأة: {m.xp_reward} XP</p>
              </div>
              <div className="admin-list-actions">
                <button className="btn btn-moss" onClick={() => toggle(m.id)}>{m.active ? "تعطيل" : "تفعيل"}</button>
                <button className="btn btn-danger-outline" onClick={() => del(m.id)}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </AppShell>
  );
}
