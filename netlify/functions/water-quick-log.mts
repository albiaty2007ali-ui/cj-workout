/**
 * POST /api/water/quick-log — نداء واحد بلا جسم (body)، يُستدعى من frontend/public/sw.js's
 * notificationclick لما المستخدم يضغط زر "✅ شربت كوب" على إشعار تذكير الماي مباشرة (بدون فتح
 * الموقع). كمية ثابتة (كوب واحد) لأن الإشعار ما يگدر يسأل "شكد شربت" — نفس قرار توثيقي بالطلب
 * الأصلي. يعيد استخدام runWaterLoggingPipeline (نفس مسار أداة log_water بالشات) حرفيًا عبر نص
 * عربي جاهز يمرّ بـparseWaterMl، صفر منطق تسجيل ماي مكرَّر هنا.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { runWaterLoggingPipeline } from "../../shared/nutrition-engine/orchestrator.js";
import { authenticateRequest, isEmailVerified, checkBanStatus } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");

  const claims = authenticateRequest(req);
  if (!claims) return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");
  if (!isEmailVerified(claims)) {
    return jsonError(403, "EMAIL_NOT_VERIFIED", "أكّد بريدك الإلكتروني أول.");
  }
  const banStatus = await checkBanStatus(getFirestore(getFirebaseApp()), claims.sub);
  if (banStatus.banned) return jsonError(403, "ACCOUNT_BANNED", "هذا الحساب محظور.");

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");

    const result = await runWaterLoggingPipeline(repo, user, "كوب ماي");
    return jsonOk({ reply: result.reply });
  } catch (err) {
    console.error("water-quick-log error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع.");
  }
};
