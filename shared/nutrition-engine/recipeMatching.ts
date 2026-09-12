/**
 * منطق تسجيل تطابق المكونات — مُستخرَج من orchestrator.ts's handleCookFromIngredients (كان
 * منطقًا داخليًا وحيد الاستخدام) حتى يشترك فيه مسار COOK_FROM_INGREDIENTS القديم وأداة
 * find_recipes_from_ingredients الجديدة (conversation/tools.ts) بدون تكرار. صفر تغيير سلوكي —
 * نفس الخوارزمية حرفيًا.
 */
import type { RecipeRecord, RecipeIngredientRecord } from "./db/repository.js";

export type MatchTier = "EXACT_MATCH" | "HIGH_MATCH" | "PARTIAL_MATCH" | "LOW_MATCH";

/** EXACT/HIGH/PARTIAL/LOW حسب نسبة تطابق حقيقية — NO_MATCH (0%) لا يوصل هنا أصلاً (يُستبعَد قبلها). */
export function classifyMatchTier(percentage: number): MatchTier {
  if (percentage >= 1) return "EXACT_MATCH";
  if (percentage >= 0.8) return "HIGH_MATCH";
  if (percentage >= 0.6) return "PARTIAL_MATCH";
  return "LOW_MATCH";
}

export interface MentionedFood {
  food_id: number | null;
  food_name: string;
}

export interface ScoredRecipe {
  recipe: RecipeRecord;
  matchPercentage: number;
  missingRequired: string[];
  missingOptional: string[];
}

function isMatched(ing: RecipeIngredientRecord, mentionedFoodIds: Set<number>, mentionedNames: string[]): boolean {
  if (ing.food_id != null && mentionedFoodIds.has(ing.food_id)) return true;
  return mentionedNames.some((name) => ing.name.includes(name) || name.includes(ing.name));
}

/**
 * يقارن كل وصفة نشطة ضد الأطعمة المذكورة (food_id حقيقية أولًا، substring كـFallback) ويرجّع
 * قائمة مرتّبة تنازليًا بنسبة التطابق — يستبعد الوصفات بنسبة 0% (صفر تطابق فعلي).
 */
export function scoreRecipesByIngredients(recipes: RecipeRecord[], mentioned: MentionedFood[]): ScoredRecipe[] {
  const mentionedFoodIds = new Set(mentioned.map((m) => m.food_id).filter((id): id is number => id !== null));
  const mentionedNames = mentioned.map((m) => m.food_name);

  const scored: ScoredRecipe[] = [];
  for (const r of recipes) {
    if (r.ingredients.length === 0) continue;
    const requiredIngredients = r.ingredients.filter((ing) => ing.required !== false);
    const consideredIngredients = requiredIngredients.length > 0 ? requiredIngredients : r.ingredients;

    const missingRequired = consideredIngredients.filter((ing) => !isMatched(ing, mentionedFoodIds, mentionedNames));
    const matchPercentage = (consideredIngredients.length - missingRequired.length) / consideredIngredients.length;
    if (matchPercentage <= 0) continue;

    const missingOptional = r.ingredients.filter((ing) => ing.required === false && !isMatched(ing, mentionedFoodIds, mentionedNames));
    scored.push({
      recipe: r, matchPercentage,
      missingRequired: missingRequired.map((m) => m.name),
      missingOptional: missingOptional.map((m) => m.name),
    });
  }
  scored.sort((a, b) => b.matchPercentage - a.matchPercentage);
  return scored;
}
