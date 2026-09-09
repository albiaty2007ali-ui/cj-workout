/**
 * Recipe Scaling (المرحلة 4 من "الذكاء الغذائي الذكي") — إعادة حساب مكونات وNutrition وصفة
 * حقيقية نسبيًا لعدد حصص مختلف عن servings الأصلي المخزَّن. معادلة واحدة بسيطة (factor =
 * target/original) على كل رقم حقيقي موجود — صفر تخمين، صفر Nutrition مخترعة جديدة.
 */
import { pyRound } from "./pyRound.js";
import type { RecipeRecord, RecipeIngredientRecord } from "./db/repository.js";

export interface ScaledRecipe {
  servings: number;
  ingredients: RecipeIngredientRecord[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
}

/** يقرّب كسر الكمية بعرض نظيف (بدون أصفار زائدة) — "4" مو "4.0"، "1.5" تبقى "1.5". */
function formatScaledQuantity(value: number): string {
  return String(pyRound(value, 2));
}

/**
 * يحوّل نص كمية حقيقي إلى رقم مُقاس نسبيًا لعامل التحجيم — لو الكمية نص كلامي غير رقمي
 * (مثلاً "رشة"، "حسب الرغبة") يبقى كما هو حرفيًا، صفر تخمين لتحويله لرقم غير حقيقي.
 */
function scaleQuantityString(quantity: string | null, factor: number): string | null {
  if (quantity === null) return null;
  const num = Number(quantity.trim());
  if (Number.isNaN(num)) return quantity;
  return formatScaledQuantity(num * factor);
}

/**
 * يعيد حساب وصفة حقيقية بعدد حصص مختلف. يرمي خطأ صريح لو servings الأصلي أو الهدف غير صالحين
 * (صفر أو سالب) — استدعاء غير منطقي، أفضل نرفضه بوضوح من نرجّع رقم مضلِّل.
 */
export function scaleRecipe(recipe: RecipeRecord, targetServings: number): ScaledRecipe {
  if (recipe.servings <= 0) throw new Error(`recipe ${recipe.id} has invalid servings: ${recipe.servings}`);
  if (targetServings <= 0) throw new Error(`targetServings must be positive, got: ${targetServings}`);

  const factor = targetServings / recipe.servings;
  return {
    servings: targetServings,
    ingredients: recipe.ingredients.map((ing) => ({ ...ing, quantity: scaleQuantityString(ing.quantity, factor) })),
    calories: pyRound(recipe.calories * factor),
    protein: pyRound(recipe.protein * factor, 1),
    carbs: pyRound(recipe.carbs * factor, 1),
    fat: pyRound(recipe.fat * factor, 1),
    fiber: recipe.fiber !== null ? pyRound(recipe.fiber * factor, 1) : null,
  };
}
