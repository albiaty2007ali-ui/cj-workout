/** منفذ حرفي من models.py's User.free_meals_remaining/trial_exhausted properties. */
import type { UserRecord } from "./db/repository.js";

export const FREE_MEALS_CAP = 6;

export function freeMealsRemaining(user: Pick<UserRecord, "free_meals_used">): number {
  return Math.max(0, FREE_MEALS_CAP - user.free_meals_used);
}

export function trialExhausted(user: Pick<UserRecord, "is_premium" | "free_meals_used">): boolean {
  return !user.is_premium && freeMealsRemaining(user) <= 0;
}
