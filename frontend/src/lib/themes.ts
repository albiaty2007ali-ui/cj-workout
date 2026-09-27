/**
 * كتالوج الثيمات (حزمة تطوير الثيمات) — الأسماء لازم تطابق settings.mts's THEMES/PREMIUM_THEMES
 * حرفيًا (backend هو مصدر الحقيقة لصلاحية الاسم والتحقق من Premium)، وindex.html's بوتستراب
 * ما قبل React لتفادي "ومضة" اللون الخاطئ.
 */
export interface ThemeDef {
  id: string;
  label: string;
  /** لون Swatch تمثيلي بسيط للاختيار بالواجهة (مو بالضرورة نفس --bg الدقيق). */
  swatch: string;
}

export const FREE_THEMES: ThemeDef[] = [
  { id: "light", label: "فاتح", swatch: "#faf8f3" },
  { id: "dark", label: "غامق", swatch: "#15140f" },
];

export const PREMIUM_THEMES: ThemeDef[] = [
  { id: "midnight", label: "Midnight", swatch: "#131a2e" },
  { id: "ocean", label: "Ocean", swatch: "#0e2a2d" },
  { id: "emerald", label: "Emerald", swatch: "#10251a" },
  { id: "sunset", label: "Sunset", swatch: "#2b1810" },
  { id: "aurora", label: "Aurora", swatch: "#221232" },
  { id: "carbon", label: "Carbon", swatch: "#1a1a1a" },
];

export const PREMIUM_THEME_IDS = new Set(PREMIUM_THEMES.map((t) => t.id));
export const ALL_THEMES: ThemeDef[] = [...FREE_THEMES, ...PREMIUM_THEMES];
