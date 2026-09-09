/** أنواع استجابات /api/intelligence — نفس نمط progressApi.ts. */

export interface ScoreBreakdownItem {
  label: string;
  delta: number;
  reason: string;
}

export interface DailySummaryResponse {
  score: number;
  breakdown: ScoreBreakdownItem[];
  streak_days: number;
  xp: number;
  insight: string;
}
