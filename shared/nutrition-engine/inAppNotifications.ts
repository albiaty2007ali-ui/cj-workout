/**
 * نظام الرسائل المنبثقة الذكية داخل التطبيق (حزمة تطوير الإشعارات) — موازٍ لـnotifications/
 * engine.ts (ذاك خاص حصرًا بـWeb Push، 4 فئات فقط: meals/water/streak/tips). هذا كتالوج أوسع
 * (ترحيب/تذكير وجبة/تذكير تسجيل/Streak/XP/وصفات/ميزة جديدة/اشتراك/تشجيع/ماء) بقاعدة أصرم:
 * "مرة وحدة للأبد" لكل id (مو cooldown قابل للتكرار كالـpush)، + سقف يومي وفاصل زمني أدنى عام
 * بين أي رسالتين حتى لا يظهر أكثر من رسالة بجلسة واحدة قصيرة.
 */
import { todayBaghdadIso } from "./iraqTime.js";

export interface InAppNotifContext {
  account_age_days: number;
  is_premium: boolean;
  streak_days: number;
  meals_logged_today: number;
  water_ml: number;
  water_target_ml: number;
  remaining_calories: number;
  period: string; // getConversationalPeriod
}

export interface InAppNotifEntry {
  id: string;
  category: "welcome" | "meal_reminder" | "log_reminder" | "streak" | "xp" | "recipes" | "new_feature" | "subscription" | "encouragement" | "water";
  text: string;
  condition: (ctx: InAppNotifContext) => boolean;
}

export const MIN_INTERVAL_MINUTES = 240; // 4 ساعات بين أي رسالتين، بغض النظر عن نوعهما
export const MAX_PER_DAY = 2;

export const IN_APP_CATALOG: InAppNotifEntry[] = [
  {
    id: "welcome_001", category: "welcome",
    text: "هلا بيك بـ CJ FOOD 🎉 لو احتجت أي مساعدة، مساعد CJ موجود دائمًا بالقائمة الجانبية.",
    condition: (ctx) => ctx.account_age_days <= 1,
  },
  {
    id: "meal_reminder_001", category: "meal_reminder",
    text: "هسه تقريبًا وقت الغداء 🍽️ لا تنسى تسجّل وجبتك.",
    condition: (ctx) => ctx.period === "noon" && ctx.meals_logged_today === 0,
  },
  {
    id: "log_reminder_001", category: "log_reminder",
    text: "اليوم خلص تقريبًا، لا تنسى تسجّل وجباتك قبل لا تنام 🌙",
    condition: (ctx) => ctx.account_age_days >= 1 && ctx.meals_logged_today === 0 && (ctx.period === "night" || ctx.period === "late_night"),
  },
  {
    id: "streak_001", category: "streak",
    text: "3 أيام التزام متواصل! 🔥 استمر وراح توصل لأسبوع كامل.",
    condition: (ctx) => ctx.streak_days >= 3 && ctx.streak_days < 7,
  },
  {
    id: "streak_002", category: "streak",
    text: "أسبوع كامل التزام! 🏆 فخورين فيك كابتن.",
    condition: (ctx) => ctx.streak_days >= 7,
  },
  {
    id: "xp_001", category: "xp",
    text: "تعرف؟ كل وجبة تسجّلها تعطيك XP حقيقي يرفّعك بالمستوى 📈",
    condition: (ctx) => ctx.account_age_days >= 3,
  },
  {
    id: "recipes_001", category: "recipes",
    text: "جرّبت قسم وصفات دايت؟ وصفات حقيقية بسعرات وبروتين واضح 🍳",
    condition: (ctx) => ctx.account_age_days >= 2,
  },
  {
    id: "new_feature_001", category: "new_feature",
    text: "جديد: تكدر تختار ثيم مميز من الإعدادات لو مشترك 🎨",
    condition: () => true,
  },
  {
    id: "subscription_001", category: "subscription",
    text: "تحب تفتح كل ميزات CJ FOOD؟ الاشتراك يفتحلك Recovery Day وثيمات مميزة وأكثر 💎",
    condition: (ctx) => !ctx.is_premium && ctx.account_age_days >= 5,
  },
  {
    id: "encouragement_001", category: "encouragement",
    text: "لسا ما سجّلت أي وجبة اليوم، خلّينا نبدأ ونشوف وين وصلت 💪",
    condition: (ctx) => ctx.meals_logged_today === 0 && (ctx.period === "evening" || ctx.period === "maghrib"),
  },
  {
    id: "water_001", category: "water",
    text: "خذ بالك من الماي كابتن 💧 لسا ما شربت الكافي اليوم.",
    condition: (ctx) => ctx.water_target_ml > 0 && ctx.water_ml < ctx.water_target_ml * 0.3 && (ctx.period === "noon" || ctx.period === "afternoon"),
  },
];

/**
 * يختار الرسالة التالية المؤهَّلة، أو null لو ماكو شي مناسب الآن. نقية بالكامل (صفر I/O) —
 * الطلبات (سقف يومي/فاصل زمني/الشرط) والـstorage مسؤولية المستدعي (notifications-inapp.mts).
 */
export function pickNextInAppNotification(
  catalog: InAppNotifEntry[],
  shown: { id: string; at: Date }[],
  ctx: InAppNotifContext,
  now: Date,
): InAppNotifEntry | null {
  const shownIds = new Set(shown.map((s) => s.id));
  const todayIso = todayBaghdadIso(now);
  const todayCount = shown.filter((s) => todayBaghdadIso(s.at) === todayIso).length;
  if (todayCount >= MAX_PER_DAY) return null;

  const lastAt = shown.reduce<Date | null>((max, s) => (!max || s.at.getTime() > max.getTime() ? s.at : max), null);
  if (lastAt && now.getTime() - lastAt.getTime() < MIN_INTERVAL_MINUTES * 60 * 1000) return null;

  for (const entry of catalog) {
    if (shownIds.has(entry.id)) continue;
    if (entry.condition(ctx)) return entry;
  }
  return null;
}
