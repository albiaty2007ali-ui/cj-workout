/** /api/admin/streak-milestones — يعادل admin.py's /admin/streak-milestones (+/add/+/toggle/+/delete). */
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
      const snap = await db.collection("streak_milestones").orderBy("days", "asc").get();
      return jsonOk({ milestones: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    const body = await req.json().catch(() => ({}));

    if (action === "add") {
      const days = Number(body.days);
      const xpReward = Number.isFinite(Number(body.xp_reward)) ? Number(body.xp_reward) : 0;
      const label = typeof body.label === "string" ? body.label.trim() : "";
      if (!Number.isInteger(days)) return jsonError(400, "VALIDATION_ERROR", "عدد الأيام ومكافأة الـXP لازم يكونون أرقام صحيحة");
      if (!label) return jsonError(400, "VALIDATION_ERROR", "لازم تكتب وصف للمحطة");

      const existing = await db.collection("streak_milestones").where("days", "==", days).limit(1).get();
      if (!existing.empty) return jsonError(400, "VALIDATION_ERROR", "فيه محطة أصلاً بنفس عدد الأيام");

      const id = genId();
      await db.collection("streak_milestones").doc(id).set({ days, xp_reward: xpReward, label, active: true });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "milestone_added", target_id: id, details: label, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    const id = url.searchParams.get("id") ?? "";
    if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");
    const ref = db.collection("streak_milestones").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, "NOT_FOUND", "المحطة غير موجودة.");

    if (action === "toggle") {
      const newActive = !(doc.data()?.active);
      await ref.update({ active: newActive });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "milestone_toggled", target_id: id, details: `active=${newActive}`, timestamp: new Date() });
      return jsonOk({ ok: true, active: newActive });
    }

    if (action === "delete") {
      await ref.delete();
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "milestone_deleted", target_id: id, details: doc.data()?.label, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("admin-streak-milestones error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
