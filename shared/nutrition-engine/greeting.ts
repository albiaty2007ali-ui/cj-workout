/**
 * منفذ حرفي من chat.py's build_greeting() — هذا كان موجود بالأصل قبل الهجرة (تحية ديناميكية
 * بحسب فترة اليوم ببغداد + حالة الوجبة المعنية اليوم: لسا ما انسألت / انسألت / انسجلت) وسقط
 * سهوًا أثناء بناء صفحة الشات React (Chat.tsx كان يعرض دايمًا رسالة فارغة ثابتة بدل هذا). يرجّع
 * نص التحية + أزرار اقتراح سريعة (label, prompt) تُعرض فوگ صندوق الكتابة وترسل رسالة شات حقيقية
 * عند الضغط — بالضبط نفس سلوك quick-prompts بـtemplates/chat.html الأصلي.
 */
import type { Repository } from "./db/repository.js";
import * as iraqTime from "./iraqTime.js";

const MEAL_LABELS_AR: Record<string, string> = { breakfast: "الفطور", lunch: "الغداء", dinner: "العشاء" };

export interface GreetingPrompt { label: string; prompt: string }
export interface Greeting { text: string; prompts: GreetingPrompt[] }

const GREETINGS: Record<string, Greeting> = {
  morning: {
    text: "صباح الخير كابتن 🌤️\nشنو وضع الريوك اليوم؟\nأكلت لو بعدك؟",
    prompts: [
      { label: "🍳 أكلت الريوك", prompt: "فطرت " },
      { label: "⏰ بعدني", prompt: "بعدني" },
      { label: "🍽️ اقترحلي ريوك", prompt: "اقترحلي فطور خفيف" },
    ],
  },
  noon: {
    text: "هلا كابتن 👋\nشلونك ويا الغدا؟\nتغديت لو بعدك؟",
    prompts: [
      { label: "🍚 تغديت", prompt: "تغديت " },
      { label: "⏰ بعدني", prompt: "بعدني" },
      { label: "🍽️ اقترحلي غدا", prompt: "اقترحلي غداء" },
    ],
  },
  evening: {
    text: "مساء الخير كابتن 🌙\nشنو وضع العشة اليوم؟\nتعشيت لو بعدك؟",
    prompts: [
      { label: "🍽️ تعشيت", prompt: "تعشيت " },
      { label: "⏰ بعدني", prompt: "بعدني" },
      { label: "🥗 اقترحلي عشة", prompt: "اقترحلي عشاء خفيف" },
    ],
  },
  late_night: {
    text: "بعدك صاحي كابتن؟ 🌙\nإذا ما متعشي، أگدر أقترحلك شي خفيف يناسب سعراتك المتبقية.",
    prompts: [
      { label: "🥗 اقترحلي شي خفيف", prompt: "اقترحلي عشاء خفيف" },
      { label: "😴 راح أنام", prompt: "راح أنام" },
    ],
  },
};

export async function buildGreeting(
  repo: Repository, userId: string, remainingCalories: number, now: Date = new Date(),
): Promise<Greeting> {
  const period = iraqTime.getCurrentPeriod(now);
  const mealType = iraqTime.relevantMealForPeriod(period);
  const today = iraqTime.todayBaghdadIso(now);

  const statusRow = await repo.findMealStatus(userId, today, mealType);
  const status = statusRow?.status ?? "not_started";

  if (status === "logged") {
    const label = MEAL_LABELS_AR[mealType] ?? mealType;
    return {
      text: `${label} مسجل ✓\nباقيلك اليوم ${Math.max(0, remainingCalories)} سعرة.`,
      prompts: [
        { label: "🔥 شكد باقيلي؟", prompt: "باقيلي شكد؟" },
        { label: "🍽️ شنو آكل هسه؟", prompt: "شنو آكل هسه؟" },
      ],
    };
  }

  if (status === "asked") {
    return {
      text: "هلا بيك مرة ثانية 👋 خبرني إذا سجلت شي جديد أو تحتاج اقتراح وجبة.",
      prompts: [
        { label: "🍽️ شنو آكل هسه؟", prompt: "شنو آكل هسه؟" },
        { label: "🔥 شكد باقيلي؟", prompt: "باقيلي شكد؟" },
      ],
    };
  }

  // not_started — أول مرة اليوم نسأل عن هذي الوجبة
  await repo.upsertMealStatus(userId, today, mealType, "asked");
  return GREETINGS[period] ?? GREETINGS.noon!;
}
