/**
 * Challenges — تحديات متعددة الأيام، صعوبة تتكيّف مع Streak الحقيقي للمستخدم (المرحلة 2 من ذكاء
 * Captain CJ). التقدّم يُحسب دائمًا من `behavior_daily` الحقيقي (Phase 1) بين start_date واليوم
 * — صفر عداد منفصل، صفر تراكم يمكن أن ينحرف. محاولة واحدة فقط لكل (مستخدم، تحدٍّ) بهذي المرحلة
 * (صفر إعادة تشغيل لتحدٍّ مكتمل — قرار نطاق مقصود، توسيع لاحق لو احتجناه فعليًا).
 */
import type { Repository, UserRecord, BehaviorDailyRecord } from "./db/repository.js";
import * as xpEngine from "./xpEngine.js";
import { todayBaghdadIso } from "./iraqTime.js";

export type ChallengeType = "meals" | "protein" | "water";

export interface ChallengeTemplate {
  id: string;
  title: string;
  description: string;
  type: ChallengeType;
  target_days: number;
  xp_reward: number;
  min_streak_days: number; // Adaptive: التحدي ما يظهر إلا لو Streak المستخدم وصل هالحد
}

export const CHALLENGE_DEFS: ChallengeTemplate[] = [
  { id: "meals_3day", title: "3 أيام التزام", description: "سجّل وجبة وحدة على الأقل 3 أيام", type: "meals", target_days: 3, xp_reward: 20, min_streak_days: 0 },
  { id: "protein_5day", title: "5 أيام بروتين", description: "حقق هدف البروتين 5 أيام", type: "protein", target_days: 5, xp_reward: 40, min_streak_days: 7 },
  { id: "water_5day", title: "5 أيام ماي", description: "حقق هدف الماي 5 أيام", type: "water", target_days: 5, xp_reward: 35, min_streak_days: 7 },
  { id: "meals_7day", title: "أسبوع كامل التزام", description: "سجّل وجبتين أو أكثر 7 أيام ضمن التحدي", type: "meals", target_days: 7, xp_reward: 60, min_streak_days: 14 },
];

export interface ChallengeStatus extends ChallengeTemplate {
  status: "not_started" | "active" | "completed";
  progress_days: number;
}

function matchesType(type: ChallengeType, row: BehaviorDailyRecord): boolean {
  if (type === "meals") return row.meals_logged >= 1;
  if (type === "protein") return row.protein_hit_target;
  return row.water_hit_target;
}

async function computeProgressDays(repo: Repository, userId: string, def: ChallengeTemplate, startDate: string, today: string): Promise<number> {
  const rows = await repo.findBehaviorDailyInRange(userId, startDate, today);
  return rows.filter((r) => matchesType(def.type, r)).length;
}

/** يفحص كل تحدياتي النشطة ويكمل/يمنح XP لو تحقق الهدف فعليًا — Idempotent (awardXp source-keyed، صفر منح مكرر حتى لو استُدعيت أكثر من مرة). */
export async function evaluateChallenges(repo: Repository, user: UserRecord, now: Date = new Date()): Promise<void> {
  const today = todayBaghdadIso(now);
  for (const def of CHALLENGE_DEFS) {
    const progress = await repo.findChallengeProgress(user.id, def.id);
    if (!progress || progress.status === "completed") continue;

    const progressDays = await computeProgressDays(repo, user.id, def, progress.start_date, today);
    if (progressDays >= def.target_days) {
      const source = `challenge_completed_${user.id}_${def.id}`;
      const granted = await xpEngine.awardXp(repo, user, def.xp_reward, "challenge_completed", source);
      if (granted) await repo.saveUser(user);
      await repo.updateChallengeProgress(user.id, def.id, { status: "completed", completed_at: today });
    }
  }
}

/** يرجّع كل التحديات المتاحة لمستوى Streak الحالي، بعد تقييم أي إكمال جديد أولاً (evaluateChallenges). */
export async function listChallenges(repo: Repository, user: UserRecord, now: Date = new Date()): Promise<ChallengeStatus[]> {
  await evaluateChallenges(repo, user, now);
  const today = todayBaghdadIso(now);

  const out: ChallengeStatus[] = [];
  for (const def of CHALLENGE_DEFS) {
    if (user.streak_days < def.min_streak_days) continue;
    const progress = await repo.findChallengeProgress(user.id, def.id);
    if (!progress) {
      out.push({ ...def, status: "not_started", progress_days: 0 });
      continue;
    }
    if (progress.status === "completed") {
      out.push({ ...def, status: "completed", progress_days: def.target_days });
      continue;
    }
    const progressDays = await computeProgressDays(repo, user.id, def, progress.start_date, today);
    out.push({ ...def, status: "active", progress_days: Math.min(progressDays, def.target_days) });
  }
  return out;
}

export async function startChallenge(repo: Repository, user: UserRecord, challengeId: string, now: Date = new Date()): Promise<boolean> {
  const def = CHALLENGE_DEFS.find((c) => c.id === challengeId);
  if (!def || user.streak_days < def.min_streak_days) return false;
  const existing = await repo.findChallengeProgress(user.id, challengeId);
  if (existing) return false; // موجودة أصلاً (نشطة أو مكتملة) — صفر بدء مكرر

  try {
    await repo.insertChallengeProgress({
      user_id: user.id, challenge_id: challengeId, start_date: todayBaghdadIso(now),
      status: "active", completed_at: null,
    });
    return true;
  } catch {
    return false; // Race Condition نادر: بدأها من جهازين بنفس اللحظة — insertChallengeProgress يرمي عبر create()
  }
}
