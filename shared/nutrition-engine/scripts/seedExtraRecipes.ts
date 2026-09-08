/**
 * يزرع EXTRA_RECIPES_SEED (40 وصفة حقيقية من USDA MyPlate Kitchen) بالإضافة للـ4 الأصلية —
 * Idempotent فعليًا بمعرّف الـslug (مو بفحص "المجموعة فاضية" مثل seedFirestoreData.ts، لأن
 * recipes فيها بيانات أصلًا) — يتحقق قبل كل وصفة إذا موجودة، يتخطاها لو موجودة، يضيفها لو لا.
 */
import "dotenv/config";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, genId } from "../db/firestoreRepository.js";
import { EXTRA_RECIPES_SEED } from "./extraRecipesSeed.js";

const db = getFirestore(getFirebaseApp());

const categoriesSnap = await db.collection("recipe_categories").get();
const categoryIdByName: Record<string, string> = {};
categoriesSnap.docs.forEach((d) => { categoryIdByName[d.data().name] = d.id; });
console.log("تصنيفات موجودة:", Object.keys(categoryIdByName).join("، "));

let added = 0, skipped = 0;
for (const r of EXTRA_RECIPES_SEED) {
  const categoryId = categoryIdByName[r.category];
  if (!categoryId) {
    console.warn(`  ⚠️ تصنيف غير موجود: ${r.category}، تخطّي وصفة ${r.name}`);
    continue;
  }
  const existing = await db.collection("recipes").where("slug", "==", r.slug).limit(1).get();
  if (!existing.empty) {
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

console.log(`\nخلص: ${added} وصفة انزرعت، ${skipped} كانت موجودة أصلًا وتُخطّت.`);
