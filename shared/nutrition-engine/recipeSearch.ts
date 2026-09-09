/**
 * منفذ من nutrition_ai/recipe_search.py — بحث نصي مطبّع بديل عن FTS5 (قاعدة الوصفات صغيرة، قرار
 * موثّق بالخطة). زراعة البيانات الأولية (seed_default_recipes) غير منفَّذة هنا — عملية بذر بيانات
 * لمرة واحدة عند الإقلاع، تخص طبقة Postgres الحقيقية، لا منطق أعمال يُختبر بمعزل.
 */
import { normalize } from "./arabicNormalize.js";
import { sequenceMatcherRatio } from "./sequenceMatcher.js";
import type { Repository, RecipeRecord } from "./db/repository.js";

const CONFIRM_THRESHOLD = 0.55;

function substringMatch(queryNorm: string, field: string | null): boolean {
  const fNorm = normalize(field || "");
  if (!fNorm) return false;
  return queryNorm.includes(fNorm) || fNorm.includes(queryNorm);
}

/**
 * تحمّل خطأ إملائي بسيط — تُستخدم فقط ضد حقول تعريفية قصيرة (اسم/كلمات مفتاحية)، مو ضد نص
 * وصف حر (كلمات عامة قصيرة بالوصف كانت تعطي تطابقات فوضوية بنسبة ثقة منخفضة).
 */
function fuzzyMatch(queryWords: string[], field: string | null): boolean {
  const fNorm = normalize(field || "");
  if (!fNorm) return false;
  for (const fw of fNorm.split(/\s+/)) {
    if (fw.length < 4) continue;
    for (const qw of queryWords) {
      if (fw.includes(qw) || qw.includes(fw)) return true;
      if (sequenceMatcherRatio(qw, fw) >= CONFIRM_THRESHOLD) return true;
    }
  }
  return false;
}

/**
 * يرجّع قائمة وصفات نشطة تطابق query (اسم/وصف/كلمات مفتاحية) وcategoryId إذا انعطى. لا يخمّن —
 * ماكو تطابق يرجّع قائمة فاضية والواجهة تعرض Empty State.
 */
export async function searchRecipes(
  repo: Repository,
  query = "",
  categoryId: string | null = null,
): Promise<RecipeRecord[]> {
  const recipes = await repo.findActiveRecipes(categoryId);

  const q = (query || "").trim();
  if (!q) return recipes;

  const queryNorm = normalize(q);
  const queryWords = queryNorm.split(/\s+/).filter((w) => w.length >= 3);

  const matched: RecipeRecord[] = [];
  for (const r of recipes) {
    const keywords = (r.match_keywords || "").split("|");
    if (substringMatch(queryNorm, r.name) || substringMatch(queryNorm, r.description)) {
      matched.push(r);
      continue;
    }
    if (keywords.some((k) => substringMatch(queryNorm, k))) {
      matched.push(r);
      continue;
    }
    // بحث بالمكونات — يخلي "عندي بيض ابحثلي أكلة" أو "وصفة دجاج" يلقى وصفات تحتوي المكوّن حتى
    // لو ماكو بالاسم/الوصف/match_keywords صراحة (مثلاً وصفة اسمها "بولاو" فيها دجاج كمكوّن).
    if (r.ingredients.some((ing) => substringMatch(queryNorm, ing.name))) {
      matched.push(r);
      continue;
    }
    if (fuzzyMatch(queryWords, r.name) || keywords.some((k) => fuzzyMatch(queryWords, k))) {
      matched.push(r);
    }
  }
  return matched;
}

/** يبحث عن أفضل وصفة مطابقة لنص حر بالشات. */
export async function findRecipeByText(repo: Repository, text: string): Promise<RecipeRecord | null> {
  const results = await searchRecipes(repo, text);
  return results.length > 0 ? results[0] : null;
}

/**
 * وصفات حقيقية ضمن السعرات المتبقية — تُستخدم لإثراء رد ASK_RECOMMENDATION بالشات. لا تخمين —
 * فاضية لو ماكو وصفة تناسب.
 */
export async function suggestRecipesWithin(repo: Repository, remainingCalories: number, limit = 2): Promise<RecipeRecord[]> {
  if (remainingCalories <= 0) return [];
  const all = await searchRecipes(repo);
  const fitting = all.filter((r) => r.calories <= remainingCalories);
  fitting.sort((a, b) => b.calories - a.calories);
  return fitting.slice(0, limit);
}
