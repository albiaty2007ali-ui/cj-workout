/**
 * منسّق مودالات بسيط (حزمة تطوير الإشعارات) — يمنع تراكب أكثر من مودال بنفس اللحظة (قسم 6 من
 * الطلب: "لا يظهر عدة Modals وراء بعض"). بدل تسجيل يدوي بكل مكوّن مودال (ConsultModal/
 * AssistantMenu/PremiumFeatureModal/...)، يفحص DOM مباشرة عن `.modal-overlay` — كل مودال
 * بالمشروع يستخدم هذا الصنف حصرًا (نفس اتفاقية styles.css)، فهذا فحص موثوق بلا حاجة لتعديل أي
 * مكوّن مودال موجود أو جديد.
 */
export function isAnyModalOpen(): boolean {
  return document.querySelector(".modal-overlay") !== null;
}
