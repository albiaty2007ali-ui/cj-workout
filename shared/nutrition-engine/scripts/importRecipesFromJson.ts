/**
 * سكربت استيراد دفعة وصفات من ملف JSON خارجي (مسار الاستيراد "Import Pipeline" — المرحلة 4 من
 * "الذكاء الغذائي الذكي") — يقرأ ملف JSON (مصفوفة RecipeImportEntry، انظر recipeImportSchema.ts)،
 * يتحقق من كل عنصر (Validation)، يتخطى أي slug موجود مسبقًا بـFirestore (Dedup)، يتحقق من منطقية
 * الماكروز مقابل السعرات (Nutrition sanity check ضمن validateRecipeEntry)، ثم يكتب الوصفات
 * الصالحة فقط لـFirestore. نفس نمط الكتابة بالضبط المستخدم بـseedExtraRecipes.ts.
 *
 * الاستخدام: npx vite-node shared/nutrition-engine/scripts/importRecipesFromJson.ts <path/to/file.json>
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, genId } from "../db/firestoreRepository.js";
import { validateRecipeEntry, type RecipeImportEntry } from "./recipeImportSchema.js";

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

let added = 0, skipped = 0, rejectedCategory = 0;
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
  await db.collection("recipes").doc(genId()).set({
    name: r.name, slug: r.slug, description: r.description, category_id: categoryId,
    active: true, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber,
    prep_time_min: r.prep_time_min, cook_time_min: r.cook_time_min, servings: r.servings, difficulty: r.difficulty,
    match_keywords: r.match_keywords.join("|"),
    ingredients: r.ingredients,
    steps: r.steps.map((s, idx) => ({ ...s, step_number: idx + 1 })),
    substitutions: Object.entries(r.substitutions).map(([ingredient_name, replacement]) => ({ ingredient_name, replacement })),
  });
  added++;
  console.log(`  ✅ ${r.name}`);
}

console.log(`\nخلص: ${added} وصفة انزرعت، ${skipped} كانت موجودة أصلًا، ${rejectedCategory} رُفضت لتصنيف غير موجود.`);
