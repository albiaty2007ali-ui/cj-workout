import { useCallback, useState } from "react";

/**
 * خروج ناعم للمودالات (حزمة تحسين UI/UX) — الدخول متحرّك تلقائيًا بـCSS فقط (@keyframes على
 * .modal-overlay/.modal-card، صفر JS)، لكن الخروج يحتاج تأخير الـunmount الفعلي حتى تلعب حركة
 * الخروج (React يشيل العنصر فورًا لو اعتمدنا على conditional rendering وحده). هذا الخطّاف
 * يوفّر نمط صغير موحّد لإعادة الاستخدام بكل الـ11 مودال بدل تكرار نفس الـuseState/setTimeout
 * بكل ملف — يبقى الوقت مطابقًا لمدة حركة CSS (`--motion-base` = 180ms) حتى لا ينقطع الـunmount
 * حركة لسا شغّالة.
 */
export function useModalTransition(onClose: () => void, durationMs = 180) {
  const [closing, setClosing] = useState(false);

  const requestClose = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, durationMs);
  }, [onClose, durationMs]);

  return { closing, requestClose };
}
