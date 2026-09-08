import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

interface SidebarProps {
  userName: string;
  isAdmin: boolean;
  onQuickPrompt?: (prompt: string) => void;
}

export default function Sidebar({ userName, isAdmin, onQuickPrompt }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  async function logout() {
    await api.post("/auth/logout");
    navigate("/login");
  }

  return (
    <>
      <button className="hamburger" aria-label="القائمة" onClick={() => setOpen(true)}>☰</button>
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
      <aside className={`app-sidebar ${open ? "open" : ""}`} aria-label="القائمة الرئيسية">
        <div className="sidebar-top">
          <p className="sidebar-logo">CJ WORKOUT</p>
          <button className="sidebar-close-btn" aria-label="إغلاق القائمة" onClick={() => setOpen(false)}>✕</button>
        </div>
        <nav className="sidebar-nav">
          {onQuickPrompt && (
            <>
              <button className="sidebar-item" onClick={() => { onQuickPrompt("باقيلي شكد سعرات؟"); setOpen(false); }}>🔥 اليوم</button>
              <button className="sidebar-item" onClick={() => { onQuickPrompt("شنو آكل هسه؟"); setOpen(false); }}>🍽️ شنو آكل</button>
            </>
          )}
          <Link className="sidebar-item" to="/recipes" onClick={() => setOpen(false)}>🍳 وصفات دايت</Link>
          <Link className="sidebar-item" to="/daily" onClick={() => setOpen(false)}>🍽️ يومي الغذائي</Link>
          <Link className="sidebar-item" to="/progress/weight" onClick={() => setOpen(false)}>⚖️ متابعة الوزن</Link>
          <Link className="sidebar-item" to="/subscribe" onClick={() => setOpen(false)}>💎 الاشتراك</Link>
        </nav>
        <div className="sidebar-bottom">
          <Link className="sidebar-item" to="/profile" onClick={() => setOpen(false)}>👤 {userName}</Link>
          <Link className="sidebar-item" to="/settings" onClick={() => setOpen(false)}>⚙️ الإعدادات</Link>
          {isAdmin && <Link className="sidebar-item" to="/admin" onClick={() => setOpen(false)}>🛠️ لوحة الإدارة</Link>}
          <button className="sidebar-item" onClick={logout}>🚪 تسجيل الخروج</button>
        </div>
      </aside>
    </>
  );
}
