/**
 * منفذ حرفي من nutrition_ai/streaks.py — Streak Engine مبني على سجل أيام فعلية (ActiveDay)
 * بدل عداد هش. توقيت بغداد دائمًا، ونشاط واحد أو أكثر بنفس اليوم = يوم واحد بالستريك (قيد
 * فريد على user_id+date يمنع المضاعفة تلقائيًا على مستوى الـRepository).
 */
import type { Repository, UserRecord } from "./db/repository.js";
import * as xpEngine from "./xpEngine.js";
import { todayBaghdadIso, addDaysIso, diffDaysIso } from "./iraqTime.js";

export interface MilestoneAwarded {
  days: number;
  label: string;
  xp_reward: number;
}

export interface StreakSnapshot {
  is_new_day: boolean;
  active_day_id: string | null;
  streak_before: number;
  longest_before: number;
  streak_started_before: string | null;
  last_active_before: string | null;
  new_milestones: MilestoneAwarded[];
}

/**
 * يسجّل اليوم الحالي (بغداد) كيوم نشط لو لسا ما انسجل، ويحدّث streak_days/longest_streak/
 * streak_started_at تبع المستخدم. يرجّع Snapshot كامل (لأغراض التراجع عبر undoActiveDay) + أي
 * محطات (Milestones) جديدة تحققت بهذا التسجيل.
 */
export async function recordActiveDay(repo: Repository, user: UserRecord, now: Date = new Date()): Promise<StreakSnapshot> {
  const today = todayBaghdadIso(now);
  const snapshot: Omit<StreakSnapshot, "new_milestones"> = {
    is_new_day: false, active_day_id: null,
    streak_before: user.streak_days, longest_before: user.longest_streak,
    streak_started_before: user.streak_started_at, last_active_before: user.last_active_date,
  };

  const existing = await repo.findActiveDay(user.id, today);
  if (existing) {
    return { ...snapshot, active_day_id: existing.id, new_milestones: [] };
  }

  const row = await repo.insertActiveDay(user.id, today);

  const yesterday = addDaysIso(today, -1);
  const hadYesterday = (await repo.findActiveDay(user.id, yesterday)) !== null;
  if (hadYesterday) {
    user.streak_days = snapshot.streak_before + 1;
  } else {
    user.streak_days = 1;
    user.streak_started_at = today;
  }

  user.last_active_date = today;
  user.longest_streak = Math.max(snapshot.longest_before, user.streak_days);

  const newMilestones = await awardMilestones(repo, user, user.streak_days);

  return { ...snapshot, is_new_day: true, active_day_id: row.id, new_milestones: newMilestones };
}

async function awardMilestones(repo: Repository, user: UserRecord, currentStreak: number): Promise<MilestoneAwarded[]> {
  const milestones = await repo.listActiveStreakMilestonesUpTo(currentStreak);
  const newlyAwarded: MilestoneAwarded[] = [];
  for (const m of milestones) {
    const granted = await xpEngine.awardXp(repo, user, m.xp_reward, "streak_milestone", `streak_milestone_${m.days}`);
    if (granted) {
      newlyAwarded.push({ days: m.days, label: m.label, xp_reward: m.xp_reward });
    }
  }
  return newlyAwarded;
}

/** يرجّع كل شي لقيمته قبل recordActiveDay — يُستخدم من directLog.ts عند تراجع/إعادة فتح. */
export async function undoActiveDay(repo: Repository, user: UserRecord, snapshot: StreakSnapshot): Promise<void> {
  if (!snapshot.is_new_day) return; // كان يوم نشط مسبقًا أصلاً — ما فيه شي نرجّعه
  if (snapshot.active_day_id) {
    const row = await repo.findActiveDayById(snapshot.active_day_id);
    if (row) await repo.deleteActiveDay(row.id);
  }
  user.streak_days = snapshot.streak_before;
  user.longest_streak = snapshot.longest_before;
  user.streak_started_at = snapshot.streak_started_before;
  user.last_active_date = snapshot.last_active_before;
}

/** عدد الأيام منذ آخر نشاط. 0 لو نشط اليوم نفسه أو ما بدأ نشاط أبدًا. */
export function daysAbsent(user: UserRecord, now: Date = new Date()): number {
  if (!user.last_active_date) return 0;
  const today = todayBaghdadIso(now);
  return Math.max(0, diffDaysIso(today, user.last_active_date));
}

/** آخر N يوم من ActiveDay — لعرض Calendar البروفايل. */
export async function recentActiveDates(repo: Repository, user: UserRecord, days = 30, now: Date = new Date()): Promise<Set<string>> {
  const today = todayBaghdadIso(now);
  const start = addDaysIso(today, -(days - 1));
  const dates = await repo.findActiveDaysInRange(user.id, start, today);
  return new Set(dates);
}
