/**
 * POST /api/feedback — أي مستخدم مسجّل دخول يرسل مقترح/بلاغ. Firestore مباشرة (بدون Repository)
 * نفس نمط admin-tips.mts — CRUD إداري بحت بلا منطق سعرات/أعمال يحتاج اختبار تكافؤ.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, genId, getUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

const VALID_TYPES = new Set(["bug", "suggestion", "other"]);

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const body = await req.json().catch(() => ({}));
  const type = typeof body.type === "string" && VALID_TYPES.has(body.type) ? body.type : "other";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 5) return jsonError(400, "VALIDATION_ERROR", "اكتب رسالة أوضح شوي (5 أحرف على الأقل).");

  try {
    const db = getFirestore(getFirebaseApp());
    const display = await getUserDisplayFields(db, claims.sub);
    const id = genId();
    await db.collection("feedback").doc(id).set({
      user_id: claims.sub, user_name: display?.name ?? "مستخدم",
      type, message, status: "new", created_at: new Date(),
    });
    return jsonOk({ ok: true });
  } catch (err) {
    console.error("feedback error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
