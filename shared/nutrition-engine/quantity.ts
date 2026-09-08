/**
 * منفذ حرفي من nutrition_ai/quantity.py — يفهم أرقام وكميات باللهجة العراقية (كلمات وأرقام)،
 * مستقل عن أي طعام معيّن. لا يخترع قيمة أبدًا — إذا ما وجد رقم/وحدة صريحة يرجّع null ويترك
 * القرار للمتصل (يسأل المستخدم).
 */
import { normalize } from "./arabicNormalize.js";

export const NUMBER_WORDS: Record<string, number> = {
  "صفر": 0,
  "واحد": 1, "واحدة": 1, "وحدة": 1, "حبة": 1, "حبه": 1,
  "اثنين": 2, "اثنتين": 2, "ثنتين": 2, "زوج": 2, "زوجين": 2,
  "ثلاثة": 3, "ثلاث": 3,
  "اربعة": 4, "أربعة": 4, "اربع": 4, "أربع": 4,
  "خمسة": 5, "خمس": 5,
  "ستة": 6, "ست": 6,
  "سبعة": 7, "سبع": 7,
  "ثمانية": 8, "ثمان": 8, "ثمانى": 8,
  "تسعة": 9, "تسع": 9,
  "عشرة": 10, "عشر": 10,
  "عشرين": 20,
  "مية": 100, "مائة": 100,
};

// وحدات الماي — لا نربطها بغرامات طعام، فقط مليلتر
export const WATER_UNITS_ML: Record<string, number> = {
  "لتر": 1000, "ليتر": 1000,
  "نص لتر": 500, "نصف لتر": 500,
  "ربع لتر": 250,
  "كوب": 240,
  "استكان": 200, "إستكان": 200,
  "مل": 1, "ملل": 1, "ml": 1,
};

// مرتبة من الأطول للأقصر لتفادي تطابق جزئي (مثل "لتر" داخل "نص لتر")
const WATER_UNIT_KEYS = Object.keys(WATER_UNITS_ML).sort((a, b) => b.length - a.length);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** يحاول تفسير كلمة واحدة كرقم. يرجع undefined إذا مو رقم معروف. */
export function parseNumberWord(token: string): number | undefined {
  return NUMBER_WORDS[token];
}

/** يبحث عن أول رقم (خانة أو كلمة) بالنص بالكامل — يُستخدم لحالات مثل "وزني هسه 80". */
export function findLeadingNumber(text: string): number | null {
  const t = normalize(text);
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (m) return parseFloat(m[1]);

  const entries = Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [word, val] of entries) {
    const re = new RegExp(`(?:^|\\s)${escapeRegExp(word)}(?:\\s|$)`);
    if (re.test(t)) return val;
  }
  return null;
}

/**
 * يحاول حسم كمية الماي المذكورة صراحة بالنص.
 * "شربت نص لتر" -> 500 ، "شربت 500 مل" -> 500 ، "شربت كوبين ماي" -> 480
 * يرجع null إذا الكمية غير مذكورة (لا نفترضها أبدًا — نفس فلسفة الأكل).
 */
export function parseWaterMl(text: string): number | null {
  const t = normalize(text);

  for (const unit of WATER_UNIT_KEYS) {
    const idx = t.indexOf(unit);
    if (idx === -1) continue;

    const baseMl = WATER_UNITS_ML[unit];

    if (unit === "مل" || unit === "ملل" || unit === "ml") {
      const m = t.match(/(\d+(?:\.\d+)?)\s*(?:مل|ملل|ml)/);
      if (m) return Math.round(parseFloat(m[1]) * baseMl);
      continue;
    }

    const windowBefore = t.slice(Math.max(0, idx - 15), idx);
    let qty: number | null = null;

    const numMatch = windowBefore.match(/(\d+)\s*$/);
    if (numMatch) {
      qty = parseFloat(numMatch[1]);
    } else {
      for (const [word, val] of Object.entries(NUMBER_WORDS)) {
        const re = new RegExp(`${escapeRegExp(word)}\\s*$`);
        if (re.test(windowBefore)) {
          qty = val;
          break;
        }
      }
    }

    // دعم صيغة "كوبين" الملتصقة (مثنى) كحالة خاصة شائعة
    if (qty === null && unit === "كوب" && t.slice(idx, idx + 5).startsWith("كوبين")) {
      qty = 2;
    }
    if (qty === null && unit === "استكان" && t.slice(idx, idx + 8).startsWith("استكانين")) {
      qty = 2;
    }

    return Math.round(baseMl * (qty ?? 1));
  }

  return null;
}
