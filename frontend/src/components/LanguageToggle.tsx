import { useI18n } from "../i18n/I18nContext";

interface LanguageToggleProps {
  /** false بصفحات الدخول/التسجيل (قبل ما يصير عندنا حساب مسجَّل نكتب إله) — يبقى محلي بالمتصفح
   * بس، ويتزامن مع الحساب أول ما يسجّل دخول (Chat.tsx يقرأ language من /api/me). */
  persistToBackend?: boolean;
}

export default function LanguageToggle({ persistToBackend = true }: LanguageToggleProps) {
  const { language, setLanguage, t } = useI18n();

  return (
    <div className="lang-toggle" role="group" aria-label={t("lang.title")}>
      <button
        type="button"
        className={`lang-toggle-btn ${language === "ar" ? "active" : ""}`}
        onClick={() => setLanguage("ar", { persistToBackend })}
      >
        {t("lang.ar")}
      </button>
      <button
        type="button"
        className={`lang-toggle-btn ${language === "en" ? "active" : ""}`}
        onClick={() => setLanguage("en", { persistToBackend })}
      >
        {t("lang.en")}
      </button>
    </div>
  );
}
