/**
 * Progress Replay — خط زمني من أحداث حقيقية فقط: أول وجبة سُجّلت (meal_logs)، محطات Streak
 * (xp_transactions حيث reason="streak_milestone" — نفس السجل الحقيقي المستخدم أصلاً لمنح XP،
 * صفر مصدر بيانات جديد)، وأول تحدٍّ مكتمل (challenge_progress). أي مصدر غير متوفر يُستبعد
 * بصمت من القائمة — صفر حدث مُخترع أو placeholder.
 */
import type { Repository, UserRecord } from "./db/repository.js";
import { CHALLENGE_DEFS } from "./challenges.js";

export interface ReplayEvent {
  type: "first_meal" | "streak_milestone" | "challenge_completed";
  date: string; // "YYYY-MM-DD"
  label: string;
}

export interface ProgressReplayResult {
  available: boolean;
  reason: string | null;
  events: ReplayEvent[];
}

const MIN_ACCOUNT_AGE_DAYS = 7;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function buildProgressReplay(repo: Repository, user: UserRecord, now: Date = new Date()): Promise<ProgressReplayResult> {
  const firstMeal = await repo.findFirstMealLogForUser(user.id);
  if (!firstMeal) {
    return { available: false, reason: "لسا ماكو وجبات مسجّلة، ابدأ تسجّل وراح نبني لك خط زمني حقيقي بعد فترة.", events: [] };
  }

  const events: ReplayEvent[] = [{ type: "first_meal", date: isoDate(firstMeal.created_at), label: "أول وجبة سجّلتها" }];

  const milestoneTxs = await repo.listXpTransactionsByReason(user.id, "streak_milestone");
  for (const tx of milestoneTxs) {
    const days = tx.source?.match(/streak_milestone_(\d+)/)?.[1];
    events.push({ type: "streak_milestone", date: isoDate(tx.created_at), label: days ? `وصلت لـ${days} يوم Streak متواصل` : "محطة Streak" });
  }

  for (const def of CHALLENGE_DEFS) {
    const progress = await repo.findChallengeProgress(user.id, def.id);
    if (progress?.status === "completed" && progress.completed_at) {
      events.push({ type: "challenge_completed", date: progress.completed_at, label: `أكملت تحدي "${def.title}"` });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  const accountAgeDays = Math.round((now.getTime() - firstMeal.created_at.getTime()) / (24 * 60 * 60 * 1000));
  if (accountAgeDays < MIN_ACCOUNT_AGE_DAYS && events.length < 2) {
    return { available: false, reason: "لسا الوقت قصير — كمّل كم يوم وراح تصير عندك قصة تقدّم حقيقية نعرضها لك.", events: [] };
  }

  return { available: true, reason: null, events };
}
