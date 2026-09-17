/**
 * /api/profile/photo — رفع صورة بروفايل حقيقية إلى Firebase Storage (لم يكن منفَّذًا إطلاقًا
 * قبل هذا — راجع تعليق profile.mts القديم). العميل يرسل صورة **مصغَّرة ومقصوصة مربّعة أصلًا
 * من طرف المتصفح** (Canvas API، Profile.tsx) — صفر معالجة صور هنا (صفر sharp/تبعية Node جديدة،
 * صفر مخاطرة Native Binary مع esbuild bundler، نفس الدرس الموثَّق بـfoodDb.ts's قرار sql.js).
 *
 * الوصول لـStorage حصرًا عبر Admin SDK هنا (يتجاوز storage.rules أصلًا) — العميل لا يملك أي
 * SDK Firebase مباشر، نفس نمط Firestore الحالي بكل هذا المشروع.
 */
import type { Context } from "@netlify/functions";
import { getStorage } from "firebase-admin/storage";
import {
  FirestoreRepository, getFirebaseApp, FIREBASE_STORAGE_BUCKET, updateUserDisplayFields,
} from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { getFirestore } from "firebase-admin/firestore";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — سخي جدًا مقارنة بحجم صورة 512px الفعلي المتوقَّع (عادة <200KB)

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
  const ext = ALLOWED_CONTENT_TYPES[contentType];
  if (!ext) {
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
    return jsonError(400, "VALIDATION_ERROR", "حجم الصورة غير صالح (الحد الأقصى 5 ميغابايت).");
  }

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    const bucket = getStorage(getFirebaseApp()).bucket();
    // مسار ثابت لكل مستخدم (صفر امتداد قديم متراكم) — رفعة جديدة تستبدل القديمة تلقائيًا
    const path = `profile-photos/${claims.sub}.${ext}`;
    const file = bucket.file(path);
    await file.save(buffer, { contentType, metadata: { cacheControl: "public, max-age=3600" } });
    await file.makePublic();
    const photoUrl = `https://storage.googleapis.com/${FIREBASE_STORAGE_BUCKET}/${path}?v=${Date.now()}`;

    const db = getFirestore(getFirebaseApp());
    await updateUserDisplayFields(db, claims.sub, { photo_url: photoUrl });

    return jsonOk({ photo_url: photoUrl });
  } catch (err) {
    console.error("profile-photo error:", err);
    return jsonError(500, "INTERNAL_ERROR", "تعذّر رفع الصورة، جرب مرة ثانية.");
  }
};
