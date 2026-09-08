/** POST /api/auth/reset-password — يعادل auth.py's reset_password() (فرع الإرسال فقط). */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { hashPassword, checkPassword } from "../../shared/nutrition-engine/auth.js";
import { validatePassword } from "../../shared/nutrition-engine/validation.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const uid = typeof body.uid === "string" ? body.uid : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";

  if (!token || !uid) return jsonError(400, "INVALID_TOKEN", "رابط إعادة التعيين غير صالح أو منتهي.");

  const passwordErr = validatePassword(password);
  if (passwordErr) return jsonError(400, "VALIDATION_ERROR", passwordErr);
  if (password !== confirm) return jsonError(400, "VALIDATION_ERROR", "كلمتا المرور غير متطابقتين");

  try {
    const db = getFirestore(getFirebaseApp());
    const snap = await db.collection("password_reset_tokens")
      .where("user_id", "==", uid).where("used", "==", false)
      .orderBy("created_at", "desc").get();

    const now = Date.now();
    const validDoc = snap.docs.find((d) => {
      const data = d.data();
      const expiresAt = data.expires_at?.toDate?.() ?? new Date(data.expires_at);
      return expiresAt.getTime() > now && checkPassword(token, data.token_hash);
    });

    if (!validDoc) return jsonError(400, "INVALID_TOKEN", "رابط إعادة التعيين غير صالح أو منتهي.");

    await db.collection("users").doc(uid).update({ password_hash: hashPassword(password) });
    await validDoc.ref.update({ used: true });

    return jsonOk({ ok: true });
  } catch (err) {
    console.error("auth-reset-password error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
