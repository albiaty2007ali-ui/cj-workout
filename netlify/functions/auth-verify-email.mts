/**
 * POST /api/auth/verify-email — يتحقق كود التحقق (6 أرقام) المُرسَل بالتسجيل، يفعّل الحساب،
 * ويعيد توقيع جلسة جديدة بـemail_verified:true (JWT الحالي ثابت لا يتغيّر لحاله).
 * POST ?action=resend — يرسل كود جديد (محمي بفترة تهدئة 60 ثانية، auth.ts's resendVerificationCode).
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, getUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, verifyEmailCode, resendVerificationCode, signSession, buildSessionCookie } from "../../shared/nutrition-engine/auth.js";
import { sendVerificationEmail } from "../../shared/nutrition-engine/emailService.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const db = getFirestore(getFirebaseApp());
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "resend") {
      const result = await resendVerificationCode(db, claims.sub);
      if (!result.ok) {
        if (result.error === "ALREADY_VERIFIED") return jsonError(400, "ALREADY_VERIFIED", "بريدك مؤكَّد أصلًا.");
        return jsonError(429, "TOO_SOON", `انتظر ${result.retry_after_seconds} ثانية قبل إعادة الإرسال.`, { retry_after_seconds: String(result.retry_after_seconds) });
      }
      const display = await getUserDisplayFields(db, claims.sub);
      try {
        await sendVerificationEmail(claims.email, display?.name ?? "", result.code!);
      } catch (e) {
        console.warn("resend verification email failed:", e);
      }
      return jsonOk({ ok: true });
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return jsonError(400, "VALIDATION_ERROR", "أدخل كود مكوّن من 6 أرقام.");

    const result = await verifyEmailCode(db, claims.sub, code);
    if (!result.ok) {
      const messages = { INVALID_CODE: "الكود غير صحيح.", EXPIRED: "انتهت صلاحية الكود، اطلب كودًا جديدًا.", ALREADY_VERIFIED: "بريدك مؤكَّد أصلًا." };
      return jsonError(400, result.error ?? "VALIDATION_ERROR", messages[result.error ?? "INVALID_CODE"]);
    }

    // إعادة توقيع الجلسة بـemail_verified:true — الكوكي القديمة تحمل false بشكل ثابت داخل
    // التوقيع نفسه، الطريقة الوحيدة لتحديثها فعليًا هي إصدار JWT جديد (نفس نمط login/register)
    const token = signSession({ sub: claims.sub, role: claims.role, email: claims.email, email_verified: true });
    return jsonOk({ ok: true }, { headers: { "Set-Cookie": buildSessionCookie(token) } });
  } catch (err) {
    console.error("auth-verify-email error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
