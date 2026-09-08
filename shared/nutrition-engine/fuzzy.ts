/**
 * منفذ من nutrition_ai/fuzzy.py — Typo Tolerance Layer. يشتغل فقط على الأجزاء اللي ما طابقتها
 * food_search حرفيًا (consumed_spans)، وما يخمّن أبدًا لو النتيجة غير واثقة.
 */
import { sequenceMatcherRatio } from "./sequenceMatcher.js";
import { matchMessageWithMeta, getAllAliasesDicts, type AliasRow } from "./foodSearch.js";

export type { AliasRow };

// عتبات الثقة — قابلة للتعديل مركزيًا هنا فقط (مطابقة لـfuzzy.py بالضبط)
export const AUTO_THRESHOLD = 0.90;
export const CONFIRM_THRESHOLD = 0.70;
export const AMBIGUOUS_GAP = 0.08;

// كلمات شائعة بجملة الأكل ما نحاول نطابقها ضد أسماء الأكل أبدًا (تفادي نتائج فوضوية)
export const STOPWORDS = new Set([
  "اكلت", "أكلت", "فطرت", "تغديت", "تعشيت", "عشيت", "شربت", "زيدلي", "ضيف",
  "هسه", "هسة", "بعدني", "لسا", "مع", "وياها", "ويا", "وايا", "من", "الى", "إلى",
  "كان", "كانت", "شوي", "شوية", "تقريبا", "تقريباً", "اليوم", "امس", "باجر",
  "و", "ب", "ال", "شي", "شنو", "كيف", "شكد", "لو", "او", "أو",
]);

export interface FuzzyMatch {
  food_id: number;
  food_name: string;
  confidence: number;
  alias_row: AliasRow;
}

export interface FuzzySuggestion {
  token: string;
  start: number | null;
  end: number | null;
  matches: FuzzyMatch[];
}

export function leftoverText(normalizedText: string, consumedSpans: Array<[number, number]>): string {
  const chars = Array.from(normalizedText);
  for (const [start, end] of consumedSpans) {
    for (let i = start; i < Math.min(end, chars.length); i++) {
      chars[i] = " ";
    }
  }
  return chars.join("");
}

export function candidateTokens(leftover: string): string[] {
  const words = leftover.split(/\s+/).filter((w) => w.length > 0);
  const tokens: string[] = [];
  for (const w of words) {
    if (w.length >= 3 && !STOPWORDS.has(w)) {
      tokens.push(w);
    }
  }
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (!STOPWORDS.has(words[i]) || !STOPWORDS.has(words[i + 1])) {
      tokens.push(bigram);
    }
  }
  return tokens;
}

/**
 * منفذ من find_fuzzy_candidates — يأخذ leftover + aliases جاهزة (بدل استدعاء food_search
 * مباشرة) حتى يبقى مستقلًا عن طبقة DB لين تكتمل.
 */
export function findFuzzyCandidatesFromAliases(
  leftover: string,
  aliasesIn: AliasRow[],
): FuzzySuggestion[] {
  const tokens = candidateTokens(leftover);
  if (tokens.length === 0) return [];

  const aliases = aliasesIn.filter((a) => a.normalized_alias.length >= 3);
  const suggestions: FuzzySuggestion[] = [];

  for (const token of tokens) {
    const seenFoodIds = new Set<number>();
    const scored: FuzzyMatch[] = [];

    for (const alias of aliases) {
      const ratio = sequenceMatcherRatio(token, alias.normalized_alias);
      if (ratio < 0.55) continue;
      if (seenFoodIds.has(alias.food_id)) continue;
      seenFoodIds.add(alias.food_id);
      scored.push({
        food_id: alias.food_id,
        food_name: alias.food_name,
        confidence: Math.round(ratio * 1000) / 1000,
        alias_row: alias,
      });
    }

    if (scored.length === 0) continue;
    scored.sort((x, y) => y.confidence - x.confidence);

    if (scored[0].confidence >= CONFIRM_THRESHOLD) {
      const idx = leftover.indexOf(token);
      suggestions.push({
        token,
        start: idx >= 0 ? idx : null,
        end: idx >= 0 ? idx + token.length : null,
        matches: scored.slice(0, 3),
      });
    }
  }

  return suggestions;
}

/**
 * منفذ من find_fuzzy_candidates (النسخة الكاملة، تفتح اتصال food_search بنفسها) — يطابق
 * fuzzy.py's find_fuzzy_candidates(raw_text) بالضبط: يجيب leftover الحقيقي من foodSearch
 * ويطابقه ضد كل الـaliases الحقيقية بقاعدة foods.sqlite.
 */
export async function findFuzzyCandidates(rawText: string): Promise<FuzzySuggestion[]> {
  const { consumedSpans, normalizedText } = await matchMessageWithMeta(rawText);
  const leftover = leftoverText(normalizedText, consumedSpans);
  const aliases = await getAllAliasesDicts();
  return findFuzzyCandidatesFromAliases(leftover, aliases);
}

export type Classification =
  | { kind: "auto"; match: FuzzyMatch }
  | { kind: "confirm"; match: FuzzyMatch }
  | { kind: "ambiguous"; matches: [FuzzyMatch, FuzzyMatch] }
  | { kind: "none" };

/** منفذ حرفي من classify_candidates. */
export function classifyCandidates(matches: FuzzyMatch[]): Classification {
  if (matches.length === 0) return { kind: "none" };

  const top = matches[0];
  if (matches.length > 1) {
    const second = matches[1];
    if (top.confidence - second.confidence <= AMBIGUOUS_GAP && second.confidence >= CONFIRM_THRESHOLD) {
      return { kind: "ambiguous", matches: [top, second] };
    }
  }
  if (top.confidence >= AUTO_THRESHOLD) return { kind: "auto", match: top };
  if (top.confidence >= CONFIRM_THRESHOLD) return { kind: "confirm", match: top };
  return { kind: "none" };
}
