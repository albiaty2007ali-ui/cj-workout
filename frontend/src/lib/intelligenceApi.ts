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
