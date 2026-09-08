/**
 * /api/subscribe — يعادل payments.py's subscribe() (بدون رفع صورة إثبات — Firebase Storage غير
 * مُجهَّز بهذا المسار؛ رابط واتساب يبقى القناة الأساسية لإرسال صورة التحويل، تمامًا كتصميم الأصل
 * حيث الصورة اختيارية أصلًا). GET يرجّع رقم الكارت والسعر ورابط واتساب؛ POST ينشئ Payment.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, genId, getUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

function whatsappLink(name: string, reference: string): string {
  const number = process.env.SUPPORT_WHATSAPP_NUMBER;
  if (!number) return "";
  let msg = `هلا، أنا ${name}. أرسلت تحويل اشتراك CJ WORKOUT.`;
  if (reference) msg += ` الرقم المرجعي: ${reference}`;
  msg += " (هذا الإثبات مرفق بالصورة)";
  return `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
}

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");

  const cardNumber = process.env.MANUAL_PAYMENT_CARD_NUMBER ?? "";
  const cardNetwork = process.env.MANUAL_PAYMENT_CARD_NETWORK ?? "";
  const price = Number(process.env.SUBSCRIPTION_PRICE_IQD ?? "10000");

  try {
    const db = getFirestore(getFirebaseApp());

    if (req.method === "GET") {
      const display = await getUserDisplayFields(db, claims.sub);
      return jsonOk({ card_number: cardNumber, card_network: cardNetwork, price, whatsapp_link: whatsappLink(display?.name ?? "", "") });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");

    const body = await req.json().catch(() => ({}));
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (reference.length < 3) return jsonError(400, "VALIDATION_ERROR", "أدخل رقمًا مرجعيًا صحيحًا لعملية التحويل");

    const id = genId();
    await db.collection("payments").doc(id).set({
      user_id: claims.sub, plan_code: "monthly", amount: price, currency: "IQD",
      method: "manual_card_transfer", status: "pending_manual_review",
      transfer_reference: reference, user_note: note || null,
      reviewed_by: null, reviewed_at: null, rejection_reason: null, completed_at: null,
      created_at: new Date(),
    });

    const display = await getUserDisplayFields(db, claims.sub);
    return jsonOk({ submitted: true, whatsapp_link: whatsappLink(display?.name ?? "", reference) });
  } catch (err) {
    console.error("subscribe error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
