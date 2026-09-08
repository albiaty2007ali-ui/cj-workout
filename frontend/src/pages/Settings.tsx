import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../lib/api";
import AppShell from "../components/AppShell";

interface SettingsData {
  ai_response_style: string;
  profile_visibility: string;
}

export default function Settings() {
  const navigate = useNavigate();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [savedMsg, setSavedMsg] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    (async () => {
      const [meRes, settingsRes] = await Promise.all([
        api.get<MeResponse>("/me"),
        api.get<SettingsData>("/settings"),
      ]);
      if (!meRes.success || !meRes.data) {
        navigate("/login");
        return;
      }
      setMe(meRes.data);
      if (settingsRes.success && settingsRes.data) setSettings(settingsRes.data);
    })();
  }, [navigate]);

  function flashSaved() {
    setSavedMsg("تم الحفظ ✓");
    setTimeout(() => setSavedMsg(""), 2000);
  }

  async function setAiStyle(style: string) {
    const res = await api.post<{ style: string }>("/settings?action=ai-style", { style });
    if (res.success) {
      setSettings((s) => (s ? { ...s, ai_response_style: style } : s));
      flashSaved();
    }
  }

  async function setVisibility(visibility: string) {
    const res = await api.post<{ visibility: string }>("/settings?action=privacy", { visibility });
    if (res.success) {
      setSettings((s) => (s ? { ...s, profile_visibility: visibility } : s));
      flashSaved();
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError("");
    setPasswordSaving(true);
    try {
      const res = await api.post("/settings?action=password", {
        current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword,
      });
      if (!res.success) {
        setPasswordError(res.error?.message ?? "صار خطأ");
        return;
      }
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      flashSaved();
    } finally {
      setPasswordSaving(false);
    }
  }

  async function exportData() {
    const res = await api.get("/settings?action=export");
    if (!res.success) return;
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cjworkout_data.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    setDeleteError("");
    const res = await api.post("/settings?action=delete-account", { password: deletePassword });
    if (!res.success) {
      setDeleteError(res.error?.message ?? "صار خطأ");
      return;
    }
    navigate("/login");
  }

  if (!me || !settings) return null;

  return (
    <AppShell userName={me.name || "حسابي"} isAdmin={me.role === "admin"}>
      <main className="page-container">
        <h1 className="font-display">⚙️ الإعدادات</h1>
        {savedMsg && <div className="notice-box" style={{ background: "#eaf4ee", borderColor: "#4c7a5e" }}>{savedMsg}</div>}

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>أسلوب ردود الشات</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["concise", "مختصر"], ["balanced", "متوازن"], ["detailed", "مفصّل"]].map(([value, label]) => (
              <button
                key={value}
                className={`btn ${settings.ai_response_style === value ? "btn-moss" : "btn-outline-dark"}`}
                onClick={() => setAiStyle(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>خصوصية البروفايل</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`btn ${settings.profile_visibility === "public" ? "btn-moss" : "btn-outline-dark"}`}
              onClick={() => setVisibility("public")}
            >
              عام
            </button>
            <button
              className={`btn ${settings.profile_visibility === "private" ? "btn-moss" : "btn-outline-dark"}`}
              onClick={() => setVisibility("private")}
            >
              خاص
            </button>
          </div>
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>تغيير كلمة المرور</h3>
          <form onSubmit={changePassword}>
            <div className="field">
              <label>كلمة المرور الحالية</label>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="field">
              <label>كلمة المرور الجديدة</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <div className="field">
              <label>تأكيد كلمة المرور الجديدة</label>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
            </div>
            {passwordError && <p className="field-error">{passwordError}</p>}
            <button className="btn btn-moss" type="submit" disabled={passwordSaving}>{passwordSaving ? "..." : "تغيير كلمة المرور"}</button>
          </form>
        </div>

        <div className="notice-box">
          <h3 style={{ marginTop: 0 }}>بياناتك</h3>
          <button className="btn btn-outline-dark" onClick={exportData}>⬇️ تنزيل نسخة من بياناتي</button>
        </div>

        <div className="notice-box" style={{ borderColor: "#c0392b" }}>
          <h3 style={{ marginTop: 0, color: "#c0392b" }}>منطقة الخطر</h3>
          {!confirmingDelete ? (
            <button className="btn" style={{ background: "#c0392b" }} onClick={() => setConfirmingDelete(true)}>
              حذف الحساب
            </button>
          ) : (
            <form onSubmit={deleteAccount}>
              <p>هذا الإجراء لا يمكن التراجع عنه. اكتب كلمة المرور للتأكيد:</p>
              <div className="field">
                <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} required />
              </div>
              {deleteError && <p className="field-error">{deleteError}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" style={{ background: "#c0392b" }} type="submit">تأكيد الحذف</button>
                <button className="btn btn-outline-dark" type="button" onClick={() => setConfirmingDelete(false)}>إلغاء</button>
              </div>
            </form>
          )}
        </div>
      </main>
    </AppShell>
  );
}
