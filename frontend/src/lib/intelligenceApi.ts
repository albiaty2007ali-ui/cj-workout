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
  freeze_balance: number;
  insight: string;
}

export interface MissionStatus {
  id: string;
  title: string;
  description: string;
  xp_reward: number;
  completed: boolean;
  claimed: boolean;
}

export type ChallengeStatusValue = "not_started" | "active" | "completed";

export interface ChallengeStatus {
  id: string;
  title: string;
  description: string;
  type: "meals" | "protein" | "water";
  target_days: number;
  xp_reward: number;
  min_streak_days: number;
  status: ChallengeStatusValue;
  progress_days: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  username: string | null;
  photo_url: string | null;
  streak_days: number;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  my_rank: number | null;
  my_streak_days: number;
}

export interface GoalForecastResponse {
  forecast_available: boolean;
  weeks_estimate: number | null;
  reason: string | null;
  distance_to_goal: number | null;
  goal_direction: string | null;
  weekly_change: number | null;
}

export interface ConsistencyScoreResponse {
  score: number;
  window_days: number;
  days_with_activity: number;
  breakdown: ScoreBreakdownItem[];
}

export interface WeekdayStat {
  weekday: number;
  label: string;
  avg_score: number;
  sample_size: number;
}

export interface BestWorstDayResponse {
  available: boolean;
  reason: string | null;
  best: WeekdayStat | null;
  worst: WeekdayStat | null;
}

export interface ReplayEvent {
  type: "first_meal" | "streak_milestone" | "challenge_completed";
  date: string;
  label: string;
}

export interface ProgressReplayResponse {
  available: boolean;
  reason: string | null;
  events: ReplayEvent[];
}
