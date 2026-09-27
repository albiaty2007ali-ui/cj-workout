/**
 * POST /api/chat — يعادل chat.py's api_chat بالإنتاج الحالي. Netlify Function v2 (Web-standard
 * Request/Response). Stateless بالكامل — كل الحالة (pending_meal_json، إلخ) تُقرأ/تُكتب من
 * Postgres عبر PostgresRepository بكل استدعاء، بدون أي متغير Module-level قابل للتغيّر.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { handleMessage } from "../../shared/nutrition-engine/orchestrator.js";
import { authenticateRequest, isEmailVerified, checkBanStatus } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { sendNotification } from "../../shared/nutrition-engine/notifications/engine.js";
import { getProvider } from "../../shared/nutrition-engine/provider.js";

interface NewMilestone { days: number; label: string; xp_reward: number }

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");
  }

  const claims = authenticateRequest(req);
  if (!claims) {
    return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");
  }
  // طلب أمني صريح: صفر وصول للشات (وبالتالي تسجيل الوجبات عبره) قبل تأكيد البريد
  if (!isEmailVerified(claims)) {
    return jsonError(403, "EMAIL_NOT_VERIFIED", "أكّد بريدك الإلكتروني أول حتى تگدر تستخدم الشات.");
  }
  // فحص حظر حقيقي أثناء الجلسة (حزمة تطوير الحظر) — لا يكفي فحص تسجيل الدخول وحده لأن JWT
  // صالح 14 يوم؛ حساب يُحظَر أثناء جلسة فعّالة لازم يُمنع فورًا، طلب صريح بالمواصفة.
  const banStatus = await checkBanStatus(getFirestore(getFirebaseApp()), claims.sub);
  if (banStatus.banned) {
    return jsonError(403, "ACCOUNT_BANNED", "هذا الحساب محظور.", {
      reason: banStatus.reason ?? "", expires_at: banStatus.expires_at ?? "", permanent: String(banStatus.permanent),
    });
  }

  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "جسم الطلب غير صالح.");
  }

  const text = typeof body.message === "string" ? body.message : "";
  if (!text.trim()) {
    return jsonError(400, "VALIDATION_ERROR", "الرسالة فاضية.");
  }

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) {
      return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");
    }

    const result = await handleMessage(repo, user, text);

    if (result.premium_required) {
      return jsonError(402, "TRIAL_EXHAUSTED", "خلصت وجباتك المجانية. تحتاج اشتراك لتكملة التسجيل.");
    }

    // صياغة اختيارية عبر Gemini — لا تلمس أي رقم، فقط تنويع الجملة. تُتخطى بأمان بدون
    // GEMINI_API_KEY (getProvider() ترجع NullAIProvider)، ولا ترمي أبدًا ولا تعطّل الرد الأصلي.
    // تُتخطى أيضًا صراحة لو الرد أصلًا صادر من طبقة المحادثة الجديدة (GEMINI_CONVERSATIONAL_
    // MODE=ACTIVE، علامة _composed_by_gemini) — نداء Gemini ثانٍ لتنويع نص Gemini نفسه زائد
    // بلا فائدة (تكلفة/زمن إضافي مجانًا)، راجع orchestrator.ts's assembleActiveResult.
    const composedByGemini = Boolean((result as { _composed_by_gemini?: boolean })._composed_by_gemini);
    delete (result as { _composed_by_gemini?: boolean })._composed_by_gemini;
    const provider = getProvider();
    if (!composedByGemini && result.reply && provider.isAvailable()) {
      const rephrased = await provider.rephrase(result.reply, { kind: result.meal_logged ? "meal_logged" : "chat_reply" });
      if (rephrased) result.reply = rephrased;
    }

    // Push حقيقي لأي محطة Streak جديدة — Best-effort دائمًا (sendNotification لا ترمي، ولا تؤخر
    // إرسال رد الشات نفسه لو فشلت). await عمدًا (مو fire-and-forget) — بيئة Serverless ما تضمن
    // إكمال عمل بالخلفية بعد رجوع الاستجابة (قرار مقصود من قبل، لم يُعاد النظر فيه بمرحلة
    // Gemini-First: هذا الفرع نادر أصلًا — يعمل فقط عند عبور محطة Streak حقيقية، مو بكل رسالة —
    // فتكلفته الزمنية على الحالة الشائعة صفرية، وسلامة تسليم الـPush أهم من توفير ms نادرة).
    const newMilestones = result.new_milestones as NewMilestone[] | undefined;
    if (newMilestones && newMilestones.length > 0) {
      const db = getFirestore(getFirebaseApp());
      for (const m of newMilestones) {
        await sendNotification(db, claims.sub, "STREAK", `streak_${m.days}`, "/profile", "🔥 محطة جديدة!", `${m.label} — +${m.xp_reward} XP`);
      }
    }

    return jsonOk(result);
  } catch (err) {
    // لا نكشف تفاصيل الخطأ الداخلي للمستخدم أبدًا — تُسجَّل بـLogs فقط (console.error يصل Netlify Logs)
    console.error("chat function error:", err);
    return jsonError(500, "INTERNAL_ERROR", "صار خطأ غير متوقع، جرب مرة ثانية.");
  }
};
