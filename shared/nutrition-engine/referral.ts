/**
 * منطق منح XP للإحالة (حزمة تطوير الإحالة) — مستخرَج من auth-register.mts حتى يصير قابل
 * للاختبار وحدويًا عبر InMemoryRepository (نفس فلسفة كل منطق أعمال حقيقي بهذا المشروع، بعكس
 * حقول بوابة الوصول البحتة متل ban_status اللي تبقى خام بالـ.mts).
 */
import type { Repository, UserRecord } from "./db/repository.js";
import { awardXp } from "./xpEngine.js";

export const REFERRAL_XP = 30;
export const MAX_REFERRAL_XP_GRANTS = 20;
export const REFERRAL_XP_REASON = "referral_signup";

/**
 * يمنح صاحب الإحالة XP لمستخدم جديد سجّل عبر رابطه — idempotent حقيقيًا (source فريد لكل
 * مستخدم جديد عبر awardXp)، ومحدود بسقف أقصى لمنع الاستغلال. يرجّع true لو مُنح XP فعليًا.
 * لا يفحص الإحالة الذاتية صراحة لأنها مستحيلة ببنية العملية (مستخدم جديد ما يملك referral_code
 * بعد وقت التسجيل، فما يگدر يحيل نفسه).
 */
export async function grantReferralXp(repo: Repository, referrer: UserRecord, newUserId: string): Promise<boolean> {
  const grantsSoFar = await repo.listXpTransactionsByReason(referrer.id, REFERRAL_XP_REASON);
  if (grantsSoFar.length >= MAX_REFERRAL_XP_GRANTS) return false;

  const granted = await awardXp(repo, referrer, REFERRAL_XP, REFERRAL_XP_REASON, `referral_${newUserId}`);
  if (granted) await repo.saveUser(referrer);
  return granted;
}
