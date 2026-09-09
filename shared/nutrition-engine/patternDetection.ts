/**
 * Smart Anomaly Detection — يقارن نمط المستخدم الأخير بـBaseline شخصي حقيقي من behavior_daily
 * (المرحلة 1)، مو بمعيار طبي أو "طبيعي" عام (المرحلة 5 من ذكاء Captain CJ).
 *
 * قاعدة غير قابلة للتفاوض: "غير معتاد" هنا يعني فقط "مختلف عن نمط هذا المستخدم نفسه" — أبدًا
 * تشخيص، أبدًا ادعاء صحي، أبدًا "خطر على صحتك". صفر Insight بدون بيانات كافية (حد أدنى موثَّق).
 */
import type { Repository, UserRecord, BehaviorDailyRecord } from "./db/repository.js";
import * as behaviorAggregator from "./behaviorAggregator.js";
import { todayBaghdadIso, addDaysIso, nowBaghdad } from "./iraqTime.js";

export type InsightType = "MEAL_LOGGING_DROP" | "PROTEIN_ADHERENCE_DROP" | "MEAL_TIMING_SHIFT" | "STREAK_RISK";

export interface InsightResult {
  type: InsightType;
  message: string; // القالب النصي هو المصدر — Gemini (لو مفعّل) يعيد صياغته فقط، لا يخترع محتوى جديد
}

// حدود بيانات دنيا قبل أي Insight مبني على مقارنة (قسم "الأنماط الشخصية" بالمواصفة) — رقم واحد
// سيء ليوم وحد لا يكفي أبدًا لإطلاق ملاحظة.
const MIN_RECENT_DAYS = 3; // نافذة "الأخير" (آخر 3 أيام مكتملة، يستثني اليوم الحالي الناقص)
const MIN_BASELINE_DAYS = 5; // نافذة "المعتاد" (7 أيام قبلها)

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

function rate(rows: BehaviorDailyRecord[], predicate: (r: BehaviorDailyRecord) => boolean): number {
  return rows.length === 0 ? 0 : rows.filter(predicate).length / rows.length;
}

/**
 * ملاحظات مبنية على مقارنة حقيقية (آخر 3 أيام مكتملة مقابل الـ7 أيام قبلها) — يرجّع كل الأنواع
 * المكتشفة فعليًا (مو نوع واحد بس)، الفرز/الاختيار يصير عند الاستدعاء (orchestrator.ts).
 */
export async function detectBaselineInsights(repo: Repository, userId: string, now: Date = new Date()): Promise<InsightResult[]> {
  const today = todayBaghdadIso(now);
  const recentEnd = addDaysIso(today, -1);
  const recentStart = addDaysIso(today, -3);
  const baselineEnd = addDaysIso(today, -4);
  const baselineStart = addDaysIso(today, -10);

  const recent = await repo.findBehaviorDailyInRange(userId, recentStart, recentEnd);
  const baseline = await repo.findBehaviorDailyInRange(userId, baselineStart, baselineEnd);

  if (recent.length < MIN_RECENT_DAYS || baseline.length < MIN_BASELINE_DAYS) return [];

  const insights: InsightResult[] = [];

  const recentMeals = average(recent.map((r) => r.meals_logged));
  const baselineMeals = average(baseline.map((r) => r.meals_logged));
  if (baselineMeals >= 1.5 && recentMeals <= baselineMeals * 0.6) {
    insights.push({ type: "MEAL_LOGGING_DROP", message: "لاحظت إن تسجيل وجباتك أقل من المعتاد هالفترة، كل شي زين كابتن؟" });
  }

  const recentProtein = rate(recent, (r) => r.protein_hit_target);
  const baselineProtein = rate(baseline, (r) => r.protein_hit_target);
  if (baselineProtein >= 0.5 && recentProtein <= baselineProtein * 0.5) {
    insights.push({ type: "PROTEIN_ADHERENCE_DROP", message: "بروتينك اليومي انخفض عن معدلك المعتاد آخر كم يوم." });
  }

  const recentEarly = rate(recent, (r) => r.logged_before_noon);
  const baselineEarly = rate(baseline, (r) => r.logged_before_noon);
  if (baselineEarly >= 0.6 && recentEarly <= 0.2) {
    insights.push({ type: "MEAL_TIMING_SHIFT", message: "ملاحظ إنك تأخرت بتسجيل وجباتك آخر كم يوم عن وقتك المعتاد." });
  }

  return insights;
}

/** خطر انقطاع Streak حقيقي — مبني على وضع اليوم الحالي مباشرة (صفر Baseline، فحص مستقل). */
export function checkStreakRisk(user: UserRecord, todayBehavior: BehaviorDailyRecord | null, now: Date = new Date()): InsightResult | null {
  if (user.streak_days < 3) return null; // ستريك قصير أصلاً — ماكو شي جوهري ينخسر
  const { hour } = nowBaghdad(now);
  const loggedToday = (todayBehavior?.meals_logged ?? 0) > 0;
  if (loggedToday || hour < 20) return null;
  return {
    type: "STREAK_RISK",
    message: `عندك ستريك ${user.streak_days} يوم — لسا ما سجّلت شي اليوم، خلّينا ما نخسره كابتن! 🔥`,
  };
}

/**
 * يرجّع أول Insight (مبني على Baseline) لسا ما انعرض اليوم لهذا المستخدم، ويسجّله كـ"انعرض" —
 * Cooldown يومي بسيط (صفر تكرار نفس النوع نفس اليوم)، null لو ماكو شي جديد أو بيانات غير كافية.
 */
export async function pickUnseenBaselineInsight(repo: Repository, userId: string, now: Date = new Date()): Promise<string | null> {
  const insights = await detectBaselineInsights(repo, userId, now);
  const today = todayBaghdadIso(now);
  for (const insight of insights) {
    if (await repo.findInsightShown(userId, insight.type, today)) continue;
    await repo.recordInsightShown({ user_id: userId, type: insight.type, date: today });
    return insight.message;
  }
  return null;
}
