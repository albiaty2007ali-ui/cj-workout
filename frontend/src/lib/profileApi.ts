export interface CalendarDay {
  date: string;
  is_today: boolean;
  status: "green" | "yellow" | "orange" | "none";
  meals_logged: number;
  protein_hit_target: boolean;
  water_hit_target: boolean;
}

export interface XpProgress {
  level: number;
  title: string;
  xp: number;
  current_level_xp?: number;
  next_level_xp?: number | null;
  progress_in_level?: number;
  span?: number | null;
  needed_for_next: number | null;
  is_max_level?: boolean;
  badge_icon?: string | null;
  badge_title?: string | null;
}

export interface AchievementSummary {
  level: number;
  streak_days: number;
  longest_streak: number;
  meals_logged: number;
  challenges_completed: number;
}

export interface ProfileResponse {
  name: string;
  username: string | null;
  bio: string | null;
  photo_url: string | null;
  profile_visibility: string;
  xp: number;
  streak_days: number;
  longest_streak: number;
  days_absent: number;
  progress: XpProgress;
  stats: {
    meals_logged: number;
    water_logs: number;
    calendar: CalendarDay[];
  };
  achievements: AchievementSummary;
}
