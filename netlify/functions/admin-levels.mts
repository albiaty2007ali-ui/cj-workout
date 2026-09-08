/** /api/admin/levels — يعادل admin.py's /admin/levels (+/add/+/update/+/delete). */
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
      const snap = await db.collection("levels").orderBy("level", "asc").get();
      return jsonOk({ levels: snap.docs.map((d) => d.data()) });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    const body = await req.json().catch(() => ({}));

    if (action === "add") {
      const level = Number(body.level);
      const requiredXp = Number(body.required_xp);
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!Number.isInteger(level) || !Number.isInteger(requiredXp)) {
        return jsonError(400, "VALIDATION_ERROR", "رقم المستوى والـXP المطلوب لازم يكونون أرقام صحيحة");
      }
      const ref = db.collection("levels").doc(String(level));
      if ((await ref.get()).exists) return jsonError(400, "VALIDATION_ERROR", "هذا المستوى موجود أصلاً — عدّله بدل إضافته من جديد");
      if (!title) return jsonError(400, "VALIDATION_ERROR", "لازم تكتب عنوان للمستوى");

      const reward = typeof body.reward === "string" && body.reward.trim() ? body.reward.trim() : null;
      await ref.set({ level, required_xp: requiredXp, title, reward });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "level_added", target_id: String(level), details: title, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    const levelParam = url.searchParams.get("level") ?? "";
    if (!levelParam) return jsonError(400, "VALIDATION_ERROR", "level مطلوب.");
    const ref = db.collection("levels").doc(levelParam);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, "NOT_FOUND", "المستوى غير موجود.");

    if (action === "update") {
      const patch: Record<string, unknown> = {};
      if (Number.isInteger(Number(body.required_xp))) patch.required_xp = Number(body.required_xp);
      if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
      patch.reward = typeof body.reward === "string" && body.reward.trim() ? body.reward.trim() : null;
      await ref.update(patch);
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "level_updated", target_id: levelParam, details: patch.title ?? doc.data()?.title, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    if (action === "delete") {
      await ref.delete();
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "level_deleted", target_id: levelParam, details: doc.data()?.title, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("admin-levels error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
