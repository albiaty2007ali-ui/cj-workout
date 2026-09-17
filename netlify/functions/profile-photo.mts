/**
 * /api/profile/photo — رفع صورة بروفايل. العميل يرسل صورة **مصغَّرة ومقصوصة مربّعة أصلًا من
 * طرف المتصفح** (Canvas API، Profile.tsx، ~512px JPEG) — صفر معالجة صور هنا.
 *
 * تُخزَّن كـData URI (Base64) مباشرة بحقل photo_url بمستند المستخدم على Firestore، بدل
 * Firebase Storage — اللي يتطلب ترقية المشروع لخطة Blaze (بطاقة دفع) وهذا غير متاح حاليًا.
 * صفر تبعية سحابية جديدة، يعيد استخدام Firestore الموجود أصلًا بكل هذا المشروع. الحد الأقصى
 * للحجم صارم (500KB بعد فك الترميز) حتى لا يقترب مستند المستخدم من حد Firestore (1 ميغابايت)
 * — صورة 512px JPEG حقيقية عادة أصغر من هذا بكثير (30-80KB).
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp, updateUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 500 * 1024;

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  let body: { image_base64?: unknown; content_type?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "جسم الطلب غير صالح.");
  }

  const contentType = typeof body.content_type === "string" ? body.content_type : "";
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return jsonError(400, "VALIDATION_ERROR", "نوع الصورة غير مدعوم — JPEG أو PNG أو WebP فقط.");
  }
  const base64 = typeof body.image_base64 === "string" ? body.image_base64 : "";
  if (!base64) return jsonError(400, "VALIDATION_ERROR", "صفر صورة مُرسَلة.");

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "ترميز الصورة غير صالح.");
  }
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    return jsonError(400, "VALIDATION_ERROR", "حجم الصورة كبير جدًا (الحد الأقصى 500 كيلوبايت بعد التصغير).");
  }

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    const photoUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
    const db = getFirestore(getFirebaseApp());
    await updateUserDisplayFields(db, claims.sub, { photo_url: photoUrl });

    return jsonOk({ photo_url: photoUrl });
  } catch (err) {
    console.error("profile-photo error:", err);
    return jsonError(500, "INTERNAL_ERROR", "تعذّر رفع الصورة، جرب مرة ثانية.");
  }
};
