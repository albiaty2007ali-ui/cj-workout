/**
 * منفذ حرفي من nutrition_ai/weight_stats.py — إحصائيات وزن حقيقية من WeightHistory فقط، صفر
 * رقم مخترع. لو البيانات غير كافية لحساب شي (اتجاه، تغيّر أسبوعي)، يرجّع null + سبب صريح.
 *
 * الجزء المستقل عن DB فقط هنا — يأخذ entries جاهزة (بعد فلترة الفترة الزمنية من الاستدعاء)
 * بدل استعلام WeightHistory مباشرة، حتى يبقى قابل للاختبار المعزول بنفس منهج بقية الملفات.
 */
import { pyRound } from "./pyRound.js";

const MIN_POINTS_FOR_TREND = 3;
const WEEKLY_COMPARISON_WINDOW_DAYS: [number, number] = [5, 9]; // نافذة تسامح حول 7 أيام
const TREND_STABLE_THRESHOLD_KG = 0.3;

export interface WeightEntry {
  date: Date;
  weight_kg: number;
}

export type Trend = "INSUFFICIENT_DATA" | "STABLE" | "INCREASING" | "DECREASING";
export type GoalDirection = "GAIN" | "REACHED" | "OVER_GOAL" | "LOSS" | "UNDER_GOAL" | "MAINTAIN" | null;

export interface WeightStatsResult {
  entries: WeightEntry[];
  current_weight: number | null;
  starting_weight: number | null;
  total_change: number | null;
  average_weight: number | null;
  lowest_weight: number | null;
  highest_weight: number | null;
  weekly_change: number | null;
  weekly_change_note: string | null;
  trend: Trend;
  goal_weight: number | null;
  distance_to_goal: number | null;
  goal_direction: GoalDirection;
}

export function computeWeightStats(
  entries: WeightEntry[],
  goalWeight: number | null = null,
  goalType: string | null = null,
): WeightStatsResult {
  if (entries.length === 0) {
    return {
      entries: [], current_weight: null, starting_weight: null,
      total_change: null, average_weight: null, lowest_weight: null, highest_weight: null,
      weekly_change: null, weekly_change_note: "ماكو قياسات وزن مسجّلة بعد.",
      trend: "INSUFFICIENT_DATA", goal_weight: goalWeight,
      distance_to_goal: null, goal_direction: null,
    };
  }

  const weights = entries.map((e) => e.weight_kg);
  const currentWeight = weights[weights.length - 1];
  const startingWeight = weights[0];
  const averageWeight = pyRound(weights.reduce((a, b) => a + b, 0) / weights.length, 1);

  const [weeklyChangeKg, weeklyNote] = computeWeeklyChange(entries, currentWeight);
  const trend = computeTrend(entries);
  const [distanceToGoal, goalDirection] = goalDistance(currentWeight, goalWeight, goalType);

  return {
    entries,
    current_weight: currentWeight,
    starting_weight: startingWeight,
    total_change: pyRound(currentWeight - startingWeight, 1),
    average_weight: averageWeight,
    lowest_weight: Math.min(...weights),
    highest_weight: Math.max(...weights),
    weekly_change: weeklyChangeKg,
    weekly_change_note: weeklyNote,
    trend,
    goal_weight: goalWeight,
    distance_to_goal: distanceToGoal,
    goal_direction: goalDirection,
  };
}

function computeWeeklyChange(entries: WeightEntry[], currentWeight: number): [number | null, string | null] {
  const now = entries[entries.length - 1].date;
  const targetLow = new Date(now.getTime() - WEEKLY_COMPARISON_WINDOW_DAYS[1] * 24 * 60 * 60 * 1000);
  const targetHigh = new Date(now.getTime() - WEEKLY_COMPARISON_WINDOW_DAYS[0] * 24 * 60 * 60 * 1000);
  const candidates = entries.slice(0, -1).filter((e) => e.date >= targetLow && e.date <= targetHigh);
  if (candidates.length === 0) {
    return [null, "نحتاج قياسات أكثر حتى نحسب التغير الأسبوعي بدقة."];
  }
  // أقرب قياس لمنتصف النافذة (7 أيام بالضبط) هو الأدق للمقارنة
  const reference = candidates.reduce((best, e) => {
    const bestDiff = Math.abs(daysBetween(now, best.date) - 7);
    const eDiff = Math.abs(daysBetween(now, e.date) - 7);
    return eDiff < bestDiff ? e : best;
  });
  return [pyRound(currentWeight - reference.weight_kg, 1), null];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function computeTrend(entries: WeightEntry[]): Trend {
  if (entries.length < MIN_POINTS_FOR_TREND) return "INSUFFICIENT_DATA";
  const weights = entries.map((e) => e.weight_kg);
  const mid = Math.floor(weights.length / 2);
  const firstHalf = weights.slice(0, mid || 1);
  const secondHalf = weights.slice(mid);
  const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / (mid || 1);
  const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / (weights.length - mid);
  const diff = secondHalfAvg - firstHalfAvg;
  if (Math.abs(diff) < TREND_STABLE_THRESHOLD_KG) return "STABLE";
  return diff > 0 ? "INCREASING" : "DECREASING";
}

function goalDistance(currentWeight: number, goalWeight: number | null, goalType: string | null): [number | null, GoalDirection] {
  if (goalWeight === null) return [null, null];
  const diff = pyRound(goalWeight - currentWeight, 1);
  let direction: GoalDirection;
  if (goalType === "gain") {
    direction = diff > 0 ? "GAIN" : diff === 0 ? "REACHED" : "OVER_GOAL";
  } else if (goalType === "lose") {
    direction = diff < 0 ? "LOSS" : diff === 0 ? "REACHED" : "UNDER_GOAL";
  } else {
    direction = diff === 0 ? "REACHED" : "MAINTAIN";
  }
  return [Math.abs(diff), direction];
}
