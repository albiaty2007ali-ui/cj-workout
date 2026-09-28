/**
 * POST /api/chat — محادثة Gemini مباشرة (النظام الجديد بالكامل، يحل محل المحرك المحلي القديم
 * كشف-نية/orchestrator/dispatch). **صفر منطق تسجيل/تعديل هنا** — هذا الملف لا يستدعي
 * finalizeMeal/runWaterLoggingPipeline/أي دالة تكتب بيانات إطلاقًا. المسار الوحيد: auth →
 * بناء Context للقراءة فقط → نداء Gemini وحيد بلا Tools (geminiChat.ts) → { reply }.
 */
import type { Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreRepository, getFirebaseApp, getUserDisplayFields } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { authenticateRequest, isEmailVerified, checkBanStatus } from "../../shared/nutrition-engine/auth.js";
import { jsonOk, jsonError } from "../../shared/nutrition-engine/httpResponse.js";
import { todayTotals } from "../../shared/nutrition-engine/calculator.js";
import { xpProgress } from "../../shared/nutrition-engine/levels.js";
import { callGeminiChat, type ChatHistoryTurn } from "../../shared/nutrition-engine/geminiChat.js";

const MAX_HISTORY_TURNS = 20;
const CHAT_ERROR_MESSAGE = "صار عندي خلل مؤقت بالاتصال، حاول مرة ثانية.";

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "استخدم POST فقط.");
  }

  const claims = authenticateRequest(req);
  if (!claims) {
    return jsonError(401, "UNAUTHENTICATED", "يجب تسجيل الدخول.");
  }
  if (!isEmailVerified(claims)) {
    return jsonError(403, "EMAIL_NOT_VERIFIED", "أكّد بريدك الإلكتروني أول حتى تگدر تستخدم الشات.");
  }
  const banStatus = await checkBanStatus(getFirestore(getFirebaseApp()), claims.sub);
  if (banStatus.banned) {
    return jsonError(403, "ACCOUNT_BANNED", "هذا الحساب محظور.", {
      reason: banStatus.reason ?? "", expires_at: banStatus.expires_at ?? "", permanent: String(banStatus.permanent),
    });
  }

  let body: { message?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "جسم الطلب غير صالح.");
  }

  const text = typeof body.message === "string" ? body.message : "";
  if (!text.trim()) {
    return jsonError(400, "VALIDATION_ERROR", "الرسالة فاضية.");
  }

  // history تُرسَل من العميل نفسه (React state) — الخدمة عديمة الحالة بالكامل، صفر حفظ محادثة
  // بالسيرفر. نتحقق من الشكل بدل الثقة العمياء بجسم الطلب.
  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: ChatHistoryTurn[] = rawHistory
    .filter((t): t is { role: unknown; text: unknown } => typeof t === "object" && t !== null)
    .map((t) => ({
      role: t.role === "assistant" ? "assistant" as const : "user" as const,
      text: typeof t.text === "string" ? t.text : "",
    }))
    .filter((t) => t.text.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS);

  try {
    const repo = new FirestoreRepository();
    const user = await repo.findUser(claims.sub);
    if (!user) {
      return jsonError(404, "USER_NOT_FOUND", "الحساب غير موجود.");
    }

    const [profile, display, levels, dayTotals] = await Promise.all([
      repo.findNutritionProfile(claims.sub),
      getUserDisplayFields(getFirestore(getFirebaseApp()), claims.sub),
      repo.listLevels(),
      todayTotals(repo, claims.sub),
    ]);

    const progress = xpProgress(levels, user.xp);
    const remaining = profile ? profile.calorie_target - dayTotals.calories : null;

    const result = await callGeminiChat(text, history, {
      displayName: display?.name || "كابتن",
      age: profile?.age ?? null,
      currentWeight: profile?.weight_kg ?? null,
      goal: profile?.goal ?? null,
      calorieTarget: profile?.calorie_target ?? null,
      remainingCalories: remaining,
      level: progress.level,
      levelTitle: progress.title,
      streakDays: user.streak_days,
      isPremium: user.is_premium,
    });

    if (result.error || !result.reply) {
      return jsonOk({ reply: CHAT_ERROR_MESSAGE, is_system_error: true });
    }

    return jsonOk({ reply: result.reply });
  } catch (err) {
    console.error("chat function error:", err);
    return jsonOk({ reply: CHAT_ERROR_MESSAGE, is_system_error: true });
  }
};
