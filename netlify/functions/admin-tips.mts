/**
 * /api/admin/tips — يعادل admin.py's /admin/tips (+/add/+/toggle/+/delete)، مجمّعة بـFunction
 * واحدة تفرّق حسب method + action (نفس نمط settings.mts). Firestore مباشرة (بدون Repository)
 * لأن هذا CRUD إداري بحت بلا منطق أعمال يحتاج اختبار تكافؤ مع InMemoryRepository.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, genId } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, isAdminClaims } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");
  if (!isAdminClaims(claims)) return jsonError(403, "FORBIDDEN", "هذي الصفحة للإدارة فقط.");

  const db = getFirestore(getFirebaseApp());
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (req.method === "GET") {
      const snap = await db.collection("nutrition_tips").get();
      const tips = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (a.category > b.category ? 1 : a.category < b.category ? -1 : b.priority - a.priority));
      const categories = Array.from(new Set(tips.map((t: any) => t.category))).sort();
      return jsonOk({ tips, categories });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    const body = await req.json().catch(() => ({}));

    if (action === "add") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      const category = typeof body.category === "string" ? body.category.trim() : "";
      if (text.length < 5 || !category) return jsonError(400, "VALIDATION_ERROR", "لازم تكتب نص النصيحة والتصنيف على الأقل");

      const id = genId();
      await db.collection("nutrition_tips").doc(id).set({
        text, category,
        meal_type: typeof body.meal_type === "string" && body.meal_type.trim() ? body.meal_type.trim() : null,
        goal: typeof body.goal === "string" && body.goal.trim() ? body.goal.trim() : null,
        time_period: typeof body.time_period === "string" && body.time_period.trim() ? body.time_period.trim() : null,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
        active: true, created_by: claims.sub,
      });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "tip_added", target_id: id, details: category, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    const id = url.searchParams.get("id") ?? "";
    if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");
    const ref = db.collection("nutrition_tips").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, "NOT_FOUND", "النصيحة غير موجودة.");

    if (action === "toggle") {
      const newActive = !(doc.data()?.active);
      await ref.update({ active: newActive });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "tip_toggled", target_id: id, details: `active=${newActive}`, timestamp: new Date() });
      return jsonOk({ ok: true, active: newActive });
    }

    if (action === "delete") {
      await ref.delete();
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "tip_deleted", target_id: id, details: doc.data()?.category, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("admin-tips error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
