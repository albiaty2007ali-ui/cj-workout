import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";

interface SidebarProps {
  userName: string;
  isAdmin: boolean;
  onQuickPrompt?: (prompt: string) => void;
}

export default function Sidebar({ userName, isAdmin, onQuickPrompt }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  async function logout() {
    await api.post("/auth/logout");
    navigate("/login");
  }

  return (
    <>
      <button className="hamburger" aria-label={t("sidebar.menu")} onClick={() => setOpen(true)}>☰</button>
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
      <aside className={`app-sidebar ${open ? "open" : ""}`} aria-label={t("sidebar.mainMenu")}>
        <div className="sidebar-top">
          <p className="sidebar-logo">CJ WORKOUT</p>
          <button className="sidebar-close-btn" aria-label={t("sidebar.closeMenu")} onClick={() => setOpen(false)}>✕</button>
        </div>
        <nav className="sidebar-nav">
          {onQuickPrompt && (
            <>
              {/* الرسالة المُرسَلة فعليًا للشات تبقى عربي دايمًا بغض النظر عن لغة الواجهة —
                  محرك النية (intents.ts) عراقي-اللهجة فقط حاليًا، ترجمة الشات نفسه مرحلة لاحقة
                  منفصلة كبيرة (تحتاج محرك نية إنكليزي كامل + ردود ثنائية اللغة). */}
              <button className="sidebar-item" onClick={() => { onQuickPrompt("باقيلي شكد سعرات؟"); setOpen(false); }}>{t("sidebar.today")}</button>
              <button className="sidebar-item" onClick={() => { onQuickPrompt("شنو آكل هسه؟"); setOpen(false); }}>{t("sidebar.whatToEat")}</button>
            </>
          )}
          <Link className="sidebar-item" to="/recipes" onClick={() => setOpen(false)}>{t("sidebar.recipes")}</Link>
          <Link className="sidebar-item" to="/daily" onClick={() => setOpen(false)}>{t("sidebar.daily")}</Link>
          <Link className="sidebar-item" to="/progress/weight" onClick={() => setOpen(false)}>{t("sidebar.weight")}</Link>
          <Link className="sidebar-item" to="/intelligence" onClick={() => setOpen(false)}>{t("sidebar.intelligence")}</Link>
          <Link className="sidebar-item" to="/subscribe" onClick={() => setOpen(false)}>{t("sidebar.subscribe")}</Link>
        </nav>
        <div className="sidebar-bottom">
          <Link className="sidebar-item" to="/profile" onClick={() => setOpen(false)}>👤 {userName}</Link>
          <Link className="sidebar-item" to="/settings" onClick={() => setOpen(false)}>{t("sidebar.settings")}</Link>
          {isAdmin && <Link className="sidebar-item" to="/admin" onClick={() => setOpen(false)}>{t("sidebar.admin")}</Link>}
          <button className="sidebar-item" onClick={logout}>{t("sidebar.logout")}</button>
        </div>
      </aside>
    </>
  );
}
