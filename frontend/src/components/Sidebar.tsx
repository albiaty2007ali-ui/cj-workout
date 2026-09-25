import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n, type TranslationKey } from "../i18n/I18nContext";

interface SidebarProps {
  userName: string;
  isAdmin: boolean;
  photoUrl?: string | null;
  onOpenAssistant?: () => void;
  onOpenConsult?: () => void;
  onOpenTournament?: () => void;
}

interface NavGroup {
  key: string;
  titleKey: TranslationKey;
  items: { to: string; labelKey: TranslationKey }[];
}

const NAV_GROUPS: NavGroup[] = [
  { key: "nutrition", titleKey: "sidebar.groupNutrition", items: [
    { to: "/daily", labelKey: "sidebar.daily" },
    { to: "/recipes", labelKey: "sidebar.recipes" },
  ] },
  { key: "progress", titleKey: "sidebar.groupProgress", items: [
    { to: "/progress/weight", labelKey: "sidebar.weight" },
    { to: "/intelligence", labelKey: "sidebar.intelligence" },
  ] },
];

export default function Sidebar({ userName, isAdmin, photoUrl, onOpenAssistant, onOpenConsult, onOpenTournament }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navigate = useNavigate();
  const { t } = useI18n();

  async function logout() {
    await api.post("/auth/logout");
    navigate("/login");
  }

  function toggleGroup(key: string) {
    setOpenGroup((g) => (g === key ? null : key));
  }

  return (
    <>
      <button className="hamburger" aria-label={t("sidebar.menu")} onClick={() => setOpen(true)}>☰</button>
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}
      <aside className={`app-sidebar ${open ? "open" : ""}`} aria-label={t("sidebar.mainMenu")}>
        <div className="sidebar-top">
          <p className="sidebar-logo">CJ FOOD</p>
          <button className="sidebar-close-btn" aria-label={t("sidebar.closeMenu")} onClick={() => setOpen(false)}>✕</button>
        </div>
        <nav className="sidebar-nav">
          <p className="sidebar-group-title">{t("sidebar.groupHome")}</p>
          <Link className="sidebar-item" to="/chat" onClick={() => setOpen(false)}>{t("sidebar.chat")}</Link>

          {NAV_GROUPS.map((group) => (
            <div key={group.key} className="sidebar-group">
              <button type="button" className="sidebar-group-header" onClick={() => toggleGroup(group.key)}>
                <span>{t(group.titleKey)}</span>
                <span className="sidebar-group-caret">{openGroup === group.key ? "▲" : "▼"}</span>
              </button>
              {openGroup === group.key && (
                <div className="sidebar-group-body">
                  {group.items.map((item) => (
                    <Link key={item.to} className="sidebar-item" to={item.to} onClick={() => setOpen(false)}>{t(item.labelKey)}</Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          {onOpenAssistant && (
            <>
              <p className="sidebar-group-title">{t("sidebar.groupAssistant")}</p>
              <button className="sidebar-item" onClick={() => { onOpenAssistant(); setOpen(false); }}>{t("sidebar.assistantMenuItem")}</button>
              {onOpenTournament && (
                <button className="sidebar-item" onClick={() => { onOpenTournament(); setOpen(false); }}>🏆 عندي بطولة</button>
              )}
            </>
          )}

          {onOpenConsult && (
            <>
              <p className="sidebar-group-title">{t("sidebar.groupHelp")}</p>
              <button className="sidebar-item" onClick={() => { onOpenConsult(); setOpen(false); }}>{t("sidebar.consultItem")}</button>
            </>
          )}

          <Link className="sidebar-item sidebar-item-highlight" to="/subscribe" onClick={() => setOpen(false)}>{t("sidebar.subscribe")}</Link>

          <p className="sidebar-group-title">{t("sidebar.groupSettings")}</p>
          <Link className="sidebar-item" to="/settings" onClick={() => setOpen(false)}>{t("sidebar.settings")}</Link>
          {isAdmin && <Link className="sidebar-item" to="/admin" onClick={() => setOpen(false)}>{t("sidebar.admin")}</Link>}
        </nav>
        <div className="sidebar-bottom">
          <Link className="sidebar-item sidebar-item-profile" to="/profile" onClick={() => setOpen(false)}>
            {photoUrl ? <img src={photoUrl} alt="" className="sidebar-avatar" /> : <span>👤</span>} {userName}
          </Link>
          <button className="sidebar-item" onClick={logout}>{t("sidebar.logout")}</button>
        </div>
      </aside>
    </>
  );
}
