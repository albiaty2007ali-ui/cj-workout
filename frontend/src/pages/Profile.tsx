import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import type { ProfileResponse, CalendarDay } from "../lib/profileApi";
import AppShell from "../components/AppShell";

const WEEKDAY_LABELS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const STATUS_LABEL: Record<CalendarDay["status"], string> = {
  green: "يوم ممتاز 🟢", yellow: "يوم جزئي 🟡", orange: "سجّلت بس ناقص هدف 🟠", none: "ماكو بيانات ⚪",
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
function daysInMonth(year: number, month1based: number): number {
  return new Date(Date.UTC(year, month1based, 0)).getUTCDate();
}
function firstWeekday(year: number, month1based: number): number {
  return new Date(Date.UTC(year, month1based - 1, 1)).getUTCDay();
}
function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}
const MONTH_LABELS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export default function Profile() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [viewMonth, setViewMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  async function load() {
    const [meRes, profileRes] = await Promise.all([
      api.get<MeResponse>("/me"),
      api.get<ProfileResponse>("/profile"),
    ]);
    if (!meRes.success || !meRes.data) {
      navigate("/login");
      return;
    }
    setMe(meRes.data);
    if (profileRes.success && profileRes.data) {
      setProfile(profileRes.data);
      setName(profileRes.data.name);
      setUsername(profileRes.data.username ?? "");
      setBio(profileRes.data.bio ?? "");
      if (profileRes.data.stats.calendar.length > 0) {
        setViewMonth((prev) => prev ?? monthKey(profileRes.data!.stats.calendar[profileRes.data!.stats.calendar.length - 1].date));
      }
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveEdits(e: FormEvent) {
    e.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      const res = await api.post<{ name: string; username: string | null; bio: string | null }>("/profile", { name, username, bio });
      if (!res.success) {
        setErrors(res.error?.details ?? { _: res.error?.message ?? "صار خطأ" });
        return;
      }
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const calendarByDate = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    profile?.stats.calendar.forEach((d) => map.set(d.date, d));
    return map;
  }, [profile]);

  const earliestMonth = profile && profile.stats.calendar.length > 0 ? monthKey(profile.stats.calendar[0].date) : null;
  const latestMonth = profile && profile.stats.calendar.length > 0 ? monthKey(profile.stats.calendar[profile.stats.calendar.length - 1].date) : null;

  if (!me || !profile) return null;

  const selectedDay = selectedDate ? calendarByDate.get(selectedDate) : null;

  const monthGrid = (() => {
    if (!viewMonth) return null;
    const [y, m] = viewMonth.split("-").map(Number);
    const total = daysInMonth(y, m);
    const offset = firstWeekday(y, m);
    const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => `${viewMonth}-${String(i + 1).padStart(2, "0")}`)];
    return cells;
  })();

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="page-container">
        <h1 className="font-display">👤 البروفايل</h1>

        <div className="notice-box">
          {!editing ? (
            <>
              <p style={{ fontWeight: 700, fontSize: "1.1rem" }}>{profile.name}</p>
              {profile.username && <p style={{ color: "var(--text-muted, var(--text-muted))" }}>@{profile.username}</p>}
              {profile.bio && <p>{profile.bio}</p>}
              <button className="btn btn-outline-dark" onClick={() => setEditing(true)}>تعديل البيانات</button>
            </>
          ) : (
            <form onSubmit={saveEdits}>
              <div className="field">
                <label>الاسم</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
                {errors.name && <p className="field-error">{errors.name}</p>}
              </div>
              <div className="field">
                <label>يوزرنيم (اختياري)</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="حروف إنكليزية وأرقام و_" />
                {errors.username && <p className="field-error">{errors.username}</p>}
              </div>
              <div className="field">
                <label>نبذة (اختياري)</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} rows={3} style={{ width: "100%" }} />
                {errors.bio && <p className="field-error">{errors.bio}</p>}
              </div>
              {errors._ && <p className="field-error">{errors._}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-moss" type="submit" disabled={saving}>{saving ? "..." : "حفظ"}</button>
                <button className="btn btn-outline-dark" type="button" onClick={() => setEditing(false)}>إلغاء</button>
              </div>
            </form>
          )}
        </div>

        <div className="calorie-cards" style={{ marginTop: 16 }}>
          <div className="calorie-card">
            <p className="cc-label">⭐ المستوى</p>
            <p className="cc-value">{profile.progress.level} — {profile.progress.title}</p>
          </div>
          <div className="calorie-card">
            <p className="cc-label">🔥 الستريك</p>
            <p className="cc-value">{profile.streak_days} يوم</p>
          </div>
          <div className="calorie-card">
            <p className="cc-label">🍽️ وجبات مسجّلة</p>
            <p className="cc-value">{profile.stats.meals_logged}</p>
          </div>
          <div className="calorie-card">
            <p className="cc-label">💧 سجلات الماي</p>
            <p className="cc-value">{profile.stats.water_logs}</p>
          </div>
        </div>

        {profile.progress.badge_icon && (
          <div className="level-badge-banner">
            <span className="badge-icon">{profile.progress.badge_icon}</span>
            <div>
              <p className="badge-title">{profile.progress.badge_title}</p>
              <p className="badge-sub">شارة تجميلية وصلتلها بمستوى {profile.progress.level}</p>
            </div>
          </div>
        )}

        {!profile.progress.is_max_level && (
          <div className="notice-box" style={{ marginTop: 16 }}>
            باقيلك <strong>{profile.progress.needed_for_next}</strong> XP للمستوى الجاي
          </div>
        )}

        <div className="notice-box" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>🏅 الإنجازات</h3>
          <div className="achievement-grid">
            <div className="achievement-badge">
              <span className="ab-icon">⭐</span>
              <span className="ab-value">{profile.achievements.level}</span>
              <span className="ab-label">المستوى الحالي</span>
            </div>
            <div className="achievement-badge">
              <span className="ab-icon">🔥</span>
              <span className="ab-value">{profile.achievements.streak_days}</span>
              <span className="ab-label">ستريك حالي</span>
            </div>
            <div className="achievement-badge">
              <span className="ab-icon">🏔️</span>
              <span className="ab-value">{profile.achievements.longest_streak}</span>
              <span className="ab-label">أطول ستريك</span>
            </div>
            <div className="achievement-badge">
              <span className="ab-icon">🍽️</span>
              <span className="ab-value">{profile.achievements.meals_logged}</span>
              <span className="ab-label">وجبات مسجّلة</span>
            </div>
            <div className="achievement-badge">
              <span className="ab-icon">🏆</span>
              <span className="ab-value">{profile.achievements.challenges_completed}</span>
              <span className="ab-label">تحديات مكتملة</span>
            </div>
          </div>
        </div>

        <div className="notice-box" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>📅 تقويم التغذية</h3>
          {viewMonth && monthGrid && (
            <>
              <div className="calendar-nav">
                <button type="button" disabled={!earliestMonth || viewMonth <= earliestMonth} onClick={() => { setViewMonth((v) => v ? shiftMonth(v, -1) : v); setSelectedDate(null); }}>→ الشهر السابق</button>
                <strong>{MONTH_LABELS[Number(viewMonth.split("-")[1]) - 1]} {viewMonth.split("-")[0]}</strong>
                <button type="button" disabled={!latestMonth || viewMonth >= latestMonth} onClick={() => { setViewMonth((v) => v ? shiftMonth(v, 1) : v); setSelectedDate(null); }}>الشهر الجاي ←</button>
              </div>
              <div className="calendar-weekdays">
                {WEEKDAY_LABELS.map((d) => <span key={d}>{d}</span>)}
              </div>
              <div className="calendar-grid">
                {monthGrid.map((date, i) => {
                  if (!date) return <div key={`empty-${i}`} className="calendar-day empty" />;
                  const rec = calendarByDate.get(date);
                  const status = rec?.status ?? "none";
                  return (
                    <button
                      type="button" key={date}
                      className={`calendar-day status-${status}${rec?.is_today ? " is-today" : ""}`}
                      title={date}
                      onClick={() => setSelectedDate(date)}
                    >
                      {Number(date.split("-")[2])}
                    </button>
                  );
                })}
              </div>
              <div className="calendar-legend">
                <span><span className="dot" style={{ background: "var(--moss)" }} />ممتاز</span>
                <span><span className="dot" style={{ background: "var(--gold)" }} />جزئي</span>
                <span><span className="dot" style={{ background: "#c97a3d" }} />ناقص هدف</span>
                <span><span className="dot" style={{ background: "var(--border)" }} />ماكو بيانات</span>
              </div>
              {selectedDate && (
                <div className="calendar-day-detail">
                  <strong>{selectedDate}</strong> — {STATUS_LABEL[selectedDay?.status ?? "none"]}
                  {selectedDay && selectedDay.status !== "none" && (
                    <p style={{ margin: "6px 0 0" }}>
                      🍽️ {selectedDay.meals_logged} وجبة مسجّلة
                      {selectedDay.protein_hit_target && " · ✅ هدف البروتين تحقق"}
                      {selectedDay.water_hit_target && " · ✅ هدف الماي تحقق"}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AppShell>
  );
}
