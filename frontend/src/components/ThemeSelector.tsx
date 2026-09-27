import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PREMIUM_THEMES, PREMIUM_THEME_IDS } from "../lib/themes";
import PremiumFeatureModal from "./PremiumFeatureModal";
import ThemePreviewModal from "./ThemePreviewModal";
import { useI18n } from "../i18n/I18nContext";

const STORAGE_KEY = "cj_theme";
type FreeChoice = "light" | "dark" | "system";
const FREE_OPTIONS: Array<[FreeChoice, string]> = [["light", "فاتح"], ["dark", "غامق"], ["system", "تلقائي"]];

function applyLocal(id: string) {
  document.documentElement.setAttribute("data-theme", id);
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
}

function clearLocal() {
  document.documentElement.removeAttribute("data-theme");
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** يستبدل ThemeToggle القديم — يضيف 6 ثيمات Premium فوگ Light/Dark/تلقائي الموجودين (سلوكهم
 *  بلا تغيير). حفظ الثيمات المميزة يمر عبر settings.mts's action=theme (يتحقق backend من
 *  is_premium حقيقيًا، صفر ثقة بالواجهة). */
export default function ThemeSelector({ isPremium, currentTheme }: { isPremium: boolean; currentTheme: string }) {
  const { t } = useI18n();
  const [active, setActive] = useState<string>("system");
  const [showLock, setShowLock] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    if (PREMIUM_THEME_IDS.has(currentTheme) && isPremium) {
      setActive(currentTheme);
      applyLocal(currentTheme);
      return;
    }
    if (PREMIUM_THEME_IDS.has(currentTheme) && !isPremium) {
      // دفاعي: انتهى الاشتراك وثيم مميز قديم لسا محفوظ بالسيرفر — رجوع تلقائي بلا كسر
      clearLocal();
      setActive("system");
      return;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      setActive(saved === "dark" || saved === "light" ? saved : "system");
    } catch {
      setActive("system");
    }
  }, [currentTheme, isPremium]);

  async function selectFree(id: FreeChoice) {
    setActive(id);
    if (id === "system") { clearLocal(); return; }
    applyLocal(id);
    await api.post("/settings?action=theme", { theme: id });
  }

  async function selectPremium(id: string) {
    if (!isPremium) { setShowLock(true); return; }
    setActive(id);
    applyLocal(id);
    const res = await api.post("/settings?action=theme", { theme: id });
    if (!res.success) { clearLocal(); setActive("system"); }
  }

  return (
    <div>
      <div className="theme-segmented">
        {FREE_OPTIONS.map(([value, label]) => (
          <button type="button" key={value} className={active === value ? "active" : ""} onClick={() => selectFree(value)}>
            {label}
          </button>
        ))}
      </div>

      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "14px 0 8px" }}>{t("themes.premiumSectionTitle")}</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {PREMIUM_THEMES.map((theme) => (
          <div key={theme.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              className={`theme-swatch ${active === theme.id ? "theme-swatch-active" : ""}`}
              style={{ background: theme.swatch }}
              onClick={() => selectPremium(theme.id)}
              aria-label={theme.label}
            >
              {!isPremium && <span className="theme-swatch-lock">🔒</span>}
            </button>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{theme.label}</span>
            {!isPremium && (
              <button type="button" className="theme-preview-link" onClick={() => setPreviewId(theme.id)}>
                {t("themes.preview")}
              </button>
            )}
          </div>
        ))}
      </div>

      {showLock && <PremiumFeatureModal featureName={t("themes.premiumSectionTitle")} onClose={() => setShowLock(false)} />}
      {previewId && (
        <ThemePreviewModal
          themeId={previewId}
          onClose={() => setPreviewId(null)}
          onUse={() => { setPreviewId(null); setShowLock(true); }}
        />
      )}
    </div>
  );
}
