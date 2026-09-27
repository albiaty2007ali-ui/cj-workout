import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/I18nContext";
import { useModalTransition } from "../lib/useModalTransition";

/** مودال عام قابل لإعادة الاستخدام لأي ميزة محجوبة عن غير المشتركين — الـbackend هو خط الدفاع
 *  الحقيقي دائمًا (كل ميزة تستخدمه ترفض الطلب بـ402/403 بنفسها أيضًا)، هذا فقط شرح واضح +
 *  تحويل لصفحة الاشتراك بدل رسالة خطأ عامة مربكة. */
export default function PremiumFeatureModal({ featureName, onClose }: { featureName: string; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { closing, requestClose } = useModalTransition(onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cardRef.current?.focus(); }, []);

  return (
    <div className={`modal-overlay${closing ? " closing" : ""}`} onClick={requestClose}>
      <div className="modal-card" ref={cardRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("common.close")} onClick={requestClose}>✕</button>
        <p className="font-display" style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: 0 }}>
          ✨ {t("premiumLock.title")}
        </p>
        <p style={{ color: "var(--text-muted)" }}>{t("premiumLock.descriptionPrefix")} {featureName} {t("premiumLock.descriptionSuffix")}</p>
        <button type="button" className="btn btn-moss" style={{ marginTop: 12 }} onClick={() => navigate("/subscribe")}>
          {t("premiumLock.subscribeNow")}
        </button>
      </div>
    </div>
  );
}
