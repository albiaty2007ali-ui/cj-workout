/**
 * Personal Score — رقم واحد (0-100) قابل للتفسير من بيانات حقيقية فقط (نافذة 7 أيام من
 * behaviorAggregator + streak_days الحقيقي). كل بند بالـbreakdown له مصدر حقيقي واضح — صفر رقم
 * مخترع، وصفر استخدام لبيانات صحية حساسة (وزن/أهداف) بالحساب.
 *
 * موزون بأقصى 100: التزام الوجبات 35 + هدف البروتين 20 + هدف الماي 15 + الاستمرارية (Streak) 30.
 * لا يعتمد على Missions/Challenges (مراحل لاحقة) — تصميم متعمّد حتى يبقى مستقلاً ولا ينكسر لو
 * تلك الأنظمة غير موجودة بعد.
 */
import type { Repository } from "./db/repository.js";
import * as behaviorAggregator from "./behaviorAggregator.js";

export interface ScoreBreakdownItem {
  label: string;
  delta: number;
  reason: string;
}

export interface PersonalScoreResult {
  score: number;
  breakdown: ScoreBreakdownItem[];
}

const WINDOW_DAYS = 7;
const MEAL_CONSISTENCY_MAX = 35;
const PROTEIN_MAX = 20;
const WATER_MAX = 15;
const STREAK_MAX = 30;
const STREAK_DAYS_FOR_FULL_CREDIT = 30;

export async function computePersonalScore(
  repo: Repository, userId: string, streakDays: number, now: Date = new Date(),
): Promise<PersonalScoreResult> {
  const recent = await behaviorAggregator.recentBehavior(repo, userId, WINDOW_DAYS, now);

  if (recent.length === 0) {
    return {
      score: 0,
      breakdown: [{ label: "بيانات غير كافية", delta: 0, reason: "ماكو نشاط مسجّل هالأسبوع بعد" }],
    };
  }

  const breakdown: ScoreBreakdownItem[] = [];
  let score = 0;

  const consistentDays = recent.filter((d) => d.meals_logged >= 2).length;
  const consistencyPoints = Math.round((consistentDays / WINDOW_DAYS) * MEAL_CONSISTENCY_MAX);
  if (consistencyPoints > 0) {
    breakdown.push({
      label: "الالتزام بتسجيل الوجبات", delta: consistencyPoints,
      reason: `${consistentDays} من ${recent.length} أيام سجّلت فيها وجبتين أو أكثر`,
    });
  }
  score += consistencyPoints;

  const proteinDays = recent.filter((d) => d.protein_hit_target).length;
  const proteinPoints = Math.round((proteinDays / WINDOW_DAYS) * PROTEIN_MAX);
  if (proteinPoints > 0) {
    breakdown.push({
      label: "تحقيق هدف البروتين", delta: proteinPoints,
      reason: `${proteinDays} من ${recent.length} أيام حققت هدف البروتين`,
    });
  }
  score += proteinPoints;

  const waterDays = recent.filter((d) => d.water_hit_target).length;
  const waterPoints = Math.round((waterDays / WINDOW_DAYS) * WATER_MAX);
  if (waterPoints > 0) {
    breakdown.push({
      label: "شرب الماي الكافي", delta: waterPoints,
      reason: `${waterDays} من ${recent.length} أيام حققت هدف الماي`,
    });
  }
  score += waterPoints;

  const streakPoints = Math.round(Math.min(1, Math.max(0, streakDays) / STREAK_DAYS_FOR_FULL_CREDIT) * STREAK_MAX);
  if (streakPoints > 0) {
    breakdown.push({
      label: "الاستمرارية (Streak)", delta: streakPoints,
      reason: `ستريك حالي ${streakDays} يوم`,
    });
  }
  score += streakPoints;

  return { score: Math.max(0, Math.min(100, score)), breakdown };
}
