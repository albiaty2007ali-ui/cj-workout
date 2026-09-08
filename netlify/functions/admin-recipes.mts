/**
 * /api/admin/recipes — يعادل admin.py's مجموعة /admin/recipes الكاملة (وصفة/تصنيف/مكوّن/خطوة/
 * بديل)، بدون رفع صورة (Firebase Storage غير مُجهَّز بهذا المسار بعد — الوصفة بدون صورة تعرض
 * أيقونة بديلة دائمًا، مطابقة تمامًا لسلوك الأصل بـrecipe_hero_placeholder).
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, genId } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, isAdminClaims } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

function uniqueSlug(): string {
  return `recipe-${genId().slice(0, 8)}`;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");
  if (!isAdminClaims(claims)) return jsonError(403, "FORBIDDEN", "هذي الصفحة للإدارة فقط.");

  const db = getFirestore(getFirebaseApp());
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const id = url.searchParams.get("id") ?? "";

  try {
    if (req.method === "GET") {
      const [recipesSnap, categoriesSnap] = await Promise.all([
        db.collection("recipes").get(),
        db.collection("recipe_categories").orderBy("order_index").get(),
      ]);
      return jsonOk({
        recipes: recipesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        categories: categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    const body = await req.json().catch(() => ({}));

    if (action === "category-add") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const icon = typeof body.icon === "string" && body.icon.trim() ? body.icon.trim() : "🍽️";
      if (!name) return jsonError(400, "VALIDATION_ERROR", "لازم تكتب اسم التصنيف");
      const existing = await db.collection("recipe_categories").where("name", "==", name).limit(1).get();
      if (!existing.empty) return jsonError(400, "VALIDATION_ERROR", "فيه تصنيف أصلاً بنفس الاسم");
      const allCats = await db.collection("recipe_categories").get();
      const maxOrder = allCats.docs.reduce((m, d) => Math.max(m, d.data().order_index ?? 0), 0);
      const catId = genId();
      await db.collection("recipe_categories").doc(catId).set({ name, icon, order_index: maxOrder + 1 });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "recipe_category_added", target_id: catId, details: name, timestamp: new Date() });
      return jsonOk({ ok: true, id: catId });
    }

    if (action === "add") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const categoryId = typeof body.category_id === "string" ? body.category_id.trim() : "";
      if (name.length < 2 || !categoryId) return jsonError(400, "VALIDATION_ERROR", "لازم تدخل اسم الوصفة والتصنيف على الأقل");

      const recipeId = genId();
      await db.collection("recipes").doc(recipeId).set({
        name, slug: uniqueSlug(), description: typeof body.description === "string" ? (body.description.trim() || null) : null,
        category_id: categoryId, active: false,
        calories: Number(body.calories) || 0, protein: Number(body.protein) || 0, carbs: Number(body.carbs) || 0, fat: Number(body.fat) || 0,
        fiber: body.fiber ? Number(body.fiber) : null,
        prep_time_min: body.prep_time_min ? Number(body.prep_time_min) : null,
        cook_time_min: body.cook_time_min ? Number(body.cook_time_min) : null,
        servings: body.servings ? Number(body.servings) : 1,
        difficulty: typeof body.difficulty === "string" && body.difficulty ? body.difficulty : "easy",
        match_keywords: typeof body.match_keywords === "string" ? (body.match_keywords.trim() || null) : null,
        ingredients: [], steps: [], substitutions: [],
      });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "recipe_added", target_id: recipeId, details: name, timestamp: new Date() });
      return jsonOk({ ok: true, id: recipeId });
    }

    if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");
    const ref = db.collection("recipes").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, "NOT_FOUND", "الوصفة غير موجودة.");
    const data = doc.data()!;

    if (action === "update") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const categoryId = typeof body.category_id === "string" ? body.category_id.trim() : "";
      if (name.length < 2 || !categoryId) return jsonError(400, "VALIDATION_ERROR", "لازم تدخل اسم الوصفة والتصنيف على الأقل");

      await ref.update({
        name, category_id: categoryId, description: typeof body.description === "string" ? (body.description.trim() || null) : null,
        calories: Number(body.calories) || 0, protein: Number(body.protein) || 0, carbs: Number(body.carbs) || 0, fat: Number(body.fat) || 0,
        fiber: body.fiber ? Number(body.fiber) : null,
        prep_time_min: body.prep_time_min ? Number(body.prep_time_min) : null,
        cook_time_min: body.cook_time_min ? Number(body.cook_time_min) : null,
        servings: body.servings ? Number(body.servings) : 1,
        difficulty: typeof body.difficulty === "string" && body.difficulty ? body.difficulty : "easy",
        match_keywords: typeof body.match_keywords === "string" ? (body.match_keywords.trim() || null) : null,
      });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "recipe_updated", target_id: id, details: name, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    if (action === "toggle") {
      const ingredients = data.ingredients ?? [];
      const steps = data.steps ?? [];
      if (!data.active && (ingredients.length === 0 || steps.length === 0)) {
        return jsonError(400, "VALIDATION_ERROR", "لازم تضيف مكونات وخطوات قبل تفعيل الوصفة");
      }
      const newActive = !data.active;
      await ref.update({ active: newActive });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "recipe_toggled", target_id: id, details: `active=${newActive}`, timestamp: new Date() });
      return jsonOk({ ok: true, active: newActive });
    }

    if (action === "delete") {
      await ref.delete();
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "recipe_deleted", target_id: id, details: data.name, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    if (action === "ingredient-add") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return jsonError(400, "VALIDATION_ERROR", "لازم تكتب اسم المكوّن");
      const ingredients = [...(data.ingredients ?? []), {
        name, quantity: typeof body.quantity === "string" ? (body.quantity.trim() || null) : null,
        unit: typeof body.unit === "string" ? (body.unit.trim() || null) : null,
      }];
      await ref.update({ ingredients });
      return jsonOk({ ok: true });
    }

    if (action === "ingredient-delete") {
      const idx = Number(url.searchParams.get("index"));
      const ingredients = [...(data.ingredients ?? [])];
      if (Number.isInteger(idx) && idx >= 0 && idx < ingredients.length) ingredients.splice(idx, 1);
      await ref.update({ ingredients });
      return jsonOk({ ok: true });
    }

    if (action === "step-add") {
      const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
      if (!instruction) return jsonError(400, "VALIDATION_ERROR", "لازم تكتب نص الخطوة");
      const steps = [...(data.steps ?? [])];
      steps.push({
        step_number: steps.length + 1, instruction,
        duration: typeof body.duration === "string" ? (body.duration.trim() || null) : null,
        temperature: typeof body.temperature === "string" ? (body.temperature.trim() || null) : null,
        tip: typeof body.tip === "string" ? (body.tip.trim() || null) : null,
        warning: typeof body.warning === "string" ? (body.warning.trim() || null) : null,
      });
      await ref.update({ steps });
      return jsonOk({ ok: true });
    }

    if (action === "step-delete") {
      const idx = Number(url.searchParams.get("index"));
      const steps = [...(data.steps ?? [])];
      if (Number.isInteger(idx) && idx >= 0 && idx < steps.length) steps.splice(idx, 1);
      steps.forEach((s, i) => { s.step_number = i + 1; });
      await ref.update({ steps });
      return jsonOk({ ok: true });
    }

    if (action === "substitution-add") {
      const ingredientName = typeof body.ingredient_name === "string" ? body.ingredient_name.trim() : "";
      const replacement = typeof body.replacement === "string" ? body.replacement.trim() : "";
      if (!ingredientName || !replacement) return jsonError(400, "VALIDATION_ERROR", "لازم تكتب اسم المكوّن والبديل");
      const substitutions = [...(data.substitutions ?? []), { ingredient_name: ingredientName, replacement }];
      await ref.update({ substitutions });
      return jsonOk({ ok: true });
    }

    if (action === "substitution-delete") {
      const idx = Number(url.searchParams.get("index"));
      const substitutions = [...(data.substitutions ?? [])];
      if (Number.isInteger(idx) && idx >= 0 && idx < substitutions.length) substitutions.splice(idx, 1);
      await ref.update({ substitutions });
      return jsonOk({ ok: true });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("admin-recipes error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
