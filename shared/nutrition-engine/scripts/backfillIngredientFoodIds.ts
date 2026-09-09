/**
 * يحلّ food_id/required حقيقيَين لكل مكوّن بكل الوصفات النشطة الموجودة فعلاً بـFirestore —
 * مطلوب لأن ingredientResolver.ts (المرحلة 2) جديد، والوصفات الحالية (61) انكتبت قبله. سكربت
 * تصحيح Idempotent (يعيد نفس النتيجة بأي عدد تشغيلات، صفر ضرر من إعادة التشغيل).
 * required=false تلقائيًا فقط لو نص المكوّن (name أو unit) يحتوي فعليًا كلمة "اختياري" —
 * إشارة حقيقية موجودة بالبيانات أصلاً، صفر تخمين ثقافي/طبخي جديد.
 * شغّله بـ: npx vite-node shared/nutrition-engine/scripts/backfillIngredientFoodIds.ts
 */
import "dotenv/config";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../db/firestoreRepository.js";
import { resolveIngredientName } from "../ingredientResolver.js";
import type { RecipeIngredientRecord } from "../db/repository.js";

const db = getFirestore(getFirebaseApp());

const snap = await db.collection("recipes").get();
console.log(`قرأت ${snap.docs.length} وصفة من Firestore.`);

let recipesUpdated = 0;
let ingredientsResolved = 0;
let ingredientsUnresolved = 0;
let ingredientsOptional = 0;

for (const doc of snap.docs) {
  const data = doc.data();
  const ingredients: RecipeIngredientRecord[] = data.ingredients ?? [];
  if (ingredients.length === 0) continue;

  const resolvedIngredients: RecipeIngredientRecord[] = [];
  for (const ing of ingredients) {
    const resolution = await resolveIngredientName(ing.name);
    const isOptional = /اختياري/.test(`${ing.name} ${ing.unit ?? ""}`);
    if (resolution) ingredientsResolved++; else ingredientsUnresolved++;
    if (isOptional) ingredientsOptional++;
    resolvedIngredients.push({
      name: ing.name, quantity: ing.quantity, unit: ing.unit,
      food_id: resolution?.food_id ?? null,
      required: !isOptional,
    });
  }

  await doc.ref.update({ ingredients: resolvedIngredients });
  recipesUpdated++;
  console.log(`  ✅ ${data.name} — ${resolvedIngredients.filter((i) => i.food_id !== null).length}/${resolvedIngredients.length} مكوّن انحل`);
}

console.log(`\nخلص: ${recipesUpdated} وصفة انحدّثت. ${ingredientsResolved} مكوّن انحل لـfood_id حقيقي، ${ingredientsUnresolved} بقى بدون food_id (غير موجود بقاعدة foods.sqlite الصغيرة — متوقع)، ${ingredientsOptional} مكوّن اتعلّم اختياري.`);
