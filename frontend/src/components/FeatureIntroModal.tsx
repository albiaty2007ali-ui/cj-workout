import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useModalTransition } from "../lib/useModalTransition";
import type { FeatureIntroDef } from "../lib/featureIntros";

/**
 * مودال واحد قابل لإعادة الاستخدام لكل تعريفات FEATURE_INTROS (حزمة Feature Discovery) — المحتوى
 * كله configuration (راجع featureIntros.ts)، صفر مكوّن منفصل لكل ميزة. نفس نظام الحركة/التصميم
 * الموحّد لبقية المودالات (.modal-overlay/.modal-card + useModalTransition)، صفر CSS جديد.
 */
export default function FeatureIntroModal({ def, onClose }: { def: FeatureIntroDef; onClose: () => void }) {
  const { t } = useI18n();
  const { closing, requestClose } = useModalTransition(onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cardRef.current?.focus(); }, []);

  return (
    <div className={`modal-overlay${closing ? " closing" : ""}`} onClick={requestClose}>
      <div className="modal-card feature-intro-card" ref={cardRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("common.close")} onClick={requestClose}>✕</button>
        <p className="feature-intro-icon" aria-hidden="true">{def.icon}</p>
        <p className="font-display" style={{ fontSize: "1.15rem", fontWeight: 700, margin: "4px 0 10px", textAlign: "center" }}>
          {t(def.titleKey)}
        </p>
        <p style={{ color: "var(--text-muted)", textAlign: "center" }}>{t(def.bodyKey)}</p>
        {def.extraBodyKey && (
          <p style={{ color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>{t(def.extraBodyKey)}</p>
        )}
        <button type="button" className="btn btn-moss" style={{ marginTop: 14, width: "100%" }} onClick={requestClose}>
          {t("featureIntro.understood")}
        </button>
      </div>
    </div>
  );
}
