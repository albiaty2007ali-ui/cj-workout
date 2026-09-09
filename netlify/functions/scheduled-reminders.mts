/**
 * Netlify Scheduled Function — تذكيرات وجبات/ماي حقيقية بوقت ثابت (الفجوة الوحيدة الموثّقة
 * بالمشروع من نظام الإشعارات: "التذكيرات المجدولة... لسا غير مبنية"، محطات الستريك بس كانت
 * Event-driven فعليًا قبل هذا الملف). تشتغل كل 30 دقيقة (config.schedule).
 *
 * تبسيط مقصود عن أصل Python (nutrition_ai/notifications/scheduler.py): هناك breakfast_time/
 * lunch_time/dinner_time مخصصة لكل مستخدم — هنا نوافذ ساعات ثابتة (فطور 8-10ص، غداء 1-3م،
 * عشاء 7-9م بتوقيت بغداد). إضافة أوقات وجبات مخصصة لكل مستخدم تحتاج حقول بروفايل + واجهة
 * إعدادات جديدة بالكامل — خارج نطاق هذا الملف، بس أسهل توسعة لاحقة لو صارت مطلوبة فعليًا.
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

export const config: Config = { schedule: "*/30 * * * *" };

const MEAL_WINDOWS = [
  { key: "breakfast", startHour: 8, endHour: 10, title: "🍳 وكت الفطور!", body: "خبرني شنو فطرت اليوم 🌱" },
  { key: "lunch", startHour: 13, endHour: 15, title: "🍽️ وكت الغداء!", body: "لا تنسى تسجل غداءك، شنو تغديت؟" },
  { key: "dinner", startHour: 19, endHour: 21, title: "🌙 وكت العشاء!", body: "شنو راح تتعشى اليوم؟ خبرني حتى أحسبلك." },
] as const;

// نافذة تذكير الماي (استيقاظ نموذجي) — توزيع خطي بسيط لهدف اليوم عبر هذي الساعات، صفر تعقيد إضافي.
const WATER_WAKE_START = 9;
const WATER_WAKE_END = 21;

export default async (_req: Request, _context: Context): Promise<Response> => {
  const db = getFirestore(getFirebaseApp());
  const repo = new FirestoreRepository();
  const now = new Date();
  const { hour } = nowBaghdad(now);
  const today = todayBaghdadIso(now);

  // صفر فايدة نفحص مستخدم بلا اشتراك Push حقيقي أصلاً — نبني لائحة المستخدمين المشتركين فقط.
  const subsSnap = await db.collection("push_subscriptions").get();
  const userIds = [...new Set(subsSnap.docs.map((d) => d.data().user_id as string))];

  let mealSent = 0;
  let waterSent = 0;

  for (const userId of userIds) {
    const settings = await getSettings(db, userId);
    if (!settings.enabled) continue;

    const mealWindow = MEAL_WINDOWS.find((w) => hour >= w.startHour && hour < w.endHour);
    if (mealWindow && canSendNow(settings, "MEAL_REMINDER", now)) {
      const statusRow = await repo.findMealStatus(userId, today, mealWindow.key);
      const status = statusRow?.status ?? "not_started";
      if (status !== "logged") {
        await sendNotification(db, userId, "MEAL_REMINDER", `${mealWindow.key}_${today}`, "/chat", mealWindow.title, mealWindow.body);
        mealSent++;
      }
    }

    if (hour >= WATER_WAKE_START && hour < WATER_WAKE_END && canSendNow(settings, "WATER", now)) {
      const profile = await repo.findNutritionProfile(userId);
      if (profile && profile.water_target_ml > 0) {
        const waterMl = await calculator.todayWaterMl(repo, userId, now);
        const elapsedFraction = (hour - WATER_WAKE_START) / (WATER_WAKE_END - WATER_WAKE_START);
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
  }

  return new Response(JSON.stringify({ ok: true, checked: userIds.length, mealSent, waterSent }), {
    headers: { "Content-Type": "application/json" },
  });
};
