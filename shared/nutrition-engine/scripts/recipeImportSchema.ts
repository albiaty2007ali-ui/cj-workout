/**
 * شكل ملف JSON لاستيراد وصفات جديدة عبر importRecipesFromJson.ts، بالإضافة لدوال التحقق —
 * نفس حقول ExtraRecipeSeed (extraRecipesSeed.ts) لكن كملف بيانات خارجي مستقل عن الكود، حتى
 * يمكن إضافة دفعات وصفات مستقبلية بدون لمس TypeScript.
 */

export interface RecipeImportIngredient {
  name: string;
  quantity: string | null;
  unit: string | null;
}

export interface RecipeImportStep {
  instruction: string;
  duration: string | null;
  temperature: string | null;
  tip: string | null;
  warning: string | null;
}

export interface RecipeImportEntry {
  name: string;
  slug: string;
  category: string;
  description: string;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number;
  difficulty: "easy" | "medium" | "hard";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
  match_keywords: string[];
  /** كلمات تصنيف خفيفة اختيارية (مثلاً "عالي البروتين"، "سريع") — مصفوفة فاضية لو غير موجودة. */
  tags?: string[];
  ingredients: RecipeImportIngredient[];
  steps: RecipeImportStep[];
  substitutions: Record<string, string>;
  source_url: string;
}

export interface ValidationIssue {
  index: number;
  slug: string | null;
  message: string;
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

/** يتحقق من شكل وصحة عنصر وصفة واحد. لا يلمس الشبكة/قاعدة البيانات — فحص بنيوي وحسابي بحت. */
export function validateRecipeEntry(entry: unknown, index: number): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const push = (message: string) => issues.push({ index, slug: (entry as { slug?: string })?.slug ?? null, message });

  if (typeof entry !== "object" || entry === null) {
    push("العنصر لازم يكون object");
    return issues;
  }
  const e = entry as Record<string, unknown>;

  if (typeof e.name !== "string" || e.name.trim().length < 2) push("name مفقود أو قصير جدًا");
  if (typeof e.slug !== "string" || !SLUG_RE.test(e.slug)) push("slug مفقود أو غير صالح (لازم أحرف/أرقام إنجليزية صغيرة وشرطات فقط)");
  if (typeof e.category !== "string" || e.category.trim().length === 0) push("category مفقود");
  if (typeof e.description !== "string" || e.description.trim().length === 0) push("description مفقود");
  if (typeof e.servings !== "number" || e.servings <= 0) push("servings لازم رقم موجب");
  if (typeof e.difficulty !== "string" || !DIFFICULTIES.has(e.difficulty)) push("difficulty لازم easy/medium/hard");

  for (const field of ["calories", "protein", "carbs", "fat"]) {
    const v = e[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) push(`${field} لازم رقم غير سالب`);
  }
  if (e.fiber !== null && (typeof e.fiber !== "number" || e.fiber < 0)) push("fiber لازم رقم غير سالب أو null");
  if (e.prep_time_min !== null && (typeof e.prep_time_min !== "number" || e.prep_time_min < 0)) push("prep_time_min لازم رقم غير سالب أو null");
  if (e.cook_time_min !== null && (typeof e.cook_time_min !== "number" || e.cook_time_min < 0)) push("cook_time_min لازم رقم غير سالب أو null");

  if (!Array.isArray(e.match_keywords) || e.match_keywords.length === 0 || !e.match_keywords.every((k) => typeof k === "string")) {
    push("match_keywords لازم مصفوفة نصوص غير فاضية");
  }
  if (e.tags !== undefined && (!Array.isArray(e.tags) || !e.tags.every((t) => typeof t === "string"))) {
    push("tags (لو موجودة) لازم مصفوفة نصوص");
  }
  if (!Array.isArray(e.ingredients) || e.ingredients.length === 0) {
    push("ingredients لازم مصفوفة غير فاضية");
  } else {
    e.ingredients.forEach((ing: unknown, i: number) => {
      if (typeof ing !== "object" || ing === null || typeof (ing as { name?: unknown }).name !== "string" || (ing as { name: string }).name.trim().length === 0) {
        push(`ingredients[${i}].name مفقود`);
      }
    });
  }
  if (!Array.isArray(e.steps) || e.steps.length === 0) {
    push("steps لازم مصفوفة غير فاضية");
  } else {
    e.steps.forEach((st: unknown, i: number) => {
      if (typeof st !== "object" || st === null || typeof (st as { instruction?: unknown }).instruction !== "string" || (st as { instruction: string }).instruction.trim().length === 0) {
        push(`steps[${i}].instruction مفقود`);
      }
    });
  }
  if (typeof e.substitutions !== "object" || e.substitutions === null || Array.isArray(e.substitutions)) {
    push("substitutions لازم object (خريطة مكوّن -> بديل)");
  }
  if (typeof e.source_url !== "string" || e.source_url.trim().length === 0) push("source_url مفقود — كل وصفة لازم مصدر حقيقي موثّق");

  // فحص منطقية السعرات مقابل الماكروز المحسوبة (4/4/9 سعرة لكل غرام بروتين/كارب/دهن) —
  // تفاوت واسع مقبول (بيانات حقيقية فيها ألياف/كحول/تقريب)، لكن انحراف فاحش يدل على خطأ إدخال.
  if (typeof e.calories === "number" && typeof e.protein === "number" && typeof e.carbs === "number" && typeof e.fat === "number") {
    const computed = e.protein * 4 + e.carbs * 4 + e.fat * 9;
    if (e.calories > 0 && computed > 0) {
      const deviation = Math.abs(computed - e.calories) / e.calories;
      if (deviation > 0.6) {
        push(`فحص المنطقية فشل: السعرات المذكورة (${e.calories}) بعيدة جدًا عن المحسوبة من الماكروز (~${Math.round(computed)}) — انحراف ${Math.round(deviation * 100)}%`);
      }
    } else if (e.calories === 0 && computed > 20) {
      push("فحص المنطقية فشل: سعرات=0 لكن الماكروز تدل على سعرات حقيقية");
    }
  }

  return issues;
}
