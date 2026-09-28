import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useModalTransition } from "../lib/useModalTransition";
import { FEATURE_INTROS, type FeatureIntroDef } from "../lib/featureIntros";
import FeatureIntroModal from "./FeatureIntroModal";

/**
 * Settings → "شرح ميزات التطبيق" — يعيد عرض أي مودال Feature Intro يدويًا بدون أي تأثير على
 * seen_features (onClose هنا مجرد إغلاق محلي، مو استدعاء markSeen — ذاك موجود فقط بـ
 * AppShell.closeFeatureIntro لمسار العرض التلقائي الحقيقي). راجع القيد الصريح: "هذا الخيار فقط
 * يسمح بإعادة المشاهدة يدويًا، لا يجعل الرسائل تظهر تلقائيًا مرة ثانية".
 */
export default function FeatureIntroReplayModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { closing, requestClose } = useModalTransition(onClose);
  const [previewing, setPreviewing] = useState<FeatureIntroDef | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cardRef.current?.focus(); }, []);

  if (previewing) {
    return <FeatureIntroModal def={previewing} onClose={() => setPreviewing(null)} />;
  }

  return (
    <div className={`modal-overlay${closing ? " closing" : ""}`} onClick={requestClose}>
      <div className="modal-card" ref={cardRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("featureIntro.replayClose")} onClick={requestClose}>✕</button>
        <p className="font-display" style={{ fontSize: "1.15rem", fontWeight: 700, marginTop: 0 }}>
          {t("featureIntro.replaySectionTitle")}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "0.88rem" }}>{t("featureIntro.replaySectionDesc")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
          {FEATURE_INTROS.map((def) => (
            <div key={def.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--surface)", borderRadius: "var(--radius-sm)" }}>
              <span>{def.icon} {t(def.titleKey)}</span>
              <button type="button" className="btn btn-outline-dark" onClick={() => setPreviewing(def)}>{t("featureIntro.replayButton")}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
