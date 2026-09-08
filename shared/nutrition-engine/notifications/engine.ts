/**
 * منفذ مبسّط من nutrition_ai/notifications/engine.py — منطق القرار (هل نرسل الآن؟) وتخزين
 * تفضيلات المستخدم الحقيقية. Firestore مباشرة (بدون Repository) بنفس مبرر admin-*.mts —
 * هذا CRUD/قرار بسيط، مو منطق أعمال يحتاج اختبار تكافؤ مع InMemoryRepository.
 *
 * تبسيط مقصود عن الأصل: 15 تصنيف إشعار فردي بالأصل (BREAKFAST/LUNCH/... إلخ) تجمّعت هنا لـ4
 * مفاتيح تحكم بالإعدادات (meals/water/streak/tips) — أوضح للمستخدم بواجهة واحدة، وكل تصنيف خام
 * (مثلاً "STREAK") يُطابَق لمجموعته عبر CATEGORY_GROUP. ما زالت تفضيلات حقيقية تُحفَظ وتُفحَص —
 * صفر UI وهمي.
 */
import type { Firestore } from "firebase-admin/firestore";
import { nowBaghdad } from "../iraqTime.js";
import { sendPush, type PushSubscriptionJson } from "./push.js";

export type NotificationGroup = "meals" | "water" | "streak" | "tips";

const CATEGORY_GROUP: Record<string, NotificationGroup> = {
  BREAKFAST: "meals", LUNCH: "meals", DINNER: "meals", SNACK: "meals", MEAL_REMINDER: "meals",
  WATER: "water", HYDRATION: "water",
  STREAK: "streak", XP: "streak", MOTIVATION: "streak", CONSISTENCY: "streak",
  RECIPE: "tips", PROGRESS: "tips", RETURN: "tips", DAILY_SUMMARY: "tips",
};

export interface NotificationSettings {
  enabled: boolean;
  meals: boolean;
  water: boolean;
  streak: boolean;
  tips: boolean;
  quiet_hours_start: number | null; // 0-23، أو null = بدون ساعات هدوء
  quiet_hours_end: number | null;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false, meals: true, water: true, streak: true, tips: true,
  quiet_hours_start: 22, quiet_hours_end: 8,
};

export async function getSettings(db: Firestore, userId: string): Promise<NotificationSettings> {
  const doc = await db.collection("notification_settings").doc(userId).get();
  if (!doc.exists) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(doc.data() as Partial<NotificationSettings>) };
}

export async function updateSettings(db: Firestore, userId: string, patch: Partial<NotificationSettings>): Promise<void> {
  await db.collection("notification_settings").doc(userId).set(patch, { merge: true });
}

function isQuietHour(settings: NotificationSettings, hour: number): boolean {
  const { quiet_hours_start: start, quiet_hours_end: end } = settings;
  if (start === null || end === null) return false;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // نطاق يلف منتصف الليل (مثلاً 22 → 8)
}

export function canSendNow(settings: NotificationSettings, category: string, now: Date = new Date()): boolean {
  if (!settings.enabled) return false;
  const group = CATEGORY_GROUP[category];
  if (group && !settings[group]) return false;
  const { hour } = nowBaghdad(now);
  if (isQuietHour(settings, hour)) return false;
  return true;
}

/**
 * نقطة الدخول الوحيدة لإرسال إشعار حقيقي — Best-effort دائمًا (لا يرمي، لا يوقف أي إجراء حقيقي
 * مستدعي). dedupKey يمنع التكرار (مثلاً "streak_7" — نفس المستخدم ما يوصله نفس الإشعار مرتين لنفس
 * المحطة) عبر معرّف وثيقة حتمي بـFirestore (.create() يرمي لو موجود، نتجاهله بهدوء = تكرار مقصود).
 */
export async function sendNotification(
  db: Firestore, userId: string, category: string, dedupKey: string, url: string, title: string, body: string,
): Promise<void> {
  try {
    const settings = await getSettings(db, userId);
    if (!canSendNow(settings, category, new Date())) return;

    const dedupId = `${userId}_${category}_${dedupKey}`;
    try {
      await db.collection("sent_notifications").doc(dedupId).create({
        user_id: userId, category, dedup_key: dedupKey, sent_at: new Date(),
      });
    } catch {
      return; // موجود أصلاً — أُرسل سابقًا، لا نكرره
    }

    const subsSnap = await db.collection("push_subscriptions").where("user_id", "==", userId).get();
    for (const doc of subsSnap.docs) {
      const data = doc.data();
      const subscription: PushSubscriptionJson = { endpoint: data.endpoint, keys: data.keys };
      const ok = await sendPush(subscription, { title, body, url });
      if (!ok) {
        // ما نقدر نميّز سبب الفشل هنا (sendPush يبتلع التفاصيل) — حذف الاشتراكات المنتهية فعليًا
        // يصير بمسار push-subscribe.mts نفسه عند إعادة الاشتراك، تبسيط مقصود لتفادي تعقيد إضافي.
      }
    }
  } catch (err) {
    console.warn("sendNotification failed (best-effort, ignored):", err);
  }
}
