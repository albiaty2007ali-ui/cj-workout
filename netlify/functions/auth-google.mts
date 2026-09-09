/**
 * POST /api/auth/google — تسجيل دخول/تسجيل حساب عبر Google (Google Identity Services، id_token
 * حقيقي من المتصفح). يتحقق التوقيع/الجمهور عبر google-auth-library ضد GOOGLE_CLIENT_ID الحقيقي
 * — صفر ثقة بأي بيانات من الفرونت إند غير الـid_token نفسه.
 *
 * دمج الحسابات: لو البريد (المتحقق فعليًا عبر email_verified من Google) موجود مسبقًا بحساب
 * بريد/كلمة مرور عادي، نربط google_id على نفس الحساب وندخله مباشرة (نفس XP/سجل الوجبات) — بدل
 * إنشاء حساب مكرر. حساب جديد بالكامل (بدون كلمة مرور محلية، password_hash: null) لو البريد غير
 * موجود أصلاً — auth-login.mts يرفض أي محاولة دخول بكلمة مرور لحساب من هذا النوع بأمان.
 */
import type { Context } from "@netlify/functions";
import { OAuth2Client } from "google-auth-library";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { findUserCredentialsByEmail, createUserFromGoogle, signSession, buildSessionCookie } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { sendWelcomeEmail } from "../../shared/nutrition-engine/emailService.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return jsonError(503, "NOT_CONFIGURED", "تسجيل الدخول عبر Google غير مُفعَّل بهذا الموقع بعد.");

  let body: { id_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "جسم الطلب غير صالح.");
  }

  const idToken = typeof body.id_token === "string" ? body.id_token : "";
  if (!idToken) return jsonError(400, "VALIDATION_ERROR", "id_token مطلوب.");

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      return jsonError(401, "INVALID_TOKEN", "تعذّر التحقق من حساب Google.");
    }

    const email = payload.email.trim().toLowerCase();
    const name = payload.name?.trim() || email.split("@")[0]!;
    const googleId = payload.sub;

    const db = getFirestore(getFirebaseApp());
    const existing = await findUserCredentialsByEmail(db, email);

    if (existing) {
      if (existing.disabled) return jsonError(403, "ACCOUNT_DISABLED", "هذا الحساب معطّل، تواصل مع الإدارة");
      await db.collection("users").doc(existing.id).set({ google_id: googleId }, { merge: true });
      const token = signSession({ sub: existing.id, role: existing.role, email });
      return jsonOk({ user_id: existing.id }, { headers: { "Set-Cookie": buildSessionCookie(token) } });
    }

    const { id, role } = await createUserFromGoogle(db, { name, email, google_id: googleId });
    try {
      await sendWelcomeEmail(email, name);
    } catch (e) {
      console.warn("welcome email failed:", e);
    }
    const token = signSession({ sub: id, role, email });
    return jsonOk({ user_id: id }, { headers: { "Set-Cookie": buildSessionCookie(token) } });
  } catch (err) {
    console.error("auth-google error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
