import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../../lib/api";
import AppShell from "../../components/AppShell";

interface LevelRow { level: number; required_xp: number; title: string; reward: string | null; }

export default function AdminLevels() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [level, setLevel] = useState("");
  const [requiredXp, setRequiredXp] = useState("");
  const [title, setTitle] = useState("");
  const [reward, setReward] = useState("");
  const [error, setError] = useState("");
  const [edits, setEdits] = useState<Record<number, { title: string; required_xp: string; reward: string }>>({});

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      if (res.data.role !== "admin") { navigate("/chat"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<{ levels: LevelRow[] }>("/admin/levels").then((res) => {
      if (res.success && res.data) {
        setLevels(res.data.levels);
        const e: Record<number, { title: string; required_xp: string; reward: string }> = {};
        res.data.levels.forEach((l) => { e[l.level] = { title: l.title, required_xp: String(l.required_xp), reward: l.reward ?? "" }; });
        setEdits(e);
      }
    });
  }
  useEffect(load, []);

  async function addLevel(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await api.post("/admin/levels?action=add", { level: Number(level), required_xp: Number(requiredXp), title, reward: reward || null });
    if (!res.success) { setError(res.error?.message ?? "صار خطأ"); return; }
    setLevel(""); setRequiredXp(""); setTitle(""); setReward("");
    load();
  }

  async function saveLevel(lvl: number) {
    const e = edits[lvl];
    await api.post(`/admin/levels?action=update&level=${lvl}`, { title: e.title, required_xp: Number(e.required_xp), reward: e.reward || null });
    load();
  }

  async function deleteLevel(lvl: number) {
    if (!confirm("حذف هذا المستوى نهائيًا؟")) return;
    await api.post(`/admin/levels?action=delete&level=${lvl}`);
    load();
  }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin>
      <main className="container" style={{ maxWidth: 900 }}>
        <div className="topbar"><Link to="/admin">→ رجوع للوحة الإدارة</Link></div>
        <h1 className="font-display">إدارة المستويات (Levels)</h1>
        <p className="subtitle">{levels.length} مستوى — يتحدد شكل تقدّم XP بالبروفايل من هذا الجدول</p>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>إضافة مستوى جديد</h3>
          <form onSubmit={addLevel} className="admin-form-row">
            <input type="number" placeholder="رقم المستوى" required value={level} onChange={(e) => setLevel(e.target.value)} style={{ width: 110 }} />
            <input type="number" placeholder="XP المطلوب" required value={requiredXp} onChange={(e) => setRequiredXp(e.target.value)} style={{ width: 130 }} />
            <input placeholder="العنوان (مثلاً: مستمر)" required value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
            <input placeholder="مكافأة (اختياري)" value={reward} onChange={(e) => setReward(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <button type="submit" className="btn btn-moss">إضافة</button>
          </form>
          {error && <p className="field-error">{error}</p>}
        </div>

        <div style={{ marginTop: 32 }}>
          {levels.map((lvl) => {
            const e = edits[lvl.level] ?? { title: lvl.title, required_xp: String(lvl.required_xp), reward: lvl.reward ?? "" };
            return (
              <div className="admin-list-item" key={lvl.level}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", flex: 1 }}>
                  <strong style={{ color: "var(--heading)" }}>#{lvl.level}</strong>
                  <input value={e.title} onChange={(ev) => setEdits((prev) => ({ ...prev, [lvl.level]: { ...e, title: ev.target.value } }))} />
                  <input type="number" value={e.required_xp} onChange={(ev) => setEdits((prev) => ({ ...prev, [lvl.level]: { ...e, required_xp: ev.target.value } }))} style={{ width: 120 }} />
                  <input placeholder="مكافأة" value={e.reward} onChange={(ev) => setEdits((prev) => ({ ...prev, [lvl.level]: { ...e, reward: ev.target.value } }))} />
                </div>
                <div className="admin-list-actions">
                  <button className="btn btn-moss" onClick={() => saveLevel(lvl.level)}>حفظ</button>
                  <button className="btn btn-danger-outline" onClick={() => deleteLevel(lvl.level)}>حذف</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </AppShell>
  );
}
