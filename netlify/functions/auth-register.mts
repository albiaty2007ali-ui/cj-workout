/** POST /api/auth/register — يعادل auth.py's register(). إرسال إيميل الترحيب غير منفَّذ هنا
 * بعد (طبقة email_service.py لسا ما تحوّلت) — التسجيل ينجح بدونه، مطابقًا لقاعدة "فشل الإيميل
 * لا يوقف الإجراء الحقيقي" الموثّقة بالأصل. */
import type { Context, Config } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { emailExists, createUser, signSession, buildSessionCookie } from "../../shared/nutrition-engine/auth.js";
import { validateName, validateEmail, validatePassword } from "../../shared/nutrition-engine/validation.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

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

    const { id, role } = await createUser(db, { name, email, password });
    const token = signSession({ sub: id, role });
    return jsonOk({ user_id: id }, { headers: { "Set-Cookie": buildSessionCookie(token) } });
  } catch (err) {
    console.error("auth-register error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};

export const config: Config = { path: "/.netlify/functions/auth-register" };
