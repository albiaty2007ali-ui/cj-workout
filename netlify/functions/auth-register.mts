/** POST /api/auth/register — يعادل auth.py's register(). */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { emailExists, createUser, signSession, buildSessionCookie } from "../../shared/nutrition-engine/auth.js";
import { validateName, validateEmail, validatePassword } from "../../shared/nutrition-engine/validation.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { sendWelcomeEmail, sendVerificationEmail } from "../../shared/nutrition-engine/emailService.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  let body: { name?: unknown; email?: unknown; password?: unknown; confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "جسم الطلب غير صالح.");
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirm = typeof body.confirm === "string" ? body.confirm : "";

  const errors: Record<string, string> = {};
  const nameErr = validateName(name);
  const emailErr = validateEmail(email);
  const passwordErr = validatePassword(password);
  if (nameErr) errors.name = nameErr;
  if (emailErr) errors.email = emailErr;
  if (passwordErr) errors.password = passwordErr;
  if (password !== confirm) errors.confirm = "كلمتا المرور غير متطابقتين";

  try {
    const db = getFirestore(getFirebaseApp());
    if (Object.keys(errors).length === 0 && (await emailExists(db, email))) {
      errors.email = "هذا البريد الإلكتروني مستخدم من قبل";
    }
    if (Object.keys(errors).length > 0) {
      return jsonError(400, "VALIDATION_ERROR", "تحقق من الحقول.", errors);
    }

    const { id, role, code } = await createUser(db, { name, email, password });

    try {
      await sendWelcomeEmail(email, name);
    } catch (e) {
      console.warn("welcome email failed:", e);
    }
    // فشل إرسال كود التحقق لا يوقف التسجيل (نفس قاعدة email failures never block the action)،
    // بس يبقى المستخدم غير مفعّل — زر "إعادة الإرسال" بشاشة التحقق يغطي حالة الفشل هذي.
    try {
      await sendVerificationEmail(email, name, code);
    } catch (e) {
      console.warn("verification email failed:", e);
    }

    // email_verified:false دائمًا هنا — التسجيل لا يمنح وصولاً فعليًا للتطبيق (شات/لوحة/تسجيل
    // وجبات) إلا بعد إدخال الكود، راجع auth-verify-email.mts + chat.mts/progress-daily.mts's حراس
    const token = signSession({ sub: id, role, email, email_verified: false });
    return jsonOk({ user_id: id }, { headers: { "Set-Cookie": buildSessionCookie(token) } });
  } catch (err) {
    console.error("auth-register error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
