import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useI18n, type TranslationKey } from "../i18n/I18nContext";
import { FEATURE_INTROS, isFeatureSeen, type FeatureIntroDef } from "../lib/featureIntros";

interface SidebarProps {
  userName: string;
  isAdmin: boolean;
  photoUrl?: string | null;
  /** حالة Feature Discovery (راجع AppShell.tsx) — تحدّد أي زر يحمل نقطة 🔴. اختيارية حتى Sidebar
   * يبقى قابل للاستخدام بدونها (تختفي كل النقاط، صفر كسر). */
  seenFeatures?: Record<string, number>;
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

export default function Sidebar({ userName, isAdmin, photoUrl, seenFeatures, onOpenAssistant, onOpenConsult, onOpenTournament }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const activeGroupKey = NAV_GROUPS.find((g) => g.items.some((i) => i.to === location.pathname))?.key ?? null;
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupKey);
  const navigate = useNavigate();
  const { t } = useI18n();
  const isActive = (to: string) => location.pathname === to;

  /** نقطة تنبيه ذكية (Feature Discovery) — true فقط لو أكو تعريف ميزة مطابق (route أو trigger)
   * وغير مُشاهَد بعد بالإصدار الحالي. seenFeatures غير محمّلة بعد (undefined) = صفر نقاط مؤقتًا
   * بدل ومضة خاطئة، تظهر فور وصول /api/me الحقيقي. */
  function needsDot(match: Pick<FeatureIntroDef, "route" | "trigger">): boolean {
    if (!seenFeatures) return false;
    const def = FEATURE_INTROS.find((d) => (match.route ? d.route === match.route : d.trigger === match.trigger));
    return def ? !isFeatureSeen(seenFeatures, def) : false;
  }

  const Dot = () => <span className="feature-dot" aria-hidden="true" />;

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
          <Link className={`sidebar-item ${isActive("/chat") ? "active" : ""}`} to="/chat" onClick={() => setOpen(false)}>{t("sidebar.chat")}</Link>

          {NAV_GROUPS.map((group) => (
            <div key={group.key} className="sidebar-group">
              <button type="button" className="sidebar-group-header" onClick={() => toggleGroup(group.key)}>
                <span>{t(group.titleKey)}</span>
                <span className="sidebar-group-caret">{openGroup === group.key ? "▲" : "▼"}</span>
              </button>
              {openGroup === group.key && (
                <div className="sidebar-group-body">
                  {group.items.map((item) => (
                    <Link key={item.to} className={`sidebar-item ${isActive(item.to) ? "active" : ""}`} to={item.to} onClick={() => setOpen(false)}>
                      {t(item.labelKey)}
                      {needsDot({ route: item.to }) && <Dot />}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          {onOpenAssistant && (
            <>
              <p className="sidebar-group-title">{t("sidebar.groupAssistant")}</p>
              <button className="sidebar-item" onClick={() => { onOpenAssistant(); setOpen(false); }}>
                {t("sidebar.assistantMenuItem")}
                {needsDot({ trigger: "assistant" }) && <Dot />}
              </button>
              {onOpenTournament && (
                <button className="sidebar-item" onClick={() => { onOpenTournament(); setOpen(false); }}>
                  🏆 عندي بطولة
                  {needsDot({ trigger: "tournament" }) && <Dot />}
                </button>
              )}
            </>
          )}

          {onOpenConsult && (
            <>
              <p className="sidebar-group-title">{t("sidebar.groupHelp")}</p>
              <button className="sidebar-item" onClick={() => { onOpenConsult(); setOpen(false); }}>
                {t("sidebar.consultItem")}
                {needsDot({ trigger: "consult" }) && <Dot />}
              </button>
            </>
          )}

          <Link className={`sidebar-item sidebar-item-highlight ${isActive("/subscribe") ? "active" : ""}`} to="/subscribe" onClick={() => setOpen(false)}>
            {t("sidebar.subscribe")}
            {needsDot({ route: "/subscribe" }) && <Dot />}
          </Link>

          <p className="sidebar-group-title">{t("sidebar.groupSettings")}</p>
          <Link className={`sidebar-item ${isActive("/settings") ? "active" : ""}`} to="/settings" onClick={() => setOpen(false)}>{t("sidebar.settings")}</Link>
          {isAdmin && <Link className={`sidebar-item ${isActive("/admin") ? "active" : ""}`} to="/admin" onClick={() => setOpen(false)}>{t("sidebar.admin")}</Link>}
        </nav>
        <div className="sidebar-bottom">
          <Link className={`sidebar-item sidebar-item-profile ${isActive("/profile") ? "active" : ""}`} to="/profile" onClick={() => setOpen(false)}>
            {photoUrl ? <img src={photoUrl} alt="" className="sidebar-avatar" /> : <span>👤</span>} {userName}
            {needsDot({ route: "/profile" }) && <Dot />}
          </Link>
          <button className="sidebar-item" onClick={logout}>{t("sidebar.logout")}</button>
        </div>
      </aside>
    </>
  );
}
