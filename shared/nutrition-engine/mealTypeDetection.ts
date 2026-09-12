/**
 * استُخرِجت من orchestrator.ts — نوع الوجبة (فطور/غداء/عشاء/سناك) من كلمات صريحة بالرسالة، وإلا
 * حسب الفترة الحالية ببغداد. مشتركة بين orchestrator.ts (تسجيل الوجبات) وconversation/tools.ts
 * (calculate_allowed_portion تحت وضع ACTIVE) — صفر تكرار منطق.
 */
import { getCurrentPeriod, relevantMealForPeriod } from "./iraqTime.js";

export const MEAL_KEYWORDS: Record<string, string[]> = {
  breakfast: ["فطرت", "فطور", "فطرة", "فطرنا"],
  // ملاحظة: عمدًا ما ضفنا "غدا" (بدون همزة) هنا رغم كونها إملاء عامي شائع لـ"غداء" — نفس الكلمة
  // حرفيًا تعني "غدًا/بكرة" بالفصحى، وإضافتها substring-match بلا سياق كانت تخلق التباس حقيقي
  // (مثلاً أي رسالة فيها "غدا" بمعنى tomorrow تنحسب صدفة لمسة "غداء"). "عشا" ماله هالتصادم.
  lunch: ["تغديت", "تغدينا", "غداء", "غدانا", "غدينا"],
  // "عشا" (بدون همزة، نفس السبب) — اكتُشفت ناقصة أثناء تصليح شكوى مستخدم حقيقية ("عشا؟" ما كانت تنطابق).
  dinner: ["عشيت", "عشينا", "عشاء", "عشا", "تعشيت"],
  snack: ["سناك", "سنك", "وجبة خفيفة"],
};

export function explicitMealTypeKeyword(text: string): string | null {
  for (const [mealType, keywords] of Object.entries(MEAL_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) return mealType;
  }
  return null;
}

export function findMealType(text: string, now: Date): string {
  const explicit = explicitMealTypeKeyword(text);
  if (explicit) return explicit;
  return relevantMealForPeriod(getCurrentPeriod(now));
}
