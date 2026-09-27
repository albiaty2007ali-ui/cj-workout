import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { MEAL_LABELS } from "../../i18n/translations";

interface DetailResponse {
  profile_info: {
    id: string; name: string; email: string; username: string | null; photo_url: string | null;
    role: string; disabled: boolean; email_verified: boolean;
    ban: { banned: boolean; permanent: boolean; reason: string | null; expires_at: string | null };
  };
  goals: {
    age: number; weight_kg: number; height_cm: number; sex: string; goal: string; activity_level: string;
    bmr: number; tdee: number; calorie_target: number; water_target_ml: number; goal_weight: number | null;
    macros: { protein_g: number; carbs_g: number; fat_g: number } | null;
    mode: "normal" | "tournament"; tournament_deficit_until: string | null;
  } | null;
  progress: {
    xp: number; streak_days: number; longest_streak: number; free_meals_used: number; is_premium: boolean;
    level: { level: number; title: string; badge_icon?: string | null; badge_title?: string | null };
    daily_history: { date: string; calories: number; meal_count: number; adherence_pct: number | null }[];
  };
  today_meals: { id: string; meal_type: string; calories: number; foods: string[]; created_at: string }[];
  subscription: { end_date: string; plan_code: string } | null;
  subscription_history: { id: string; status: string; plan_code: string; end_date: string | null }[];
  feedback: { id: string; type: string; message: string; status: string; created_at: string | null }[];
}

const GOAL_LABELS: Record<string, string> = { lose: "تنشيف", maintain: "محافظة", gain: "تضخيم" };
const FEEDBACK_TYPE_LABELS: Record<string, string> = { bug: "🐞 بلاغ", suggestion: "💡 مقترح", other: "📝 أخرى" };

export default function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calorieInput, setCalorieInput] = useState("");
  const [goalInput, setGoalInput] = useState("maintain");
  const [savingTargets, setSavingTargets] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [grantingDays, setGrantingDays] = useState<number | "lifetime" | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banCustomHours, setBanCustomHours] = useState("");
  const [banBusy, setBanBusy] = useState(false);
  const [banMsg, setBanMsg] = useState("");

  function load() {
    api.get<DetailResponse>(`/admin/users?action=detail&id=${userId}`).then((res) => {
      if (!res.success || !res.data) { setError(res.error?.message ?? "تعذّر تحميل بيانات المستخدم."); return; }
      setData(res.data);
      if (res.data.goals) { setCalorieInput(String(res.data.goals.calorie_target)); setGoalInput(res.data.goals.goal); }
    });
  }
  useEffect(load, [userId]);

  async function saveTargets() {
    const calories = Number(calorieInput);
    if (!(calories > 0)) return;
    setSavingTargets(true);
    setSavedMsg("");
    try {
      const res = await api.post(`/admin/users?action=update-targets&id=${userId}`, { calorie_target: calories, goal: goalInput });
      if (res.success) { setSavedMsg("✓ تم الحفظ"); load(); } else { setSavedMsg(res.error?.message ?? "صار خطأ"); }
    } finally {
      setSavingTargets(false);
    }
  }

  async function grant(days: number | "lifetime") {
    setGrantingDays(days);
    try {
      const body = days === "lifetime" ? { lifetime: true } : { days };
      await api.post(`/admin/users?action=grant-subscription&id=${userId}`, body);
      load();
    } finally {
      setGrantingDays(null);
    }
  }

  async function ban(hours: number | "permanent") {
    if (!banReason.trim()) { setBanMsg("لازم تكتب سبب الحظر أول."); return; }
    setBanBusy(true);
    setBanMsg("");
    try {
      const body = hours === "permanent" ? { type: "permanent", reason: banReason.trim() } : { type: "temporary", duration_hours: hours, reason: banReason.trim() };
      const res = await api.post(`/admin/users?action=ban&id=${userId}`, body);
      if (res.success) { setBanMsg("✓ تم الحظر"); setBanReason(""); load(); } else { setBanMsg(res.error?.message ?? "صار خطأ"); }
    } finally {
      setBanBusy(false);
    }
  }

  async function unban() {
    setBanBusy(true);
    setBanMsg("");
    try {
      const res = await api.post(`/admin/users?action=unban&id=${userId}`, {});
      if (res.success) { setBanMsg("✓ أُلغي الحظر"); load(); } else { setBanMsg(res.error?.message ?? "صار خطأ"); }
    } finally {
      setBanBusy(false);
    }
  }

  function exportReport() {
    if (!data) return;
    const { profile_info: p, goals: g, progress } = data;
    const todayHist = progress.daily_history[progress.daily_history.length - 1];
    const lines = [
      `📋 تقرير متابعة — ${p.name || p.email}`,
      `📧 ${p.email}`,
      g ? `🎯 الهدف: ${GOAL_LABELS[g.goal] ?? g.goal} — ${g.calorie_target} سعرة/يوم` : "🎯 ماكو بروفايل غذائي بعد",
      g?.macros ? `🥗 بروتين ${g.macros.protein_g}غ · كارب ${g.macros.carbs_g}غ · دهون ${g.macros.fat_g}غ` : "",
      todayHist ? `📊 التزام اليوم: ${todayHist.adherence_pct ?? "—"}% (${todayHist.calories} سعرة)` : "",
      `🔥 Streak: ${progress.streak_days} يوم (أطول: ${progress.longest_streak})`,
      `⭐ المستوى ${progress.level.level} — ${progress.level.title} (${progress.xp} XP)`,
      progress.is_premium ? "💎 مشترك حاليًا" : "🆓 حساب مجاني",
    ].filter(Boolean);
    const text = lines.join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label="إغلاق" onClick={onClose}>✕</button>

        {error && <p className="field-error">{error}</p>}
        {!data && !error && <p style={{ color: "var(--text-muted)" }}>...</p>}

        {data && (
          <>
            <p className="font-display" style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: 0 }}>
              {data.profile_info.name || "(بدون اسم)"}
              {!data.profile_info.email_verified && <span className="admin-badge admin-badge-unverified" style={{ marginInlineStart: 8 }}>بريد غير مؤكَّد</span>}
              {data.goals?.mode === "tournament" && <span className="admin-badge admin-badge-tournament" style={{ marginInlineStart: 8 }}>🏆 بطولة</span>}
              {data.progress.is_premium && <span className="admin-badge admin-badge-paid" style={{ marginInlineStart: 8 }}>💎 مشترك</span>}
              {data.profile_info.ban.banned && (
                <span className="admin-badge admin-badge-banned" style={{ marginInlineStart: 8 }}>
                  🚫 {data.profile_info.ban.permanent ? "محظور دائمًا" : "محظور مؤقتًا"}
                </span>
              )}
            </p>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: -8 }}>{data.profile_info.email}</p>

            {/* 1. البيانات الشخصية والأهداف */}
            <div className="admin-detail-section">
              <h3>👤 البيانات والأهداف</h3>
              {data.goals ? (
                <div className="admin-detail-grid">
                  <div className="admin-detail-item"><span className="label">العمر</span><span className="value">{data.goals.age}</span></div>
                  <div className="admin-detail-item"><span className="label">الوزن</span><span className="value">{data.goals.weight_kg} كغم</span></div>
                  <div className="admin-detail-item"><span className="label">الطول</span><span className="value">{data.goals.height_cm} سم</span></div>
                  <div className="admin-detail-item"><span className="label">الهدف</span><span className="value">{GOAL_LABELS[data.goals.goal] ?? data.goals.goal}</span></div>
                  <div className="admin-detail-item"><span className="label">BMR / TDEE</span><span className="value">{Math.round(data.goals.bmr)} / {Math.round(data.goals.tdee)}</span></div>
                  <div className="admin-detail-item"><span className="label">هدف الوزن</span><span className="value">{data.goals.goal_weight ?? "—"}</span></div>
                  <div className="admin-detail-item"><span className="label">هدف الماي</span><span className="value">{data.goals.water_target_ml} مل</span></div>
                  <div className="admin-detail-item"><span className="label">الماكروز</span><span className="value">{data.goals.macros ? `${data.goals.macros.protein_g}/${data.goals.macros.carbs_g}/${data.goals.macros.fat_g}` : "—"}</span></div>
                </div>
              ) : <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>المستخدم ماكمّل بعد إعداد البروفايل الغذائي (Onboarding).</p>}

              {data.goals && (
                <div className="admin-form-row" style={{ marginTop: 12, alignItems: "center" }}>
                  <input type="number" value={calorieInput} onChange={(e) => setCalorieInput(e.target.value)} style={{ width: 110 }} placeholder="سعرات الهدف" />
                  <select value={goalInput} onChange={(e) => setGoalInput(e.target.value)}>
                    <option value="lose">تنشيف</option>
                    <option value="maintain">محافظة</option>
                    <option value="gain">تضخيم</option>
                  </select>
                  <button type="button" className="btn btn-moss" disabled={savingTargets} onClick={saveTargets}>
                    {savingTargets ? "..." : "حفظ الهدف"}
                  </button>
                  {savedMsg && <span style={{ fontSize: "0.8rem", color: "var(--moss)" }}>{savedMsg}</span>}
                </div>
              )}
            </div>

            {/* 2. سجل الأكل — اليوم + 7 أيام */}
            <div className="admin-detail-section">
              <h3>🍽️ سجل الأكل (اليوم + آخر 7 أيام)</h3>
              {data.today_meals.length > 0 ? (
                <ul style={{ margin: "0 0 10px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                  {data.today_meals.map((m) => (
                    <li key={m.id} style={{ fontSize: "0.85rem", display: "flex", justifyContent: "space-between" }}>
                      <span>{MEAL_LABELS[m.meal_type as keyof typeof MEAL_LABELS] ?? m.meal_type} — {m.foods.join("، ") || "—"}</span>
                      <span style={{ color: "var(--text-muted)" }}>{m.calories} سعرة</span>
                    </li>
                  ))}
                </ul>
              ) : <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>ماكو وجبات مسجَّلة اليوم.</p>}

              {data.goals && data.goals.calorie_target > 0 && data.progress.daily_history.map((d) => (
                <div className="admin-day-bar-row" key={d.date}>
                  <span style={{ width: 74, flexShrink: 0 }}>{d.date.slice(5)}</span>
                  <div className="admin-day-bar-track">
                    <div className="admin-day-bar-fill" style={{
                      width: `${Math.min(100, d.adherence_pct ?? 0)}%`,
                      background: (d.adherence_pct ?? 0) > 110 ? "var(--status-orange)" : "var(--moss)",
                    }} />
                  </div>
                  <span style={{ width: 60, flexShrink: 0, textAlign: "left" }}>{d.adherence_pct ?? "—"}%</span>
                </div>
              ))}
            </div>

            {/* 3. التقدم والالتزام */}
            <div className="admin-detail-section">
              <h3>📈 التقدم والالتزام</h3>
              <div className="admin-detail-grid">
                <div className="admin-detail-item"><span className="label">Streak</span><span className="value">{data.progress.streak_days} 🔥 (أطول {data.progress.longest_streak})</span></div>
                <div className="admin-detail-item"><span className="label">المستوى</span><span className="value">{data.progress.level.level} — {data.progress.level.title}</span></div>
                <div className="admin-detail-item"><span className="label">XP</span><span className="value">{data.progress.xp}</span></div>
                <div className="admin-detail-item"><span className="label">وجبات مجانية مستخدَمة</span><span className="value">{data.progress.free_meals_used}</span></div>
              </div>
            </div>

            {/* أدوات الاشتراك */}
            <div className="admin-detail-section">
              <h3>💎 الاشتراك</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {data.subscription ? `فعّال حتى ${new Date(data.subscription.end_date).toLocaleDateString("ar-IQ")} (${data.subscription.plan_code})` : "ماكو اشتراك فعّال حاليًا."}
              </p>
              <div className="admin-list-actions" style={{ marginTop: 0 }}>
                <button className="btn btn-outline-dark" disabled={grantingDays !== null} onClick={() => grant(30)}>{grantingDays === 30 ? "..." : "+ شهر"}</button>
                <button className="btn btn-outline-dark" disabled={grantingDays !== null} onClick={() => grant(90)}>{grantingDays === 90 ? "..." : "+ 3 أشهر"}</button>
                <button className="btn btn-moss" disabled={grantingDays !== null} onClick={() => grant("lifetime")}>{grantingDays === "lifetime" ? "..." : "♾️ اشتراك مدى الحياة"}</button>
              </div>
            </div>

            {/* إدارة الحظر */}
            <div className="admin-detail-section">
              <h3>🔨 إدارة الحظر</h3>
              {data.profile_info.ban.banned ? (
                <>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    {data.profile_info.ban.permanent ? "محظور دائمًا" : `محظور حتى ${data.profile_info.ban.expires_at ? new Date(data.profile_info.ban.expires_at).toLocaleString("ar-IQ") : "—"}`}
                    {data.profile_info.ban.reason ? ` — السبب: ${data.profile_info.ban.reason}` : ""}
                  </p>
                  <button type="button" className="btn btn-moss" disabled={banBusy} onClick={unban}>
                    {banBusy ? "..." : "✓ إلغاء الحظر"}
                  </button>
                </>
              ) : (
                <>
                  <input
                    value={banReason} onChange={(e) => setBanReason(e.target.value)}
                    placeholder="سبب الحظر (مطلوب)" style={{ width: "100%", marginBottom: 8 }}
                  />
                  <div className="admin-list-actions" style={{ marginTop: 0, flexWrap: "wrap" }}>
                    <button className="btn btn-outline-dark" disabled={banBusy} onClick={() => ban(1)}>ساعة</button>
                    <button className="btn btn-outline-dark" disabled={banBusy} onClick={() => ban(6)}>6 ساعات</button>
                    <button className="btn btn-outline-dark" disabled={banBusy} onClick={() => ban(24)}>يوم</button>
                    <button className="btn btn-outline-dark" disabled={banBusy} onClick={() => ban(72)}>3 أيام</button>
                    <button className="btn btn-outline-dark" disabled={banBusy} onClick={() => ban(168)}>7 أيام</button>
                    <button className="btn btn-outline-dark" disabled={banBusy} onClick={() => ban(720)}>30 يوم</button>
                    <button className="btn" style={{ background: "var(--danger)", color: "#fff" }} disabled={banBusy} onClick={() => ban("permanent")}>
                      🚫 حظر دائم
                    </button>
                  </div>
                  <div className="admin-form-row" style={{ marginTop: 8, alignItems: "center" }}>
                    <input
                      type="number" value={banCustomHours} onChange={(e) => setBanCustomHours(e.target.value)}
                      placeholder="مدة مخصّصة (ساعات)" style={{ width: 150 }}
                    />
                    <button
                      className="btn btn-outline-dark" disabled={banBusy || !(Number(banCustomHours) > 0)}
                      onClick={() => ban(Number(banCustomHours))}
                    >
                      حظر لهذي المدة
                    </button>
                  </div>
                </>
              )}
              {banMsg && <p style={{ fontSize: "0.8rem", color: "var(--moss)", marginTop: 6 }}>{banMsg}</p>}
            </div>

            {/* 4. سجل الملاحظات/البلاغات */}
            <div className="admin-detail-section">
              <h3>📝 الملاحظات والبلاغات</h3>
              {data.feedback.length > 0 ? data.feedback.map((f) => (
                <div className="admin-feedback-mini" key={f.id}>
                  <strong>{FEEDBACK_TYPE_LABELS[f.type] ?? f.type}</strong> — {f.message}
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
                    {f.created_at ? new Date(f.created_at).toLocaleString("ar-IQ") : ""} {f.status === "reviewed" ? "· تمت المراجعة ✓" : ""}
                  </div>
                </div>
              )) : <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>ماكو ملاحظات من هذا المستخدم.</p>}
            </div>

            <div className="admin-detail-section">
              <button type="button" className="btn btn-moss" onClick={exportReport}>📲 تصدير تقرير متابعة (واتساب)</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
