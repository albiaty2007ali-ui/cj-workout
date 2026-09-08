export interface MealBucket {
  status: "NOT_STARTED" | "LOGGED";
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  foods?: string[];
  logged_at?: string;
}

export interface DailyResponse {
  profile: null | Record<string, unknown>;
  is_today?: boolean;
  target_date?: string;
  target_calories?: number;
  remaining_calories?: number;
  over_target?: boolean;
  meals?: { breakfast: MealBucket; lunch: MealBucket; dinner: MealBucket; snack: MealBucket[] };
  budgets?: Record<string, number>;
}

export interface WeightEntry {
  id: string;
  date: string;
  weight_kg: number;
}

export type Trend = "INSUFFICIENT_DATA" | "STABLE" | "INCREASING" | "DECREASING";
export type GoalDirection = "GAIN" | "REACHED" | "OVER_GOAL" | "LOSS" | "UNDER_GOAL" | "MAINTAIN" | null;

export interface WeightStatsResponse {
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
