/** /api/admin/payments — يعادل payments.py's /admin/payments (+/verify/+/reject). */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, genId, getUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, isAdminClaims } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { sendPaymentConfirmedEmail, sendPaymentRejectedEmail } from "../../shared/nutrition-engine/emailService.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");
  if (!isAdminClaims(claims)) return jsonError(403, "FORBIDDEN", "هذي الصفحة للإدارة فقط.");

  const db = getFirestore(getFirebaseApp());
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const id = url.searchParams.get("id") ?? "";

  try {
    if (req.method === "GET") {
      const snap = await db.collection("payments").where("status", "==", "pending_manual_review").get();
      const payments = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        const display = await getUserDisplayFields(db, data.user_id);
        return { id: d.id, ...data, user_name: display?.name ?? "", created_at: data.created_at?.toDate?.() ?? data.created_at };
      }));
      payments.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return jsonOk({ payments });
    }

    if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم GET أو POST.");
    if (!id) return jsonError(400, "VALIDATION_ERROR", "id مطلوب.");

    const ref = db.collection("payments").doc(id);
    const doc = await ref.get();
    if (!doc.exists) return jsonError(404, "NOT_FOUND", "العملية غير موجودة.");
    const payment = doc.data()!;
    if (payment.status !== "pending_manual_review") {
      return jsonError(400, "ALREADY_REVIEWED", "تمت مراجعة هذه العملية مسبقًا");
    }

    const display = await getUserDisplayFields(db, payment.user_id);
    const now = new Date();

    if (action === "verify") {
      const planSnap = await db.collection("plans").where("code", "==", payment.plan_code).limit(1).get();
      const durationDays = planSnap.empty ? 30 : (planSnap.docs[0]!.data().duration_days ?? 30);
      const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

      const subId = genId();
      await db.collection("subscriptions").doc(subId).set({
        user_id: payment.user_id, plan_code: payment.plan_code, status: "active",
        start_date: now, end_date: endDate, created_at: now, last_payment_id: id,
      });
      await ref.update({ status: "completed", reviewed_by: claims.sub, reviewed_at: now, completed_at: now });
      await db.collection("admin_logs").doc(genId()).set({
        admin_id: claims.sub, action: "payment_verified", target_id: id,
        details: `user=${payment.user_id} amount=${payment.amount}`, timestamp: now,
      });

      if (display?.email) {
        try {
          await sendPaymentConfirmedEmail(display.email, display.name ?? "", payment.amount, endDate.toISOString().slice(0, 10));
        } catch (e) { console.warn("payment confirmation email failed:", e); }
      }
      return jsonOk({ ok: true });
    }

    if (action === "reject") {
      const body = await req.json().catch(() => ({}));
      const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "لم يتم تحديد سبب";
      await ref.update({ status: "rejected", reviewed_by: claims.sub, reviewed_at: now, rejection_reason: reason });
      await db.collection("admin_logs").doc(genId()).set({ admin_id: claims.sub, action: "payment_rejected", target_id: id, details: reason, timestamp: now });

      if (display?.email) {
        try {
          await sendPaymentRejectedEmail(display.email, display.name ?? "", reason);
        } catch (e) { console.warn("payment rejection email failed:", e); }
      }
      return jsonOk({ ok: true });
    }

    return jsonError(400, "VALIDATION_ERROR", "action غير معروف.");
  } catch (err) {
    console.error("admin-payments error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
