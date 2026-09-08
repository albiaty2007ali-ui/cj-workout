/**
 * منفذ حرفي من nutrition_ai/meal_state.py — Meal Logging State Machine. تسمية صريحة لكل حالة
 * تمر بيها الوجبة، بدل if/else مبعثرة. التخزين يبقى بنفس شكل User.pending_meal_json.
 */
import type { Repository, UserRecord } from "./db/repository.js";
import type { PendingMeal, PendingItem } from "./corrections.js";

export const DRAFT = "DRAFT";
export const AWAITING_CLARIFICATION = "AWAITING_CLARIFICATION";
export const AWAITING_CONFIRMATION = "AWAITING_CONFIRMATION";
export const CONFIRMED = "CONFIRMED";
export const DIRECT_LOGGED = "DIRECT_LOGGED";
export const UNDO_WINDOW = "UNDO_WINDOW";
export const UNDONE = "UNDONE";
export const COMPLETED = "COMPLETED";
export const CANCELLED = "CANCELLED";

export function newPending(mealType: string, rawText: string): PendingMeal {
  return { meal_type: mealType, raw_text: rawText, items: [], pending_clarifications: [], state: DRAFT };
}

export function currentState(pending: PendingMeal | null): string {
  if (!pending) return COMPLETED;
  if (pending.pending_clarifications?.length) return AWAITING_CLARIFICATION;
  if (pending.items?.length) return AWAITING_CONFIRMATION;
  return DRAFT;
}

export function loadPending(user: UserRecord): PendingMeal | null {
  if (!user.pending_meal_json) return null;
  try {
    const data = JSON.parse(user.pending_meal_json) as PendingMeal;
    data.pending_clarifications = data.pending_clarifications ?? [];
    data.items = data.items ?? [];
    return data;
  } catch {
    return null;
  }
}

export async function savePending(repo: Repository, user: UserRecord, pending: PendingMeal | null): Promise<void> {
  if (pending !== null) {
    pending.state = currentState(pending);
  }
  user.pending_meal_json = pending ? JSON.stringify(pending) : null;
  await repo.saveUser(user);
}

export type { PendingMeal, PendingItem };
