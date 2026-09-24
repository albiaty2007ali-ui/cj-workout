import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../i18n/I18nContext";

interface ConsultInfo {
  whatsapp_link: string;
}

/** مودال "استشارة مختص" — منقول من مودال WhatsApp الثابت بـtemplates/chat.html القديم، لأول
 * مرة بواجهة React. يجلب الرابط من /consult (SUPPORT_WHATSAPP_NUMBER)، صفر منطق سعرات/تشخيص. */
export default function ConsultModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<ConsultInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get<ConsultInfo>("/consult").then((res) => {
      if (res.success && res.data) setInfo(res.data);
      setLoaded(true);
    });
  }, []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("common.close")} onClick={onClose}>✕</button>
        <p className="font-display" style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: 0 }}>
          {t("consult.title")}
        </p>
        <p style={{ color: "var(--text-muted)" }}>{t("consult.description")}</p>
        {!loaded && <p style={{ color: "var(--text-muted)" }}>{t("common.loading")}</p>}
        {loaded && info?.whatsapp_link && (
          <a href={info.whatsapp_link} target="_blank" rel="noopener noreferrer" className="btn btn-moss" style={{ marginTop: 12, display: "inline-block" }}>
            📲 {t("consult.whatsappButton")}
          </a>
        )}
        {loaded && !info?.whatsapp_link && <p className="field-error">{t("consult.unavailable")}</p>}
      </div>
    </div>
  );
}
