/**
 * منفذ حرفي من nutrition_ai/direct_log.py — Direct-Log Undo/Reopen Engine. يخزّن Snapshot كامل
 * لآخر تسجيل مباشر (وجبة أو ماي) على User.last_direct_log_json، حتى ينجو من Refresh/إعادة فتح
 * الشات. نافذة التراجع قصيرة ومحدودة بثابت واحد.
 */
import type { Repository, UserRecord } from "./db/repository.js";
import * as streaks from "./streaks.js";
import * as xpEngine from "./xpEngine.js";
import * as calculator from "./calculator.js";
import { todayBaghdadIso } from "./iraqTime.js";
import type { PendingItem } from "./corrections.js";

export const UNDO_WINDOW_SECONDS = 300; // 5 دقايق — قابل للتعديل من هنا فقط

interface SerializedStreakSnapshot {
  is_new_day: boolean;
  active_day_id: string | null;
  streak_before: number;
  longest_before: number;
  streak_started_before: string | null;
  last_active_before: string | null;
  new_milestones: streaks.MilestoneAwarded[];
}

function serializeStreakSnapshot(s: streaks.StreakSnapshot): SerializedStreakSnapshot {
  return {
    is_new_day: s.is_new_day, active_day_id: s.active_day_id,
    streak_before: s.streak_before, longest_before: s.longest_before,
    streak_started_before: s.streak_started_before, last_active_before: s.last_active_before,
    new_milestones: s.new_milestones ?? [],
  };
}

function deserializeStreakSnapshot(s: SerializedStreakSnapshot): streaks.StreakSnapshot {
  return { ...s, new_milestones: s.new_milestones ?? [] };
}

export interface MealSnapshot {
  kind: "meal";
  expires_at: string;
  meal_log_id: string;
  meal_type: string;
  raw_text: string;
  items: PendingItem[];
  xp_awarded: number;
  was_free_meal: boolean;
  streak_snapshot: SerializedStreakSnapshot;
  meal_status_before: string | null;
}

export interface WaterSnapshot {
  kind: "water";
  expires_at: string;
  water_log_id: string;
  ml: number;
  streak_snapshot: SerializedStreakSnapshot;
}

export type Snapshot = MealSnapshot | WaterSnapshot;

function expiresAtIso(now: Date): string {
  return new Date(now.getTime() + UNDO_WINDOW_SECONDS * 1000).toISOString();
}

function isExpired(snapshot: Snapshot, now: Date): boolean {
  const expiresAt = new Date(snapshot.expires_at);
  if (Number.isNaN(expiresAt.getTime())) return true;
  return now >= expiresAt;
}

export function buildMealSnapshot(
  mealLogId: string, mealType: string, rawText: string, items: PendingItem[],
  xpAwarded: number, wasFreeMeal: boolean, streakSnapshot: streaks.StreakSnapshot,
  mealStatusBefore: string | null, now: Date = new Date(),
): MealSnapshot {
  return {
    kind: "meal", expires_at: expiresAtIso(now),
    meal_log_id: mealLogId, meal_type: mealType, raw_text: rawText, items,
    xp_awarded: xpAwarded, was_free_meal: wasFreeMeal,
    streak_snapshot: serializeStreakSnapshot(streakSnapshot),
    meal_status_before: mealStatusBefore,
  };
}

export function buildWaterSnapshot(
  waterLogId: string, ml: number, streakSnapshot: streaks.StreakSnapshot, now: Date = new Date(),
): WaterSnapshot {
  return {
    kind: "water", expires_at: expiresAtIso(now),
    water_log_id: waterLogId, ml, streak_snapshot: serializeStreakSnapshot(streakSnapshot),
  };
}

export async function save(repo: Repository, user: UserRecord, snapshot: Snapshot): Promise<void> {
  user.last_direct_log_json = JSON.stringify(snapshot);
  await repo.saveUser(user);
}

export async function clear(repo: Repository, user: UserRecord): Promise<void> {
  user.last_direct_log_json = null;
  await repo.saveUser(user);
}

/** يرجّع الـSnapshot لو موجود وما زال ضمن النافذة، وإلا يمسحه ويرجّع null. */
export async function loadValid(repo: Repository, user: UserRecord, now: Date = new Date()): Promise<Snapshot | null> {
  if (!user.last_direct_log_json) return null;
  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(user.last_direct_log_json) as Snapshot;
  } catch {
    await clear(repo, user);
    return null;
  }
  if (isExpired(snapshot, now)) {
    await clear(repo, user);
    return null;
  }
  return snapshot;
}

async function revertStreakAndMilestones(repo: Repository, user: UserRecord, snapshotRaw: SerializedStreakSnapshot): Promise<void> {
  const snapshot = deserializeStreakSnapshot(snapshotRaw);
  for (const m of snapshot.new_milestones) {
    await xpEngine.reverseXp(repo, user, m.xp_reward, "streak_milestone", `streak_milestone_${m.days}`);
  }
  await streaks.undoActiveDay(repo, user, snapshot);
}

/** يرجّع الآثار الجانبية لوجبة DIRECT_LOG (يحذف MealLog، يرجّع free_meals/XP/الستريك/MealStatus). */
async function revertMealSideEffects(repo: Repository, user: UserRecord, snapshot: MealSnapshot, now: Date): Promise<void> {
  const log = await repo.findMealLog(snapshot.meal_log_id);
  if (log) await repo.deleteMealLog(log.id);

  if (snapshot.was_free_meal) {
    user.free_meals_used = Math.max(0, user.free_meals_used - 1);
  }

  const today = todayBaghdadIso(now);
  const statusRow = await repo.findMealStatus(user.id, today, snapshot.meal_type);
  if (statusRow) {
    await repo.upsertMealStatus(user.id, today, snapshot.meal_type, snapshot.meal_status_before || "asked");
  }

  await xpEngine.reverseXp(repo, user, snapshot.xp_awarded ?? 0, "meal_logged", snapshot.meal_log_id);
  await revertStreakAndMilestones(repo, user, snapshot.streak_snapshot);
}

export interface TotalsFields {
  today_calories: number;
  target_calories: number;
  remaining: number;
  xp: number;
  free_meals_used: number;
}

/** أرقام محدّثة بعد التراجع — نفس شكل حقول finalizeMeal حتى الواجهة تحدّث البطاقات مباشرة. */
async function currentTotalsFields(repo: Repository, user: UserRecord, now: Date): Promise<TotalsFields> {
  const profile = await repo.findNutritionProfile(user.id);
  const target = profile ? profile.calorie_target : 2000;
  const dayTotals = await calculator.todayTotals(repo, user.id, now);
  return {
    today_calories: dayTotals.calories, target_calories: target,
    remaining: target - dayTotals.calories, xp: user.xp, free_meals_used: user.free_meals_used,
  };
}

export interface UndoResult {
  reply: string;
  meal_logged: false;
  [key: string]: unknown;
}

export async function undo(repo: Repository, user: UserRecord, now: Date = new Date()): Promise<UndoResult> {
  const snapshot = await loadValid(repo, user, now);
  if (!snapshot) {
    return { reply: "ماكو شي أگدر أتراجع عنه هسه.", meal_logged: false };
  }

  if (snapshot.kind === "meal") {
    await revertMealSideEffects(repo, user, snapshot, now);
    await clear(repo, user);
    await repo.saveUser(user);
    const totals = await currentTotalsFields(repo, user, now);
    return {
      reply: "تمام، رجعتها. السعرات والحالة رجعت متل ما كانت قبل التسجيل.",
      meal_logged: false, ...totals,
    };
  }

  if (snapshot.kind === "water") {
    const log = await repo.findWaterLog(snapshot.water_log_id);
    if (log) await repo.deleteWaterLog(log.id);
    await revertStreakAndMilestones(repo, user, snapshot.streak_snapshot);
    await clear(repo, user);
    await repo.saveUser(user);
    return { reply: "تمام، رجعت تسجيل الماي.", meal_logged: false };
  }

  await clear(repo, user);
  return { reply: "تمام، ألغيتها.", meal_logged: false };
}

/**
 * يرجّع الوجبة المسجّلة مباشرة (DIRECT_LOG) إلى pending قابل للتعديل — يُستخدم لما المستخدم
 * يصحّح آخر وجبة مباشرة ("لا مو بيضتين، 3") بدل ما يبدأ وجبة جديدة. يرجّع null إذا ماكو
 * DIRECT_LOG صالح (منتهي النافذة أو من نوع ماي).
 */
export async function reopenMealForEdit(
  repo: Repository, user: UserRecord, now: Date = new Date(),
): Promise<{ meal_type: string; raw_text: string; items: PendingItem[]; pending_clarifications: unknown[]; state: string } | null> {
  const snapshot = await loadValid(repo, user, now);
  if (!snapshot || snapshot.kind !== "meal") return null;

  await revertMealSideEffects(repo, user, snapshot, now);
  await clear(repo, user);
  await repo.saveUser(user);

  return {
    meal_type: snapshot.meal_type, raw_text: snapshot.raw_text, items: snapshot.items,
    pending_clarifications: [], state: "AWAITING_CONFIRMATION",
  };
}
