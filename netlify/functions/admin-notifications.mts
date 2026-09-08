/**
 * /api/admin/notifications — يعادل admin.py's /admin/notifications (+/add/+/toggle/+/delete).
 * قوالب فقط (نفس هذا الملف بايثون) — تسليم Push الفعلي غير مُفعَّل بهذا المسار بعد (راجع
 * NETLIFY_MIGRATION_AUDIT.md: البنية التحتية للـScheduler لم تُنقل بعد لبيئة Netlify).
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
      const snap = await db.collection("notification_templates").get();
      const templates = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a: any, b: any) => (a.category > b.category ? 1 : a.category < b.category ? -1 : b.priority - a.priority));
      const categories = Array.from(new Set(templates.map((t: any) => t.category))).sort();
      return jsonOk({ templates, categories });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    const body = await req.json().catch(() => ({}));

    if (action === "add") {
      const category = typeof body.category === "string" ? body.category.trim() : "";
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (!category || title.length < 2 || text.length < 5) {
        return jsonError(400, "VALIDATION_ERROR", "لازم تكتب التصنيف والعنوان ونص الإشعار على الأقل");
      }
      const id = genId();
      await db.collection("notification_templates").doc(id).set({
        category, title, body: text,
        meal_type: typeof body.meal_type === "string" && body.meal_type.trim() ? body.meal_type.trim() : null,
        goal: typeof body.goal === "string" && body.goal.trim() ? body.goal.trim() : null,
        priority: Number.isFinite(Number(body.priority)) ? Number(body.priority) : 0,
        cooldown_minutes: Number.isFinite(Number(body.cooldown_minutes)) ? Number(body.cooldown_minutes) : 0,
        active: true,
      });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "notification_template_added", target_id: id, details: category, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    const id = url.searchParams.get("id") ?? "";
    if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");
    const ref = db.collection("notification_templates").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, "NOT_FOUND", "القالب غير موجود.");

    if (action === "toggle") {
      const newActive = !(doc.data()?.active);
      await ref.update({ active: newActive });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "notification_template_toggled", target_id: id, details: `active=${newActive}`, timestamp: new Date() });
      return jsonOk({ ok: true, active: newActive });
    }

    if (action === "delete") {
      await ref.delete();
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "notification_template_deleted", target_id: id, details: doc.data()?.category, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("admin-notifications error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
