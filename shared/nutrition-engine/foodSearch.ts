/**
 * منفذ من food_search.py — البحث والمطابقة داخل قاعدة CJ WORKOUT المحلية (foods.sqlite عبر
 * sql.js). لا يوجد أي طلب شبكة هنا — كل شيء محلي، بنفس الاستعلامات SQL الأصلية حرفيًا.
 *
 * ملاحظة هجرة مهمة: هذا الملف له NUMBER_WORDS خاص به منفصل عن quantity.ts's NUMBER_WORDS —
 * هذا يطابق الأصل بايثون بالضبط (food_search.py يعرّف نسخته الخاصة، أصغر وبدون "صفر"/"عشرين"/
 * "مية"، وبدون تنويعات الهمزة "أربعة"/"أربع") — قرار تعمّدي بالأصل، لسنا هنا لتوحيدهما.
 */
import { normalize } from "./arabicNormalize.js";
import { getFoodDb, queryAll, queryOne, type SqlRow } from "./db/foodDb.js";
import { pyRound } from "./pyRound.js";

// نفس ترتيب المفاتيح بالضبط كما بـfood_search.py (يؤثر على أي تطابق أول عند تكرار قيمة الرقم)
const NUMBER_WORDS: Record<string, number> = {
  "واحد": 1, "واحدة": 1, "وحدة": 1,
  "اثنين": 2, "اثنتين": 2, "ثنتين": 2, "زوج": 2,
  "ثلاثة": 3, "ثلاث": 3,
  "اربعة": 4, "اربع": 4,
  "خمسة": 5, "خمس": 5,
  "ستة": 6, "ست": 6,
  "سبعة": 7, "سبع": 7,
  "ثمانية": 8, "ثمان": 8,
  "تسعة": 9, "تسع": 9,
  "عشرة": 10, "عشر": 10,
};

const GRAM_UNIT_WORDS = ["غرام", "غم", "جرام", "جم", "gram", "g"];

// صيغ مختلفة لنفس اسم الـPortion بقاعدة البيانات (خصوصًا الجمع) — تطبيع محلي فقط عند مطابقة
// اسم الحصة، بدون ما يأثر على مواقع الأحرف المستخدمة بمطابقة الأرقام/الـalias بمكان ثاني
const UNIT_SPELLING_VARIANTS: Record<string, string> = {
  "خواشيق": "خاشوقة", "خاشوگة": "خاشوقة", "خاشوكة": "خاشوقة",
  "ملاعق": "ملعقة",
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUnitWords(text: string): string {
  let t = text;
  for (const [variant, canonical] of Object.entries(UNIT_SPELLING_VARIANTS)) {
    t = t.split(variant).join(canonical);
  }
  return t;
}

export interface AliasRow extends SqlRow {
  alias_id: number;
  normalized_alias: string;
  quantity_multiplier: number;
  is_plural_unspecified: number;
  food_id: number;
  food_name: string;
  is_bulk: number;
}

/** كل الـaliases مرتبة من الأطول للأقصر لتفادي تطابق جزئي خاطئ (مثل "بيض" داخل "بيضتين"). */
function getAllAliasesRows(db: Awaited<ReturnType<typeof getFoodDb>>): AliasRow[] {
  const rows = queryAll(
    db,
    `SELECT fa.id as alias_id, fa.normalized_alias, fa.quantity_multiplier, fa.is_plural_unspecified,
            f.id as food_id, f.name as food_name, f.is_bulk
     FROM food_aliases fa JOIN foods f ON f.id = fa.food_id`,
  ) as AliasRow[];
  return rows.sort((a, b) => b.normalized_alias.length - a.normalized_alias.length);
}

/** يبحث عن رقم (كلمة أو خانة) ضمن آخر 15 حرف قبل موقع المطابقة — حدود كلمة Unicode-aware (يطابق \b بايثون مع أحرف عربية). */
function findNumberBefore(text: string, pos: number): number | null {
  const window = text.slice(Math.max(0, pos - 15), pos);
  const m = window.match(/(\d+)\s*$/);
  if (m) return parseFloat(m[1]);
  for (const [word, val] of Object.entries(NUMBER_WORDS)) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(word)}\\s*$`, "u");
    if (re.test(window)) return val;
  }
  return null;
}

function findGramsBefore(text: string, pos: number): number | null {
  const window = text.slice(Math.max(0, pos - 20), pos);
  const re = new RegExp(`(\\d+)\\s*(?:${GRAM_UNIT_WORDS.map(escapeRegExp).join("|")})\\s*$`);
  const m = window.match(re);
  return m ? parseFloat(m[1]) : null;
}

/**
 * يفتش عن Portion معرّف لهذا الطعام. يدعم الحالتين:
 * - متجاورة: "صحن متوسط"
 * - منفصلة حول اسم الطعام (شائع بالعراقي): "صحن تمن متوسط"
 */
function findPortion(db: Awaited<ReturnType<typeof getFoodDb>>, foodId: number, rawText: string): SqlRow | null {
  const text = normalizeUnitWords(rawText);
  const portions = queryAll(
    db,
    "SELECT * FROM food_portions WHERE food_id=? ORDER BY LENGTH(normalized_portion_name) DESC",
    [foodId],
  );
  let best: SqlRow | null = null;
  for (const p of portions) {
    const name = String(p.normalized_portion_name);
    if (text.includes(name)) return p;
    const tokens = name.split(/\s+/);
    if (tokens.length > 1 && tokens.every((tok) => text.includes(tok))) {
      if (!best || name.length > String(best.normalized_portion_name).length) {
        best = p;
      }
    }
  }
  return best;
}

export interface MatchHit {
  food_id: number;
  food_name: string;
  resolved: boolean;
  grams?: number;
  quantity?: number;
  portion_name?: string;
  unit_grams?: number;
  needs_clarification?: boolean;
}

/**
 * يحدد الكمية/الحصة لطعام معروف الموقع بالنص (alias مطابق حرفيًا أو ضبابيًا). مشترك بين
 * matchMessageWithMeta ومنطق تأكيد المطابقة الضبابية (fuzzy).
 */
function resolveHit(
  db: Awaited<ReturnType<typeof getFoodDb>>,
  row: AliasRow,
  text: string,
  start: number,
): MatchHit {
  const gramsExplicit = findGramsBefore(text, start);
  const portion = gramsExplicit === null ? findPortion(db, row.food_id, text) : null;
  const numberBefore = findNumberBefore(text, start);

  if (gramsExplicit !== null) {
    return { food_id: row.food_id, food_name: row.food_name, resolved: true, grams: gramsExplicit };
  }
  if (portion !== null) {
    const qty = numberBefore ?? 1;
    return {
      food_id: row.food_id, food_name: row.food_name, resolved: true,
      grams: Number(portion.grams) * qty, quantity: qty,
      portion_name: String(portion.portion_name), unit_grams: Number(portion.grams),
    };
  }
  if (numberBefore !== null && !row.is_bulk) {
    // عدد صريح مذكور (مثلاً "5 تمرات") — نستخدم أول Portion معرّف لهذا الطعام كوحدة قياس
    const defaultPortion = queryOne(db, "SELECT * FROM food_portions WHERE food_id=? LIMIT 1", [row.food_id]);
    const unitGrams = defaultPortion ? Number(defaultPortion.grams) : 100;
    return {
      food_id: row.food_id, food_name: row.food_name, resolved: true,
      grams: unitGrams * numberBefore, quantity: numberBefore, unit_grams: unitGrams,
    };
  }
  if (row.is_plural_unspecified && !numberBefore) {
    return { food_id: row.food_id, food_name: row.food_name, resolved: false, needs_clarification: true };
  }
  if (row.is_bulk) {
    return { food_id: row.food_id, food_name: row.food_name, resolved: false, needs_clarification: true };
  }
  // طعام Discrete: المضاعِف من الـalias نفسه (مفرد=1, مثنى=2)
  const multiplier = row.quantity_multiplier;
  const defaultPortion = queryOne(db, "SELECT * FROM food_portions WHERE food_id=? LIMIT 1", [row.food_id]);
  const unitGrams = defaultPortion ? Number(defaultPortion.grams) : 100;
  return {
    food_id: row.food_id, food_name: row.food_name, resolved: true,
    grams: unitGrams * multiplier, quantity: multiplier, unit_grams: unitGrams,
  };
}

export interface MatchMessageResult {
  results: MatchHit[];
  consumedSpans: Array<[number, number]>;
  normalizedText: string;
}

/**
 * يحلل رسالة المستخدم ويرجع نتائج المطابقة + (consumedSpans, normalizedText) — يُستخدم من
 * fuzzy.ts لمعرفة أي أجزاء من الرسالة ما طابقت أي alias حرفيًا.
 */
export async function matchMessageWithMeta(rawText: string): Promise<MatchMessageResult> {
  const text = normalize(rawText);
  const db = await getFoodDb();
  const aliases = getAllAliasesRows(db);

  const results: MatchHit[] = [];
  const consumedSpans: Array<[number, number]> = [];

  const overlaps = (start: number, end: number) =>
    consumedSpans.some(([s, e]) => !(end <= s || start >= e));

  for (const row of aliases) {
    const alias = row.normalized_alias;
    const re = new RegExp(escapeRegExp(alias), "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + alias.length;
      if (!overlaps(start, end)) {
        results.push(resolveHit(db, row, text, start));
        consumedSpans.push([start, end]);
      }
      if (alias.length === 0) re.lastIndex++; // حماية من حلقة لا نهائية (لن يحصل عمليًا هنا)
    }
  }

  return { results, consumedSpans, normalizedText: text };
}

export async function matchMessage(rawText: string): Promise<MatchHit[]> {
  const { results } = await matchMessageWithMeta(rawText);
  return results;
}

/** نسخة عامة تفتح اتصالها الخاص — تُستخدم بعد تأكيد مطابقة ضبابية (fuzzy). */
export async function resolveAliasAt(aliasRow: AliasRow, rawText: string, start: number): Promise<MatchHit> {
  const text = normalize(rawText);
  const db = await getFoodDb();
  return resolveHit(db, aliasRow, text, start);
}

/** كل الـaliases كقواميس بسيطة — تُستخدم من fuzzy.ts. */
export async function getAllAliasesDicts(): Promise<AliasRow[]> {
  const db = await getFoodDb();
  return getAllAliasesRows(db);
}

export async function getPortionsFor(foodId: number): Promise<SqlRow[]> {
  const db = await getFoodDb();
  return queryAll(db, "SELECT * FROM food_portions WHERE food_id=?", [foodId]);
}

export interface QuantityResolution {
  resolved: boolean;
  grams?: number;
  portion_name?: string;
}

/**
 * يُستخدم عندما يكون الطعام معروفًا مسبقًا (بانتظار توضيح الكمية) والمستخدم يرد برسالة قد لا
 * تحتوي اسم الطعام إطلاقًا، مثل "صحن متوسط" أو "300 غرام" أو "5 حبات".
 */
export async function resolveQuantityForFood(foodId: number, rawText: string): Promise<QuantityResolution> {
  const text = normalizeUnitWords(normalize(rawText));
  const db = await getFoodDb();

  const gramsRe = new RegExp(`(\\d+)\\s*(?:${GRAM_UNIT_WORDS.map(escapeRegExp).join("|")})`);
  const gramsMatch = text.match(gramsRe);
  if (gramsMatch) {
    return { resolved: true, grams: parseFloat(gramsMatch[1]) };
  }

  const portions = queryAll(
    db,
    "SELECT * FROM food_portions WHERE food_id=? ORDER BY LENGTH(normalized_portion_name) DESC",
    [foodId],
  );

  let number: number | null = null;
  const numMatch = text.match(/\d+/);
  if (numMatch) {
    number = parseFloat(numMatch[0]);
  } else {
    for (const [word, val] of Object.entries(NUMBER_WORDS)) {
      if (text.includes(word)) {
        number = val;
        break;
      }
    }
  }

  for (const p of portions) {
    const name = String(p.normalized_portion_name);
    const tokens = name.split(/\s+/);
    if (text.includes(name) || tokens.every((tok) => text.includes(tok))) {
      const qty = number ?? 1;
      return { resolved: true, grams: Number(p.grams) * qty, portion_name: String(p.portion_name) };
    }
  }

  if (number !== null && portions.length > 0) {
    const habbaPortion = portions.find((p) => p.normalized_portion_name === "حبة");
    if (habbaPortion) {
      return { resolved: true, grams: Number(habbaPortion.grams) * number, portion_name: String(habbaPortion.portion_name) };
    }
  }

  return { resolved: false };
}

export interface NutritionResult {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export async function computeNutrition(foodId: number, grams: number): Promise<NutritionResult> {
  const db = await getFoodDb();
  const n = queryOne(db, "SELECT * FROM food_nutrients WHERE food_id=?", [foodId]);
  if (!n) return { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  const factor = grams / 100.0;
  return {
    calories: pyRound(Number(n.calories_per_100g) * factor),
    protein: pyRound(Number(n.protein_per_100g) * factor, 1),
    carbs: pyRound(Number(n.carbs_per_100g) * factor, 1),
    fat: pyRound(Number(n.fat_per_100g) * factor, 1),
    fiber: pyRound(Number(n.fiber_per_100g) * factor, 1),
  };
}
