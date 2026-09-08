import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Chart from "chart.js/auto";
import { api, type MeResponse } from "../lib/api";
import type { WeightStatsResponse } from "../lib/progressApi";
import AppShell from "../components/AppShell";

const PERIODS: Array<[string, string]> = [["7", "7 أيام"], ["30", "30 يوم"], ["90", "90 يوم"], ["180", "6 أشهر"], ["365", "سنة"], ["all", "الكل"]];

const TREND_LABELS: Record<string, string> = {
  DECREASING: "نازل تدريجيًا", INCREASING: "صاعد تدريجيًا", STABLE: "مستقر تقريبًا",
  INSUFFICIENT_DATA: "نحتاج قياسات أكثر لتحديد الاتجاه بدقة",
};

export default function WeightProgress() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [stats, setStats] = useState<WeightStatsResponse | null>(null);
  const [period, setPeriod] = useState("30");
  const [newWeight, setNewWeight] = useState("");
  const [weightError, setWeightError] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    api.get<MeResponse>("/me").then((res) => {
      if (!res.success || !res.data) { navigate("/login"); return; }
      setMe(res.data);
    });
  }, [navigate]);

  function load() {
    api.get<WeightStatsResponse>(`/progress/weight?period=${period}`).then((res) => {
      if (res.success && res.data) {
        setStats(res.data);
        setGoalWeight(res.data.goal_weight != null ? String(res.data.goal_weight) : "");
      }
    });
  }

  useEffect(load, [period]);

  useEffect(() => {
    if (!stats || !canvasRef.current || stats.entries.length === 0) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: stats.entries.map((e) => e.date.slice(0, 10)),
        datasets: [{
          label: "الوزن (كغم)", data: stats.entries.map((e) => e.weight_kg),
          borderColor: "var(--moss)", backgroundColor: "transparent", tension: 0.25, pointRadius: 3,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "var(--text-muted)" }, grid: { color: "var(--border)" } },
          y: { ticks: { color: "var(--text-muted)" }, grid: { color: "var(--border)" } },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [stats]);

  async function saveWeight() {
    setWeightError("");
    const w = parseFloat(newWeight);
    if (!w) { setWeightError("أدخل وزنًا صحيحًا"); return; }
    setSaving(true);
    const res = await api.post("/progress/weight", { weight_kg: w });
    setSaving(false);
    if (!res.success) { setWeightError(res.error?.message ?? "صار خطأ"); return; }
    setNewWeight("");
    load();
  }

  async function saveGoal() {
    await api.post("/progress/weight?action=goal", { goal_weight: goalWeight ? parseFloat(goalWeight) : null });
    load();
  }

  async function deleteEntry(id: string) {
    await api.post("/progress/weight?action=delete", { id });
    load();
  }

  if (!me) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="container" style={{ maxWidth: 720 }}>
        <div className="topbar">
          <Link to="/chat">→ رجوع للشات</Link>
          <Link to="/daily" style={{ color: "var(--text-muted)" }}>🍽️ يومي الغذائي</Link>
        </div>

        <h1 className="font-display">⚖️ متابعة الوزن</h1>

        <div className="notice-box weight-log-form">
          <input type="number" step="0.1" placeholder="وزنك الحالي (كغم)" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} style={{ flex: 1, minWidth: 140, borderRadius: 999, border: "1px solid var(--border-input)", padding: "0 14px", height: 38 }} />
          <button type="button" className="btn btn-moss" disabled={saving} onClick={saveWeight}>حفظ الوزن</button>
          {weightError && <p className="field-error" style={{ width: "100%", margin: 0 }}>{weightError}</p>}
        </div>

        {stats && stats.entries.length > 0 ? (
          <>
            <div className="weight-stats-grid">
              <div className="calorie-card"><p className="cc-label">الحالي</p><p className="cc-value">{stats.current_weight} kg</p></div>
              <div className="calorie-card"><p className="cc-label">البداية</p><p className="cc-value">{stats.starting_weight} kg</p></div>
              <div className="calorie-card"><p className="cc-label">التغيّر الكلي</p><p className="cc-value">{stats.total_change} kg</p></div>
              <div className="calorie-card"><p className="cc-label">المتوسط</p><p className="cc-value">{stats.average_weight} kg</p></div>
            </div>

            <div className="notice-box" style={{ marginTop: 16 }}>
              {stats.weekly_change !== null ? (
                <p>📅 التغيّر الأسبوعي: <strong>{stats.weekly_change} kg</strong></p>
              ) : (
                <p className="weekly-change-note">{stats.weekly_change_note}</p>
              )}
              <p style={{ marginTop: 6 }}>📈 الاتجاه: {TREND_LABELS[stats.trend]}</p>
            </div>

            <div className="notice-box" style={{ marginTop: 16, textAlign: "right" }}>
              <h3 style={{ marginTop: 0 }}>🎯 الهدف</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input type="number" step="0.1" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} placeholder="وزن مستهدف (كغم، اختياري)" style={{ flex: 1, minWidth: 140, borderRadius: 999, border: "1px solid var(--border-input)", padding: "0 14px", height: 38 }} />
                <button type="button" className="btn btn-outline-dark" onClick={saveGoal}>حفظ الهدف</button>
              </div>
              {stats.distance_to_goal !== null && (
                <p style={{ marginTop: 10 }}>
                  {stats.goal_direction === "REACHED" && "🎉 وصلت هدفك بالضبط!"}
                  {(stats.goal_direction === "LOSS" || stats.goal_direction === "UNDER_GOAL") && <>باقيلك <strong>{stats.distance_to_goal} kg</strong> حتى تنزل للهدف</>}
                  {(stats.goal_direction === "GAIN" || stats.goal_direction === "OVER_GOAL") && <>باقيلك <strong>{stats.distance_to_goal} kg</strong> حتى توصل للهدف</>}
                  {stats.goal_direction === "MAINTAIN" && <>الفرق عن هدف الثبات: <strong>{stats.distance_to_goal} kg</strong></>}
                </p>
              )}
            </div>

            <div className="notice-box weight-chart-wrap">
              <div className="weight-period-tabs">
                {PERIODS.map(([p, label]) => (
                  <button key={p} className={period === p ? "active" : ""} onClick={() => setPeriod(p)}>{label}</button>
                ))}
              </div>
              <canvas ref={canvasRef} height={220} />
            </div>

            <div className="notice-box" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>السجل</h3>
              <ul className="weight-history-list">
                {[...stats.entries].reverse().map((e) => (
                  <li key={e.id}>
                    <span>{e.date.slice(0, 10)} — {e.weight_kg} kg</span>
                    <button onClick={() => deleteEntry(e.id)}>حذف</button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <div className="notice-box" style={{ marginTop: 24 }}>بعد ما سجلت وزنك 🌱 سجّله فوگ حتى نبدأ نتابع تقدمك.</div>
        )}
      </main>
    </AppShell>
  );
}
