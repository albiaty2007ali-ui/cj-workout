export interface CalendarDay {
  date: string;
  active: boolean;
  is_today: boolean;
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
}
