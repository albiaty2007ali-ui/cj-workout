import { PREMIUM_THEMES } from "../lib/themes";
import { useI18n } from "../i18n/I18nContext";

/** معاينة ثيم مميز بدون تفعيله فعليًا — معزولة داخل <div data-theme="X"> خاص بها فقط (الـCSS
 *  vars تتطبّق حصرًا داخل هذا الصندوق عبر الـattribute selector)، صفر خطر تسريب للتطبيق
 *  الحقيقي، صفر setTimeout/مؤقّت رجوع معقّد. */
export default function ThemePreviewModal({ themeId, onUse, onClose }: { themeId: string; onUse: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const theme = PREMIUM_THEMES.find((th) => th.id === themeId);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("common.close")} onClick={onClose}>✕</button>
        <p className="font-display" style={{ fontSize: "1.1rem", fontWeight: 700, marginTop: 0 }}>
          {t("themePreview.title")} {theme?.label}
        </p>

        <div data-theme={themeId} className="theme-preview-box">
          <div className="theme-preview-card">
            <p style={{ margin: "0 0 8px", fontWeight: 700 }}>CJ FOOD</p>
            <div className="theme-preview-bubble">هلا كابتن 👋 شنو آكلت اليوم؟</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button type="button" className="btn btn-moss" disabled>وجبة جديدة</button>
              <button type="button" className="btn btn-outline-dark" disabled>تفاصيل</button>
            </div>
          </div>
        </div>

        <button type="button" className="btn btn-moss" style={{ marginTop: 14 }} onClick={onUse}>
          {t("themePreview.useTheme")}
        </button>
      </div>
    </div>
  );
}
