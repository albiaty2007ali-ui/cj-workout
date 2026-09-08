/**
 * POST /api/auth/forgot-password — يعادل auth.py's forgot_password(). يرجّع نجاح دائمًا (منع
 * Email Enumeration) — الإيميل يُرسل فقط إذا الحساب موجود فعلًا.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { getFirebaseApp, genId } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { hashPassword } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { sendPasswordResetEmail } from "../../shared/nutrition-engine/emailService.js";

const TOKEN_LIFETIME_MS = 30 * 60 * 1000;

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  try {
    const db = getFirestore(getFirebaseApp());
    if (email) {
      const snap = await db.collection("users").where("email", "==", email).limit(1).get();
      if (!snap.empty) {
        const user = snap.docs[0]!;
        const rawToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
        const tokenId = genId();
        await db.collection("password_reset_tokens").doc(tokenId).set({
          user_id: user.id, token_hash: hashPassword(rawToken),
          expires_at: new Date(Date.now() + TOKEN_LIFETIME_MS), used: false, created_at: new Date(),
        });

        const origin = req.headers.get("origin") ?? new URL(req.url).origin;
        const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(rawToken)}&uid=${encodeURIComponent(user.id)}`;
        try {
          await sendPasswordResetEmail(email, resetUrl);
        } catch (e) {
          console.warn("reset email failed:", e);
        }
      }
    }
    return jsonOk({ sent: true });
  } catch (err) {
    console.error("auth-forgot-password error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
