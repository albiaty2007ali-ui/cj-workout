import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import type { ProfileResponse } from "../lib/profileApi";
import AppShell from "../components/AppShell";

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

  if (!me || !profile) return null;

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

        {!profile.progress.is_max_level && (
          <div className="notice-box" style={{ marginTop: 16 }}>
            باقيلك <strong>{profile.progress.needed_for_next}</strong> XP للمستوى الجاي
          </div>
        )}

        <div className="notice-box" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>آخر 30 يوم</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 6 }}>
            {profile.stats.calendar.map((day) => (
              <div
                key={day.date}
                title={day.date}
                style={{
                  aspectRatio: "1", borderRadius: 6,
                  background: day.active ? "var(--moss, var(--moss))" : "var(--border)",
                  border: day.is_today ? "2px solid var(--heading)" : "none",
                }}
              />
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
