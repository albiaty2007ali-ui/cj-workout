import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/I18nContext";
import { useModalTransition } from "../lib/useModalTransition";
import { renderAchievementCard, type AchievementCardData, type AchievementKind, type CardFormat } from "../lib/achievementCard";

interface AchievementShareModalProps {
  initialKind: AchievementKind;
  data: Omit<AchievementCardData, "kind" | "dateLabel">;
  onClose: () => void;
}

/**
 * مودال بطاقة إنجاز قابلة للمشاركة (حزمة الإحالة/Premium) — Canvas بالمتصفح بالكامل (صفر
 * سيرفر صور، راجع achievementCard.ts). صفر XP لمجرد المشاركة (قرار موثَّق بالخطة — اختياري
 * بالطلب الأصلي، وربطه بـXP يعني فئة منح جديدة غير ضرورية).
 */
export default function AchievementShareModal({ initialKind, data, onClose }: AchievementShareModalProps) {
  const { t } = useI18n();
  const { closing, requestClose } = useModalTransition(onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [format, setFormat] = useState<CardFormat>("square");
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => { cardRef.current?.focus(); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dateLabel = new Date().toISOString().slice(0, 10);
    renderAchievementCard(canvas, { ...data, kind: initialKind, dateLabel }, format);
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], "achievement.png", { type: "image/png" });
        setCanShareFiles(Boolean(navigator.canShare?.({ files: [file] })));
      }
    }, "image/png");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, initialKind]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cj-workout-achievement.png";
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function share() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], "cj-workout-achievement.png", { type: "image/png" });
      try {
        await navigator.share({ files: [file], title: "CJ WORKOUT" });
      } catch {
        // المستخدم ألغى نافذة المشاركة — تجاهل بأمان
      }
    }, "image/png");
  }

  return (
    <div className={`modal-overlay${closing ? " closing" : ""}`} onClick={requestClose}>
      <div className="modal-card achievement-share-card" ref={cardRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close-btn" aria-label={t("common.close")} onClick={requestClose}>✕</button>
        <p className="font-display" style={{ fontSize: "1.15rem", fontWeight: 700, marginTop: 0, textAlign: "center" }}>
          {t("achievementShare.title")}
        </p>

        <div className="theme-segmented" style={{ margin: "8px auto 14px", display: "flex", justifyContent: "center" }}>
          <button type="button" className={format === "square" ? "active" : ""} onClick={() => setFormat("square")}>{t("achievementShare.formatSquare")}</button>
          <button type="button" className={format === "story" ? "active" : ""} onClick={() => setFormat("story")}>{t("achievementShare.formatStory")}</button>
        </div>

        <div className="achievement-canvas-wrap">
          <canvas ref={canvasRef} className="achievement-canvas" />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-outline-dark" onClick={download} style={{ flex: 1 }}>{t("achievementShare.download")}</button>
          {canShareFiles && <button type="button" className="btn btn-moss" onClick={share} style={{ flex: 1 }}>{t("achievementShare.share")}</button>}
        </div>
      </div>
    </div>
  );
}
