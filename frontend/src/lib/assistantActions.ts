/**
 * بيانات قائمة "مساعد CJ" — بيانات تعداد بحتة (نفس استثناء MEAL_LABELS/WEEKDAY_LABELS بـ
 * translations.ts، خارج نظام t() لأن التطبيق عربي فقط أصلاً، صفر حاجة لتعدد لغات هنا).
 *
 * kind="chat": prompt نص عربي حرفي يُرسَل فعليًا لـ/chat (مو نص مترجَم — نفس القيد المعماري
 * الموثَّق بـChat.tsx/Sidebar.tsx: محرك النية يفهم عراقي فقط). كل prompt هنا مطابق لعبارة
 * تشغيل حقيقية بـintents.ts أو رسالة طبيعية يفهمها Gemini ACTIVE MODE + الأدوات الموجودة.
 * kind="navigate": to مسار Router — يُستخدَم لأي قدرة موجودة أصلاً بصفحة ثانية (رتبلي باقي
 * اليوم/Fix My Day -> /daily، وصفات دايت -> /recipes) بدل تكرار نفس منطق السعرات بالشات.
 */
import type { TranslationKey } from "../i18n/I18nContext";

export type AssistantActionKind = "chat" | "navigate";

export interface AssistantAction {
  icon: string;
  label: string;
  description?: string;
  kind: AssistantActionKind;
  prompt?: string;
  to?: string;
}

export interface AssistantGroup {
  key: string;
  titleKey: TranslationKey;
  actions: AssistantAction[];
}

export const ASSISTANT_GROUPS: AssistantGroup[] = [
  {
    key: "food",
    titleKey: "assistant.groupFood",
    actions: [
      { icon: "🍽️", label: "شنو آكل هسه؟", description: "اقتراح وجبة حسب سعراتك الحالية", kind: "chat", prompt: "شنو آكل هسه؟" },
      { icon: "📊", label: "شكد باقيلي؟", description: "شوف السعرات المتبقية اليوم", kind: "chat", prompt: "باقيلي شكد سعرات؟" },
      { icon: "🥗", label: "اقترحلي وجبة", kind: "chat", prompt: "اقترحلي وجبة" },
      { icon: "🍳", label: "اقترحلي فطور", kind: "chat", prompt: "اقترحلي فطور" },
      { icon: "🍗", label: "اقترحلي غداء", kind: "chat", prompt: "اقترحلي غداء" },
      { icon: "🌙", label: "اقترحلي عشاء", kind: "chat", prompt: "اقترحلي عشاء" },
      { icon: "🍿", label: "اقترحلي سناك", kind: "chat", prompt: "اقترحلي سناك" },
      { icon: "🪶", label: "أريد وجبة خفيفة", kind: "chat", prompt: "أريد وجبة خفيفة" },
      { icon: "🍖", label: "أريد وجبة مشبعة", kind: "chat", prompt: "أريد وجبة مشبعة" },
      { icon: "💪", label: "أريد وجبة عالية بالبروتين", kind: "chat", prompt: "أريد وجبة عالية بالبروتين" },
      { icon: "🎯", label: "أريد وجبة ضمن سعراتي المتبقية", kind: "chat", prompt: "أريد وجبة ضمن سعراتي المتبقية" },
      { icon: "🔄", label: "أريد بديل أخف", description: "بديل أقل سعرات لآخر طعام تحچينا عنه", kind: "chat", prompt: "أريد بديل أخف" },
      { icon: "💸", label: "أريد أكل بأقل سعرات", kind: "chat", prompt: "أريد أكل بأقل سعرات" },
    ],
  },
  {
    key: "recipes",
    titleKey: "assistant.groupRecipes",
    actions: [
      { icon: "🍳", label: "وصفات دايت", description: "تصفح كل الوصفات", kind: "navigate", to: "/recipes" },
      { icon: "🧑‍🍳", label: "وصفة من الموجود عندي", description: "خلّي Captain CJ يختار من مكوناتك", kind: "chat", prompt: "شنو أگدر أطبخ من الموجود عندي؟" },
      { icon: "❓", label: "شنو أطبخ؟", kind: "chat", prompt: "شنو أطبخ؟" },
      { icon: "⚡", label: "أريد وصفة سريعة", kind: "chat", prompt: "أريد وصفة سريعة" },
      { icon: "🇮🇶", label: "أريد وصفة عراقية أخف", kind: "chat", prompt: "أريد وصفة عراقية أخف" },
      { icon: "🍰", label: "أريد حلو دايت", kind: "chat", prompt: "أريد حلو دايت" },
      { icon: "🧊", label: "أريد مشروب بارد", kind: "chat", prompt: "أريد مشروب بارد" },
      { icon: "☕", label: "أريد مشروب حار", kind: "chat", prompt: "أريد مشروب حار" },
    ],
  },
  {
    key: "today",
    titleKey: "assistant.groupToday",
    actions: [
      { icon: "📋", label: "شكد أكلت اليوم؟", kind: "chat", prompt: "شكد أكلت اليوم؟" },
      { icon: "🍽️", label: "شنو الوجبات اللي سجلتها؟", kind: "chat", prompt: "شنو الوجبات اللي سجلتها اليوم؟" },
      { icon: "❗", label: "شنو ناقصني اليوم؟", kind: "chat", prompt: "شنو ناقصني اليوم؟" },
      { icon: "🛠️", label: "رتبلي باقي اليوم", description: "أعيد تنظيم وجباتك المتبقية", kind: "navigate", to: "/daily" },
      { icon: "🧭", label: "ساعدني أكمل يومي", kind: "navigate", to: "/daily" },
    ],
  },
  {
    key: "home",
    titleKey: "assistant.groupHome",
    actions: [
      { icon: "🍲", label: "اليوم عدنا دولمة", kind: "chat", prompt: "اليوم غدانا دولمة" },
      { icon: "🍚", label: "اليوم عدنا تمن", kind: "chat", prompt: "اليوم غدانا تمن" },
      { icon: "🍜", label: "اليوم عدنا مرق", kind: "chat", prompt: "اليوم غدانا مرق" },
      { icon: "🇮🇶", label: "أريد أكل عراقي", kind: "chat", prompt: "أريد أكل عراقي بيتي" },
      { icon: "📏", label: "شكد آكل من أكل البيت؟", kind: "chat", prompt: "شكد آكل من أكل البيت؟" },
      { icon: "🎯", label: "أخلي الغداء ضمن سعراتي المتبقية", kind: "chat", prompt: "أريد أخلي الغداء ضمن سعراتي المتبقية" },
    ],
  },
  {
    key: "tips",
    titleKey: "assistant.groupTips",
    actions: [
      { icon: "💡", label: "نصيحة غذائية", kind: "chat", prompt: "عطيني نصيحة" },
      { icon: "🧘", label: "شلون ألتزم؟", kind: "chat", prompt: "شلون ألتزم؟" },
      { icon: "📉", label: "شلون أقلل أكلي؟", kind: "chat", prompt: "شلون أقلل أكلي؟" },
      { icon: "🗂️", label: "شلون أرتب وجباتي؟", kind: "chat", prompt: "شلون أرتب وجباتي؟" },
      { icon: "☀️", label: "نصيحة لليوم", kind: "chat", prompt: "عطيني نصيحة لليوم" },
      { icon: "🔍", label: "نصيحة حسب أكلي اليوم", kind: "chat", prompt: "عطيني نصيحة حسب أكلي اليوم" },
    ],
  },
];
