/**
 * أكواد الإعلانات الخام (Adsterra حاليًا، قابل لإضافة AdSense لاحقًا بنفس الشكل) — تُقرأ من
 * متغيرات بيئة Vite (VITE_*) وقت البناء، فتصير جزء من حزمة الفرونت إند الثابتة (Netlify Static
 * Site) — لازم تُضاف بلوحة Netlify (Environment variables) قبل البناء، نفس نمط بقية المتغيرات.
 * أي Slot بدون كود = null = AdSlot.tsx ما يعرض شي إطلاقًا (صفر صندوق فاضي أو خطأ).
 */

function envOrNull(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}

export const AD_SLOTS = {
  /** بانر صغير — صفحة الشات (تحت الاقتراحات السريعة) */
  chatBanner: envOrNull(import.meta.env.VITE_AD_CHAT_BANNER),
  /** بانر صغير — أعلى قائمة الوصفات */
  recipesListTop: envOrNull(import.meta.env.VITE_AD_RECIPES_TOP),
  /** بانر صغير — أسفل صفحة "يومي الغذائي" */
  dailyBottom: envOrNull(import.meta.env.VITE_AD_DAILY_BOTTOM),
  /** بانر صغير — أسفل صفحة "متابعة الوزن" */
  weightBottom: envOrNull(import.meta.env.VITE_AD_WEIGHT_BOTTOM),
  /** إعلان كبير (Interstitial/بانر كبير) — يظهر فقط لمن يحاول يفتح صفحة الاشتراك وهو مو مشترك بعد */
  subscribeInterstitial: envOrNull(import.meta.env.VITE_AD_SUBSCRIBE_INTERSTITIAL),
};
