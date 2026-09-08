/**
 * منفذ من nutrition_ai/entities.py — Food Entity Extractor، الطبقة الموحّدة اللي يتعامل معها
 * orchestrator. تجمع نتائج المطابقة الحرفية (foodSearch.ts) والمطابقة الضبابية (fuzzy.ts) بشكل
 * واحد متّسق، بدون ما تخترع أي رقم غذائي بنفسها.
 *
 * كل عنصر "clarification" له kind واحد من:
 *   - "quantity"        : الطعام معروف بثقة، لكن الكمية غير واضحة
 *   - "confirm_match"   : تخمين واحد بثقة متوسطة (0.70–0.89) — يحتاج تأكيد "تقصد {food}؟"
 *   - "ambiguous_match" : مرشحين متقاربين — يحتاج اختيار "تقصد {A} لو {B}؟"
 */
import * as foodSearch from "./foodSearch.js";
import { findFuzzyCandidates, classifyCandidates, type AliasRow } from "./fuzzy.js";

export type Clarification =
  | { kind: "quantity"; food_id: number; food_name: string }
  | {
      kind: "confirm_match"; food_id: number; food_name: string; confidence: number;
      raw_token: string; alias_row: AliasRow; start: number | null; end: number | null;
      source_text: string;
    }
  | {
      kind: "ambiguous_match";
      options: Array<{ food_id: number; food_name: string; alias_row: AliasRow }>;
      raw_token: string; start: number | null; end: number | null; source_text: string;
    };

export interface ExtractedEntities {
  resolved: foodSearch.MatchHit[];
  clarifications: Clarification[];
}

export async function extractFoodEntities(rawText: string): Promise<ExtractedEntities> {
  const { results: resolvedHits } = await foodSearch.matchMessageWithMeta(rawText);

  const clarifications: Clarification[] = [];
  const finalResolved: foodSearch.MatchHit[] = [];

  for (const r of resolvedHits) {
    if (r.resolved) {
      finalResolved.push({ ...r, confidence: 1.0 } as foodSearch.MatchHit & { confidence: number });
    } else {
      clarifications.push({ kind: "quantity", food_id: r.food_id, food_name: r.food_name });
    }
  }

  const suggestions = await findFuzzyCandidates(rawText);
  for (const suggestion of suggestions) {
    const decision = classifyCandidates(suggestion.matches);

    if (decision.kind === "auto") {
      const payload = decision.match;
      const hit = await foodSearch.resolveAliasAt(payload.alias_row, rawText, suggestion.start ?? 0);
      const hitWithConfidence = { ...hit, confidence: payload.confidence };
      if (hit.resolved) {
        finalResolved.push(hitWithConfidence as foodSearch.MatchHit & { confidence: number });
      } else {
        clarifications.push({ kind: "quantity", food_id: hit.food_id, food_name: hit.food_name });
      }
    } else if (decision.kind === "confirm") {
      const payload = decision.match;
      clarifications.push({
        kind: "confirm_match",
        food_id: payload.food_id, food_name: payload.food_name, confidence: payload.confidence,
        raw_token: suggestion.token, alias_row: payload.alias_row,
        start: suggestion.start, end: suggestion.end, source_text: rawText,
      });
    } else if (decision.kind === "ambiguous") {
      clarifications.push({
        kind: "ambiguous_match",
        options: decision.matches.map((m) => ({ food_id: m.food_id, food_name: m.food_name, alias_row: m.alias_row })),
        raw_token: suggestion.token, start: suggestion.start, end: suggestion.end, source_text: rawText,
      });
    }
    // "none" -> نتجاهل الكلمة بصمت، أفضل من اقتراح خاطئ بثقة منخفضة
  }

  return { resolved: finalResolved, clarifications };
}
