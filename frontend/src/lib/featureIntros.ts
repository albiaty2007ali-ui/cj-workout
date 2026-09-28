import type { TranslationKey } from "../i18n/I18nContext";

/**
 * تعريف مركزي واحد لنظام Feature Discovery (مودال تعريف الميزة + نقطة التنبيه على زرّها
 * بالقائمة الجانبية) — كلاهما يقرآن من نفس المصفوفة ومن نفس حقل `seen_features` بحساب
 * المستخدم (راجع vivid-sprouting-gadget.md). إضافة ميزة عاشرة = سطر واحد هنا، صفر كود جديد.
 *
 * `route` للميزات اللي تُفتح بالتنقل (AppShell يراقب location.pathname)، `trigger` للميزات
 * اللي تُفتح كمودال من AppShell (assistant/tournament/consult) — ميزة تحمل واحد منهم فقط.
 *
 * `version` يبدأ 1 لكل ميزة. رفعه مستقبلًا (لإعلان ميزة فرعية جديدة داخل قسم موجود) يخلي كل
 * مستخدم شاهد الإصدار الأقدم يشوف المودال/النقطة مرة ثانية بدون التأثير على أي ميزة ثانية —
 * راجع settings.mts's action=mark-feature-seen و me.mts's seen_features.
 */
export interface FeatureIntroDef {
  key: string;
  version: number;
  icon: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  extraBodyKey?: TranslationKey;
  route?: string;
  trigger?: "assistant" | "tournament" | "consult";
}

export const FEATURE_INTROS: FeatureIntroDef[] = [
  {
    key: "feature_intro_daily_food", version: 1, icon: "🍽️", route: "/daily",
    titleKey: "featureIntro.dailyFoodTitle", bodyKey: "featureIntro.dailyFoodBody", extraBodyKey: "featureIntro.dailyFoodExtra",
  },
  {
    key: "feature_intro_diet_meals", version: 1, icon: "🥗", route: "/recipes",
    titleKey: "featureIntro.dietMealsTitle", bodyKey: "featureIntro.dietMealsBody", extraBodyKey: "featureIntro.dietMealsExtra",
  },
  {
    key: "feature_intro_weight", version: 1, icon: "⚖️", route: "/progress/weight",
    titleKey: "featureIntro.weightTitle", bodyKey: "featureIntro.weightBody", extraBodyKey: "featureIntro.weightExtra",
  },
  {
    key: "feature_intro_challenges", version: 1, icon: "🏆", route: "/intelligence",
    titleKey: "featureIntro.challengesTitle", bodyKey: "featureIntro.challengesBody", extraBodyKey: "featureIntro.challengesExtra",
  },
  {
    key: "feature_intro_cj_assistant", version: 1, icon: "🤖", trigger: "assistant",
    titleKey: "featureIntro.cjAssistantTitle", bodyKey: "featureIntro.cjAssistantBody", extraBodyKey: "featureIntro.cjAssistantExtra",
  },
  {
    key: "feature_intro_tournament", version: 1, icon: "🏆", trigger: "tournament",
    titleKey: "featureIntro.tournamentTitle", bodyKey: "featureIntro.tournamentBody",
  },
  {
    key: "feature_intro_specialist", version: 1, icon: "👨‍⚕️", trigger: "consult",
    titleKey: "featureIntro.specialistTitle", bodyKey: "featureIntro.specialistBody",
  },
  {
    key: "feature_intro_subscription", version: 1, icon: "⭐", route: "/subscribe",
    titleKey: "featureIntro.subscriptionTitle", bodyKey: "featureIntro.subscriptionBody",
  },
  {
    key: "feature_intro_profile", version: 1, icon: "👤", route: "/profile",
    titleKey: "featureIntro.profileTitle", bodyKey: "featureIntro.profileBody",
  },
];

export function isFeatureSeen(seenFeatures: Record<string, number>, def: FeatureIntroDef): boolean {
  return (seenFeatures[def.key] ?? 0) >= def.version;
}
