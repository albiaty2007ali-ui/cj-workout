/**
 * سكربت استيراد دفعة وصفات من ملف JSON خارجي (مسار الاستيراد "Import Pipeline" — المرحلة 4 من
 * "الذكاء الغذائي الذكي"، مُوسَّع بالمرحلة 3 من Prompt 2) — يقرأ ملف JSON (مصفوفة
 * RecipeImportEntry، انظر recipeImportSchema.ts)، يمر بالمراحل التالية بالترتيب:
 *   1. Validation بنيوية + فحص منطقية السعرات/الماكروز (validateRecipeEntry).
 *   2. Duplicate Detection حقيقي (recipeDuplicateDetection.ts) — اسم و/أو مكونات متشابهة جدًا
 *      ضد الوصفات النشطة الحقيقية بـFirestore + بقية الدفعة نفسها -> رفض صريح، صفر دمج صامت.
 *   3. حل food_id حقيقي لكل مكوّن (ingredientResolver.ts) + تحديد required تلقائيًا من كلمة
 *      "اختياري" الحقيقية بالنص لو موجودة.
 *   4. الكتابة لـFirestore — بما فيها source (كان source_url يُتحقَّق منه سابقًا ثم يُهمَل عند
 *      الكتابة، إصلاح فجوة حقيقية) وtags.
 * نفس نمط الكتابة العام المستخدم بـseedExtraRecipes.ts، Idempotent (slug مكرر = تخطّي).
 *
 * الاستخدام: npx vite-node shared/nutrition-engine/scripts/importRecipesFromJson.ts <path/to/file.json>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, genId } from "../db/firestoreRepository.js";
import { validateRecipeEntry, type RecipeImportEntry } from "./recipeImportSchema.js";
import { findSimilarRecipes, type DuplicateCheckRecipe } from "../recipeDuplicateDetection.js";
import { resolveIngredientName } from "../ingredientResolver.js";

const filePath = process.argv[2];
if (!filePath) {
  console.error("استخدم: npx vite-node shared/nutrition-engine/scripts/importRecipesFromJson.ts <path/to/file.json>");
  process.exit(1);
}

const raw = readFileSync(filePath, "utf-8");
const parsed: unknown = JSON.parse(raw);
if (!Array.isArray(parsed)) {
  console.error("ملف JSON لازم يكون مصفوفة وصفات بالمستوى الأعلى.");
  process.exit(1);
}

console.log(`قرأت ${parsed.length} عنصر من ${filePath}. بفحص التحقق (Validation)...`);

const allIssues = parsed.flatMap((entry, i) => validateRecipeEntry(entry, i));
if (allIssues.length > 0) {
  console.error(`\n❌ فشل التحقق — ${allIssues.length} مشكلة، صفر استيراد حتى تُصلَح كل الملف:`);
  for (const issue of allIssues) {
    console.error(`  [${issue.index}]${issue.slug ? ` (${issue.slug})` : ""}: ${issue.message}`);
  }
  process.exit(1);
}
console.log("✅ كل العناصر اجتازت التحقق البنيوي وفحص منطقية السعرات/الماكروز.");

const entries = parsed as RecipeImportEntry[];
const slugSet = new Set(entries.map((e) => e.slug));
if (slugSet.size !== entries.length) {
  console.error("❌ فيه slug مكرر داخل نفس ملف الاستيراد — صفر استيراد.");
  process.exit(1);
}

const db = getFirestore(getFirebaseApp());

const categoriesSnap = await db.collection("recipe_categories").get();
const categoryIdByName: Record<string, string> = {};
categoriesSnap.docs.forEach((d) => { categoryIdByName[d.data().name] = d.id; });
console.log("تصنيفات موجودة:", Object.keys(categoryIdByName).join("، "));

// ---- Duplicate Detection: نبني قائمة الوصفات النشطة الحقيقية + بقية الدفعة نفسها ----
console.log("\nبفحص التكرار (Duplicate Detection) قبل أي كتابة...");
const activeSnap = await db.collection("recipes").where("active", "==", true).get();
const existingForDedup: DuplicateCheckRecipe[] = activeSnap.docs.map((d) => {
  const data = d.data();
  return {
    slug: data.slug, name: data.name,
    ingredients: (data.ingredients ?? []).map((ing: { name: string; food_id?: number | null }) => ({ name: ing.name, food_id: ing.food_id ?? null })),
  };
});
const batchForDedup: DuplicateCheckRecipe[] = entries.map((e) => ({ slug: e.slug, name: e.name, ingredients: e.ingredients.map((i) => ({ name: i.name })) }));

const dupIssues: string[] = [];
for (const e of entries) {
  const candidate: DuplicateCheckRecipe = { slug: e.slug, name: e.name, ingredients: e.ingredients.map((i) => ({ name: i.name })) };
  const matches = findSimilarRecipes(candidate, [...existingForDedup, ...batchForDedup]);
  if (matches.length > 0) {
    for (const m of matches) dupIssues.push(`  [${e.slug}] "${e.name}" يشبه "${m.name}" (${m.slug}) — ${m.reason}`);
  }
}
if (dupIssues.length > 0) {
  console.error(`\n❌ فحص التكرار وجد ${dupIssues.length} تطابق مشبوه — صفر استيراد حتى تُراجَع:`);
  dupIssues.forEach((l) => console.error(l));
  process.exit(1);
}
console.log("✅ صفر تكرار مشبوه ضد الوصفات النشطة الحالية أو داخل الدفعة نفسها.");

let added = 0, skipped = 0, rejectedCategory = 0, ingredientsResolved = 0, ingredientsTotal = 0;
for (const r of entries) {
  const categoryId = categoryIdByName[r.category];
  if (!categoryId) {
    console.warn(`  ⚠️ تصنيف غير موجود: ${r.category}، تخطّي وصفة ${r.name}`);
    rejectedCategory++;
    continue;
  }
  const existing = await db.collection("recipes").where("slug", "==", r.slug).limit(1).get();
  if (!existing.empty) {
    console.log(`  ⏭️ موجودة أصلًا: ${r.name} (${r.slug})، تخطّي.`);
    skipped++;
    continue;
  }

  const resolvedIngredients = [];
  for (const ing of r.ingredients) {
    const resolution = await resolveIngredientName(ing.name);
    const isOptional = /اختياري/.test(`${ing.name} ${ing.unit ?? ""}`);
    ingredientsTotal++;
    if (resolution) ingredientsResolved++;
    resolvedIngredients.push({
      name: ing.name, quantity: ing.quantity, unit: ing.unit,
      food_id: resolution?.food_id ?? null, required: !isOptional,
    });
  }

  await db.collection("recipes").doc(genId()).set({
    name: r.name, slug: r.slug, description: r.description, category_id: categoryId,
    active: true, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber,
    prep_time_min: r.prep_time_min, cook_time_min: r.cook_time_min, servings: r.servings, difficulty: r.difficulty,
    match_keywords: r.match_keywords.join("|"),
    source: r.source_url, tags: r.tags ?? [],
    ingredients: resolvedIngredients,
    steps: r.steps.map((s, idx) => ({ ...s, step_number: idx + 1 })),
    substitutions: Object.entries(r.substitutions).map(([ingredient_name, replacement]) => ({ ingredient_name, replacement })),
  });
  added++;
  console.log(`  ✅ ${r.name}`);
}

console.log(`\nخلص: ${added} وصفة انزرعت، ${skipped} كانت موجودة أصلًا، ${rejectedCategory} رُفضت لتصنيف غير موجود.`);
console.log(`مكونات: ${ingredientsResolved}/${ingredientsTotal} انحلّت لـfood_id حقيقي من foods.sqlite.`);
