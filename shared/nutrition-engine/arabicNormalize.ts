/**
 * منفذ حرفي من arabic_normalize.py (Python) — نفس السلوك بالضبط، بدون أي تعديل بالمنطق.
 * تطبيع النص العربي لتحسين مطابقة أسماء الأكل: يوحّد أشكال الألف، يزيل التشكيل والتطويل،
 * وينظّف المسافات فقط — لا يربط كلمات مختلفة عشوائيًا.
 */

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = "ـ";

const ALEF_FORMS: Record<string, string> = {
  "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
  "ى": "ي", // ألف مقصورة -> ياء (شائع بالكتابة العراقية)
};

function translateAlef(text: string): string {
  let out = "";
  for (const ch of text) {
    out += ALEF_FORMS[ch] ?? ch;
  }
  return out;
}

export function normalize(text: string | null | undefined): string {
  if (!text) return "";
  let t = text.trim();
  t = t.replace(DIACRITICS, "");
  t = t.split(TATWEEL).join("");
  t = translateAlef(t);
  t = t.replace(/\s+/g, " ");
  return t.trim();
}
