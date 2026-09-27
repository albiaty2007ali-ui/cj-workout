import { useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nContext";
import { ASSISTANT_GROUPS, type AssistantAction } from "../lib/assistantActions";
import { useModalTransition } from "../lib/useModalTransition";

/** قائمة "مساعد CJ" — كل Action زر حقيقي (Icon+عنوان+وصف قصير اختياري) يرسل الطلب مباشرة لـ
 * Captain CJ أو ينقل لصفحة موجودة أصلاً (onAction تقرر التنفيذ الدقيق، راجع AppShell.tsx). */
export default function AssistantMenu({ onAction, onClose }: { onAction: (action: AssistantAction) => void; onClose: () => void }) {
  const { t } = useI18n();
  const { closing, requestClose } = useModalTransition(onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => { cardRef.current?.focus(); }, []);

  return (
    <div className={`modal-overlay${closing ? " closing" : ""}`} onClick={requestClose}>
      <div className="modal-card assistant-menu-card" ref={cardRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("assistant.close")} onClick={requestClose}>✕</button>
        <p className="font-display" style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: 0 }}>{t("assistant.title")}</p>
        <p style={{ color: "var(--text-muted)", marginTop: -8 }}>{t("assistant.subtitle")}</p>

        <div className="assistant-menu-body">
          {ASSISTANT_GROUPS.map((group) => (
            <div key={group.key} className="assistant-menu-group">
              <p className="assistant-menu-group-title">{t(group.titleKey)}</p>
              <div className="assistant-menu-actions">
                {group.actions.map((action, i) => (
                  <button
                    type="button" key={i} className="assistant-action-card"
                    onClick={() => { onAction(action); requestClose(); }}
                  >
                    <span className="assistant-action-icon">{action.icon}</span>
                    <span className="assistant-action-text">
                      <span className="assistant-action-label">{action.label}</span>
                      {action.description && <span className="assistant-action-desc">{action.description}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
