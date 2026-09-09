/**
 * Streak Freeze — يحمي استمرارية الستريك من انقطاع فعلي، بس بفعل صريح من المستخدم أبدًا تلقائيًا
 * (المرحلة 3 من ذكاء Captain CJ). الرصيد يُكتسَب فقط عبر محطات Streak حقيقية (streaks.ts) بحد
 * أقصى موثَّق — صفر تراكم لا نهائي، وPremium ما يعطي رصيد إضافي (خارج نطاق هذا الملف أصلاً).
 *
 * آلية الحماية: إدراج صف ActiveDay حقيقي لـ"أمس" (نفس الجدول اللي يبني عليه streaks.ts استمرارية
 * الستريك أصلاً) ثم إعادة حساب streak_days من سلسلة active_days الفعلية — صفر منطق استمرارية
 * مزدوج، صفر عداد منفصل يمكن أن ينحرف عن الحقيقة.
 */
import type { Repository, UserRecord } from "./db/repository.js";
import { todayBaghdadIso, addDaysIso } from "./iraqTime.js";

export const MAX_STREAK_FREEZE_BALANCE = 2;

async function recomputeStreakFromActiveDays(repo: Repository, user: UserRecord, now: Date): Promise<void> {
  const today = todayBaghdadIso(now);
  const todayActive = (await repo.findActiveDay(user.id, today)) !== null;
  let cursor = todayActive ? today : addDaysIso(today, -1);
  let streak = 0;
  // يمشي للخلف بسلسلة active_days الحقيقية المتصلة — يتوقف عند أول فجوة حقيقية.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const row = await repo.findActiveDay(user.id, cursor);
    if (!row) break;
    streak += 1;
    cursor = addDaysIso(cursor, -1);
  }
  user.streak_days = streak;
  user.longest_streak = Math.max(user.longest_streak, streak);
}

export type StreakFreezeResult =
  | { ok: true }
  | { ok: false; reason: "NO_FREEZE_BALANCE" | "YESTERDAY_ALREADY_ACTIVE" };

/** يستخدم Freeze واحد صراحة — يحمي "أمس" ويعيد حساب الستريك فعليًا من active_days الحقيقية. */
export async function useStreakFreeze(repo: Repository, user: UserRecord, now: Date = new Date()): Promise<StreakFreezeResult> {
  if ((user.streak_freeze_balance ?? 0) <= 0) return { ok: false, reason: "NO_FREEZE_BALANCE" };

  const today = todayBaghdadIso(now);
  const yesterday = addDaysIso(today, -1);
  if (await repo.findActiveDay(user.id, yesterday)) return { ok: false, reason: "YESTERDAY_ALREADY_ACTIVE" };

  await repo.insertActiveDay(user.id, yesterday);
  user.streak_freeze_balance = (user.streak_freeze_balance ?? 0) - 1;
  await recomputeStreakFromActiveDays(repo, user, now);
  await repo.saveUser(user);
  await repo.insertStreakFreezeUsage({ user_id: user.id, date_covered: yesterday, used_at: today });

  return { ok: true };
}
