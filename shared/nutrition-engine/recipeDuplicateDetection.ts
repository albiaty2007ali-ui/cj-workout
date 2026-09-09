/**
 * كشف تكرار حقيقي للوصفات — قبل الاستيراد فقط (importRecipesFromJson.ts)، مو دمج تلقائي صامت.
 * يقارن (أ) تشابه الاسم المُطبَّع (نفس sequenceMatcherRatio المستخدم بكل مكان بالمشروع)،
 * و(ب) تشابه مجموعة المكونات (Jaccard على food_id الحقيقية المحلولة — ingredientResolver.ts —
 * وإلا على أسماء نصية مُطبَّعة كـFallback لمكونات ما انحلّت). أي تطابق مشبوه يُرفَض صراحة
 * (يُبلَّغ، صفر استيراد لتلك الوصفة) بدل تخمين إنها "نفس الوصفة" أو "وصفة مختلفة".
 */
import { normalize } from "./arabicNormalize.js";
import { sequenceMatcherRatio } from "./sequenceMatcher.js";

export interface DuplicateCheckIngredient {
  name: string;
  food_id?: number | null;
}

export interface DuplicateCheckRecipe {
  slug: string;
  name: string;
  ingredients: DuplicateCheckIngredient[];
}

export interface DuplicateCandidate {
  slug: string;
  name: string;
  name_similarity: number;
  ingredient_similarity: number;
  reason: string;
}

// اسم شبه مطابق (≥0.85) يكفي وحده — "Chicken Bowl" و"Chicken Bowl Healthy" مثال الطلب نفسه.
const NAME_SIMILARITY_REJECT = 0.85;
// وإلا: اسم متقارب معقول + مكونات متطابقة بشكل كبير معًا يكفيان (يتفادى False Positive
// لوصفتين مختلفتين فعليًا تشتركان بمكوّن شائع بس).
const COMBINED_NAME_THRESHOLD = 0.6;
const COMBINED_INGREDIENT_THRESHOLD = 0.6;

function ingredientKey(ing: DuplicateCheckIngredient): string {
  return ing.food_id != null ? `id:${ing.food_id}` : `name:${normalize(ing.name)}`;
}

function ingredientKeySet(ingredients: DuplicateCheckIngredient[]): Set<string> {
  return new Set(ingredients.map(ingredientKey));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** يفحص وصفة مرشّحة ضد قائمة وصفات موجودة فعليًا (نشطة بـFirestore + بقية دفعة الاستيراد نفسها). */
export function findSimilarRecipes(
  candidate: DuplicateCheckRecipe,
  existing: DuplicateCheckRecipe[],
): DuplicateCandidate[] {
  const candNameNorm = normalize(candidate.name);
  const candIngredients = ingredientKeySet(candidate.ingredients);
  const out: DuplicateCandidate[] = [];

  for (const r of existing) {
    if (r.slug === candidate.slug) continue;
    const nameSim = sequenceMatcherRatio(candNameNorm, normalize(r.name));
    const ingSim = jaccard(candIngredients, ingredientKeySet(r.ingredients));

    let reason: string | null = null;
    if (nameSim >= NAME_SIMILARITY_REJECT) reason = `اسم متشابه جدًا بنسبة ${Math.round(nameSim * 100)}%`;
    else if (nameSim >= COMBINED_NAME_THRESHOLD && ingSim >= COMBINED_INGREDIENT_THRESHOLD) {
      reason = `اسم متقارب (${Math.round(nameSim * 100)}%) ومكونات متطابقة بشكل كبير (${Math.round(ingSim * 100)}%) معًا`;
    }
    if (reason) {
      out.push({
        slug: r.slug, name: r.name,
        name_similarity: Math.round(nameSim * 1000) / 1000,
        ingredient_similarity: Math.round(ingSim * 1000) / 1000,
        reason,
      });
    }
  }

  return out.sort((a, b) => (b.name_similarity + b.ingredient_similarity) - (a.name_similarity + a.ingredient_similarity));
}
