/**
 * /api/admin/feedback — استعراض مقترحات/بلاغات المستخدمين (feedback.mts) + تعليمها كمراجَعة أو
 * حذفها. نفس نمط admin-tips.mts بالضبط (Firestore مباشرة، GET+POST؟action=).
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
      const snap = await db.collection("feedback").get();
      const items = snap.docs
        .map((d) => {
          const data = d.data() as Record<string, unknown> & { created_at?: { toDate?: () => Date } };
          return { id: d.id, ...data, created_at: data.created_at?.toDate?.() ?? data.created_at };
        })
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      return jsonOk({ items });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    const id = url.searchParams.get("id") ?? "";
    if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");
    const ref = db.collection("feedback").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, "NOT_FOUND", "البلاغ غير موجود.");

    if (action === "review") {
      await ref.update({ status: "reviewed" });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "feedback_reviewed", target_id: id, details: null, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    if (action === "delete") {
      await ref.delete();
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "feedback_deleted", target_id: id, details: null, timestamp: new Date() });
      return jsonOk({ ok: true });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("admin-feedback error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
