/**
 * Consistency Score — مقياس منفصل عن Personal Score (personalScore.ts): نافذة أطول (21 يوم،
 * ضمن مدى 14-30 المطلوب) من نفس behaviorAggregator الحقيقي، ويقيس "الانتظام" نفسه (هل تسجّل
 * بثبات، وهل تنجز مهامك، وهل تنقطع فترات طويلة) بدل "هل تحقق أهدافك اليوم" — عمدًا مستقل، حتى
 * لو انعدم أحد المقياسين يبقى الآخر يشتغل لوحده.
 *
 * موزون بأقصى 100: انتظام تسجيل الوجبات 40 + متوسط إكمال المهام اليومية 30 + الحفاظ على العادة
 * (أطول فترة انقطاع داخل النافذة) 30. صفر رقم مخترع — كل بند من behavior_daily الحقيقي فقط.
 */
import type { Repository, BehaviorDailyRecord } from "./db/repository.js";
import * as behaviorAggregator from "./behaviorAggregator.js";
import { MISSION_DEFS, checkMission } from "./missions.js";
import { todayBaghdadIso, addDaysIso } from "./iraqTime.js";

export interface ScoreBreakdownItem {
  label: string;
  delta: number;
  reason: string;
}

export interface ConsistencyScoreResult {
  score: number;
  window_days: number;
  days_with_activity: number;
  breakdown: ScoreBreakdownItem[];
}

const WINDOW_DAYS = 21;
const LOGGING_MAX = 40;
const MISSIONS_MAX = 30;
const GAP_MAX = 30;

export async function computeConsistencyScore(
  repo: Repository, userId: string, now: Date = new Date(),
): Promise<ConsistencyScoreResult> {
  const recent = await behaviorAggregator.recentBehavior(repo, userId, WINDOW_DAYS, now);

  if (recent.length === 0) {
    return {
      score: 0, window_days: WINDOW_DAYS, days_with_activity: 0,
      breakdown: [{ label: "بيانات غير كافية", delta: 0, reason: `ماكو نشاط مسجّل آخر ${WINDOW_DAYS} يوم بعد` }],
    };
  }

  const breakdown: ScoreBreakdownItem[] = [];
  let score = 0;

  const loggedDays = recent.filter((d) => d.meals_logged >= 1).length;
  const loggingPoints = Math.round((loggedDays / WINDOW_DAYS) * LOGGING_MAX);
  if (loggingPoints > 0) {
    breakdown.push({
      label: "انتظام تسجيل الوجبات", delta: loggingPoints,
      reason: `${loggedDays} من ${WINDOW_DAYS} يوم فيها تسجيل وجبة وحدة على الأقل`,
    });
  }
  score += loggingPoints;

  const avgMissionRate = recent.reduce((sum, d) => sum + MISSION_DEFS.filter((m) => checkMission(m.id, d)).length / MISSION_DEFS.length, 0) / recent.length;
  const missionsPoints = Math.round(avgMissionRate * MISSIONS_MAX);
  if (missionsPoints > 0) {
    breakdown.push({
      label: "إكمال المهام اليومية", delta: missionsPoints,
      reason: `متوسط ${Math.round(avgMissionRate * 100)}% من المهام اليومية تحققت بالأيام اللي فيها نشاط`,
    });
  }
  score += missionsPoints;

  const today = todayBaghdadIso(now);
  const byDate = new Map(recent.map((r) => [r.date, r]));
  let longestGap = 0;
  let currentGap = 0;
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const date = addDaysIso(today, -(WINDOW_DAYS - 1 - i));
    const rec: BehaviorDailyRecord | undefined = byDate.get(date);
    if (!rec || rec.meals_logged === 0) {
      currentGap++;
      longestGap = Math.max(longestGap, currentGap);
    } else {
      currentGap = 0;
    }
  }
  const gapRatio = 1 - Math.min(1, longestGap / WINDOW_DAYS);
  const gapPoints = Math.round(gapRatio * GAP_MAX);
  breakdown.push({
    label: "الحفاظ على العادة بدون انقطاعات طويلة", delta: gapPoints,
    reason: longestGap > 0 ? `أطول فترة توقف ${longestGap} يوم متتالي بدون تسجيل وجبة` : "صفر انقطاع خلال الفترة",
  });
  score += gapPoints;

  return { score: Math.max(0, Math.min(100, score)), window_days: WINDOW_DAYS, days_with_activity: recent.length, breakdown };
}
