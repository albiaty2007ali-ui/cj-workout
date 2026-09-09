import type { UserRecord } from "../db/repository.js";

export function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: "u1", xp: 0, streak_days: 0, longest_streak: 0, streak_started_at: null, last_active_date: null,
    free_meals_used: 0, is_premium: false, current_recipe_id: null, current_recipe_step: 0,
    pending_recipe_confirmation_id: null, pending_food_topic_json: null, pending_meal_json: null,
    last_direct_log_json: null, ai_response_style: "balanced", streak_freeze_balance: 0,
    ...overrides,
  };
}
