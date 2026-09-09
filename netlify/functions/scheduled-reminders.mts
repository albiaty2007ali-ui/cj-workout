/**
 * Netlify Scheduled Function — تذكيرات وجبات/ماي حقيقية. تشتغل كل 30 دقيقة (config.schedule).
 *
 * نوافذ ثابتة افتراضية (فطور 8-10ص، غداء 1-3م، عشاء 7-9م بتوقيت بغداد) — **لو المستخدم ضبط
 * جدول نوم حقيقي** (wake_time/sleep_time بالإعدادات، المرحلة 4 من ذكاء Captain CJ)، تُستبدل
 * بنوافذ محسوبة فعليًا من جدول نومه عبر mealTimingEngine.ts (fallback حرفي للثابتة بدون ذلك،
 * صفر كسر لمن ما ضبط جدول نوم).
 *
 * Recovery/Flexible Day: يوم استثنائي مفعّل صراحة (recovery_days) يوقف تذكيرات الوجبات لنفس
 * اليوم فقط — صفر تأثير على XP/Streak/السجل (هذا الملف أصلاً ما يستدعي أي من تلك الأنظمة).
 *
 * كل تذكير يمر عبر نفس canSendNow/sendNotification الحقيقيين (engine.ts) — يحترم enabled +
 * تصنيف meals/water + ساعات الهدوء + Idempotency (dedup_key فريد لكل يوم/فئة)، بالضبط نفس
 * الضمانات المستخدمة أصلاً لمحطات الستريك.
 */
import type { Config, Context } from "@netlify/functions";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseApp, FirestoreRepository } from "../../shared/nutrition-engine/db/firestoreRepository.js";
import { getSettings, canSendNow, sendNotification } from "../../shared/nutrition-engine/notifications/engine.js";
import { nowBaghdad, todayBaghdadIso } from "../../shared/nutrition-engine/iraqTime.js";
import * as calculator from "../../shared/nutrition-engine/calculator.js";
import { mealWindowsForSchedule, waterWindowForSchedule, isWithinMinuteRange, type SleepSchedule } from "../../shared/nutrition-engine/mealTimingEngine.js";
import { checkStreakRisk } from "../../shared/nutrition-engine/patternDetection.js";

export const config: Config = { schedule: "*/30 * * * *" };

const MEAL_COPY: Record<"breakfast" | "lunch" | "dinner", { title: string; body: string }> = {
  breakfast: { title: "🍳 وكت الفطور!", body: "خبرني شنو فطرت اليوم 🌱" },
  lunch: { title: "🍽️ وكت الغداء!", body: "لا تنسى تسجل غداءك، شنو تغديت؟" },
  dinner: { title: "🌙 وكت العشاء!", body: "شنو راح تتعشى اليوم؟ خبرني حتى أحسبلك." },
};

// نوافذ افتراضية ثابتة (بتوقيت بغداد) — تُستخدم فقط لمن لسا ما ضبط جدول نوم حقيقي بالإعدادات.
const DEFAULT_MEAL_WINDOWS = [
  { key: "breakfast" as const, startMinuteOfDay: 8 * 60, endMinuteOfDay: 10 * 60 },
  { key: "lunch" as const, startMinuteOfDay: 13 * 60, endMinuteOfDay: 15 * 60 },
  { key: "dinner" as const, startMinuteOfDay: 19 * 60, endMinuteOfDay: 21 * 60 },
];
const DEFAULT_WATER_WINDOW = { startMinuteOfDay: 9 * 60, endMinuteOfDay: 21 * 60 };

function windowLengthMinutes(range: { startMinuteOfDay: number; endMinuteOfDay: number }): number {
  return range.endMinuteOfDay > range.startMinuteOfDay
    ? range.endMinuteOfDay - range.startMinuteOfDay
    : (24 * 60 - range.startMinuteOfDay) + range.endMinuteOfDay;
}

export default async (_req: Request, _context: Context): Promise<Response> => {
  const db = getFirestore(getFirebaseApp());
  const repo = new FirestoreRepository();
  const now = new Date();
  const { hour, minute } = nowBaghdad(now);
  const nowMinuteOfDay = hour * 60 + minute;
  const today = todayBaghdadIso(now);

  // صفر فايدة نفحص مستخدم بلا اشتراك Push حقيقي أصلاً — نبني لائحة المستخدمين المشتركين فقط.
  const subsSnap = await db.collection("push_subscriptions").get();
  const userIds = [...new Set(subsSnap.docs.map((d) => d.data().user_id as string))];

  let mealSent = 0;
  let waterSent = 0;
  let streakRiskSent = 0;

  for (const userId of userIds) {
    const settings = await getSettings(db, userId);
    if (!settings.enabled) continue;

    const sleepSchedule: SleepSchedule | null = settings.wake_time && settings.sleep_time
      ? { wake_time: settings.wake_time, sleep_time: settings.sleep_time } : null;
    const mealWindows = sleepSchedule ? mealWindowsForSchedule(sleepSchedule) : DEFAULT_MEAL_WINDOWS;
    const waterWindow = sleepSchedule ? waterWindowForSchedule(sleepSchedule) : DEFAULT_WATER_WINDOW;

    // يوم مرن/استثنائي مفعّل صراحة (المرحلة 4) -> يوقف تذكيرات وقت الوجبات لنفس اليوم فقط،
    // صفر تأثير على XP/Streak (هذا الملف أصلاً ما يستدعي أي من تلك الأنظمة).
    const recoveryActive = (await repo.findRecoveryDay(userId, today)) !== null;

    const mealWindow = !recoveryActive ? mealWindows.find((w) => isWithinMinuteRange(nowMinuteOfDay, w)) : undefined;
    if (mealWindow && canSendNow(settings, "MEAL_REMINDER", now)) {
      const statusRow = await repo.findMealStatus(userId, today, mealWindow.key);
      const status = statusRow?.status ?? "not_started";
      if (status !== "logged") {
        const copy = MEAL_COPY[mealWindow.key];
        await sendNotification(db, userId, "MEAL_REMINDER", `${mealWindow.key}_${today}`, "/chat", copy.title, copy.body);
        mealSent++;
      }
    }

    if (isWithinMinuteRange(nowMinuteOfDay, waterWindow) && canSendNow(settings, "WATER", now)) {
      const profile = await repo.findNutritionProfile(userId);
      if (profile && profile.water_target_ml > 0) {
        const waterMl = await calculator.todayWaterMl(repo, userId, now);
        let elapsedMinutes = nowMinuteOfDay - waterWindow.startMinuteOfDay;
        if (elapsedMinutes < 0) elapsedMinutes += 24 * 60;
        const elapsedFraction = elapsedMinutes / windowLengthMinutes(waterWindow);
        const expectedByNow = profile.water_target_ml * elapsedFraction;
        // دِدوب باليوم+الساعة (مو باليوم بس) — يسمح بتذكير كل شوي لو المستخدم فعليًا متأخر
        // كثير، بس أبدًا مو أكثر من مرة بنفس الساعة (نفس ضمان Idempotency الموجود أصلاً).
        if (waterMl < expectedByNow * 0.5) {
          await sendNotification(
            db, userId, "WATER", `${today}_${hour}`, "/chat",
            "💧 خذ رشفة ماي", "ما وصلت نص هدفك اليومي من الماي بعد — كوب وحد هسه يفيدك.",
          );
          waterSent++;
        }
      }
    }
    // خطر انقطاع Streak حقيقي (المرحلة 5) — فحص مستقل عن الوجبات/الماي، مرة وحدة باليوم عبر dedup_key.
    if (canSendNow(settings, "STREAK_RISK", now)) {
      const [user, todayBehavior] = await Promise.all([
        repo.findUser(userId), repo.findBehaviorDaily(userId, today),
      ]);
      const risk = user ? checkStreakRisk(user, todayBehavior, now) : null;
      if (risk) {
        await sendNotification(db, userId, "STREAK_RISK", `streak_risk_${today}`, "/chat", "🔥 خطر ينكسر الستريك!", risk.message);
        streakRiskSent++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, checked: userIds.length, mealSent, waterSent, streakRiskSent }), {
    headers: { "Content-Type": "application/json" },
  });
};
