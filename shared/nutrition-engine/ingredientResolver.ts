/**
 * محرك حل مكوّن الوصفة إلى food_id حقيقي — يعيد استخدام نفس محرك Alias الحقيقي المستخدم أصلاً
 * لتسجيل الوجبات بالشات (foodSearch.ts's food_aliases/foods.normalized_name + fuzzy.ts's
 * Ratcliff/Obershelp). صفر alias جديد يُخترع هنا، صفر قائمة مرادفات عشوائية بالكود — القراءة
 * فقط من الجدول الحقيقي بـfoods.sqlite.
 *
 * غير تفاعلي عمدًا (يشتغل وقت الاستيراد/الـBackfill، مو وسط محادثة) — لذا الطبقة الضبابية هنا
 * تستخدم عتبة auto-accept العالية فقط (0.90، نفس AUTO_THRESHOLD بـfuzzy.ts) بدل عتبة التأكيد
 * الأقل (0.70) المستخدمة بالشات: هناك فرصة نسأل المستخدم "تقصد X؟"، هنا لا — فإذا الثقة مو
 * عالية جدًا نرجّع null (صفر تخمين) بدل ربط خاطئ صامت.
 */
import { normalize } from "./arabicNormalize.js";
import { sequenceMatcherRatio } from "./sequenceMatcher.js";
import { getAllAliasesDicts, type AliasRow } from "./foodSearch.js";

export const INGREDIENT_FUZZY_THRESHOLD = 0.9;
const MIN_ALIAS_LENGTH = 2;

export interface IngredientResolution {
  food_id: number;
  food_name: string;
  tier: "exact" | "fuzzy";
  confidence: number;
}

/**
 * يحل اسم مكوّن وصفة حقيقي (مثلاً "بصل متوسط مفروم") إلى food_id حقيقي — تطابق حرفي ثنائي
 * الاتجاه أولاً (نفس نمط substringMatch بـrecipeSearch.ts بس ضد alias حقيقية لا نص حر)، وإلا
 * تطابق ضبابي بعتبة عالية جدًا. يرجّع null صراحة لو صفر تطابق واثق (مثلاً مكوّن غير موجود
 * بالقاعدة الصغيرة أصلاً — 44 food فقط — هذا متوقع ومقبول، صفر افتراض).
 */
export async function resolveIngredientName(rawName: string): Promise<IngredientResolution | null> {
  const normalized = normalize(rawName).trim();
  if (!normalized) return null;

  const aliases = await getAllAliasesDicts();

  // تطابق حرفي كامل (المكوّن = alias حقيقي بالضبط) — أقوى إشارة، يفوز فورًا بغض النظر عن أي
  // alias أطول قد يحتوي هذا النص كسلسلة فرعية (مثلاً "دجاج" لازم يطابق alias "دجاج" نفسه،
  // مو "دجاج مشوي" الأطول اللي يحتويه بالصدفة).
  const equalRow = aliases.find((row) => row.normalized_alias.length >= MIN_ALIAS_LENGTH && normalized === row.normalized_alias);
  if (equalRow) {
    return { food_id: equalRow.food_id, food_name: equalRow.food_name, tier: "exact", confidence: 1 };
  }

  // اسم المكوّن نص وصفي أطول يحتوي alias حقيقي كسلسلة فرعية (مثلاً "بصل متوسط مفروم" يحتوي
  // "بصل") — الأطول يفوز (الأكثر تحديدًا من النص المطابق داخل الوصف).
  let bestContainedInName: AliasRow | null = null;
  for (const row of aliases) {
    if (row.normalized_alias.length < MIN_ALIAS_LENGTH) continue;
    if (normalized.includes(row.normalized_alias)) {
      if (!bestContainedInName || row.normalized_alias.length > bestContainedInName.normalized_alias.length) {
        bestContainedInName = row;
      }
    }
  }
  if (bestContainedInName) {
    return { food_id: bestContainedInName.food_id, food_name: bestContainedInName.food_name, tier: "exact", confidence: 1 };
  }

  // اسم المكوّن أقصر ويقع داخل alias مركّب أطول (مثلاً مكوّن "طماطة" داخل alias افتراضي أطول)
  // — الأقصر (الأقرب لنص المكوّن نفسه، الأقل تخصيصًا زائدًا) يفوز.
  let bestContainingAlias: AliasRow | null = null;
  for (const row of aliases) {
    if (row.normalized_alias.length < MIN_ALIAS_LENGTH) continue;
    if (row.normalized_alias.includes(normalized)) {
      if (!bestContainingAlias || row.normalized_alias.length < bestContainingAlias.normalized_alias.length) {
        bestContainingAlias = row;
      }
    }
  }
  if (bestContainingAlias) {
    return { food_id: bestContainingAlias.food_id, food_name: bestContainingAlias.food_name, tier: "exact", confidence: 1 };
  }

  let bestFuzzy: { row: AliasRow; ratio: number } | null = null;
  for (const row of aliases) {
    if (row.normalized_alias.length < MIN_ALIAS_LENGTH) continue;
    const ratio = sequenceMatcherRatio(normalized, row.normalized_alias);
    if (ratio >= INGREDIENT_FUZZY_THRESHOLD && (!bestFuzzy || ratio > bestFuzzy.ratio)) {
      bestFuzzy = { row, ratio };
    }
  }
  if (bestFuzzy) {
    return { food_id: bestFuzzy.row.food_id, food_name: bestFuzzy.row.food_name, tier: "fuzzy", confidence: bestFuzzy.ratio };
  }

  return null;
}
