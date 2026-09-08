/** POST /api/auth/login — يعادل auth.py's login(). */
import type { Context, Config } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { findUserCredentialsByEmail, checkPassword, signSession, buildSessionCookie } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "جسم الطلب غير صالح.");
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return jsonError(400, "VALIDATION_ERROR", "البريد وكلمة المرور مطلوبان.");

  try {
    const db = getFirestore(getFirebaseApp());
    const user = await findUserCredentialsByEmail(db, email);

    if (!user || !checkPassword(password, user.password_hash)) {
      return jsonError(401, "INVALID_CREDENTIALS", "البريد الإلكتروني أو كلمة المرور غير صحيحة");
    }
    if (user.disabled) {
      return jsonError(403, "ACCOUNT_DISABLED", "هذا الحساب معطّل، تواصل مع الإدارة");
    }

    const token = signSession({ sub: user.id, role: user.role });
    return jsonOk({ user_id: user.id }, { headers: { "Set-Cookie": buildSessionCookie(token) } });
  } catch (err) {
    console.error("auth-login error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};

export const config: Config = { path: "/.netlify/functions/auth-login" };
