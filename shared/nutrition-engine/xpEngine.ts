/**
 * منفذ حرفي من nutrition_ai/xp_engine.py — نقطة الحقيقة الوحيدة لتغيير User.xp. كل منح/سحب
 * يمر من هنا فقط، ويُسجَّل بجدول xp_transactions (Ledger) حتى نقدر نعرف ليش تغيّر كل رقم
 * ونمنع تكرار غير محدود لنفس النشاط (مثلاً milestone ستريك ما يُمنح مرتين لنفس المستخدم).
 */
import type { Repository, UserRecord } from "./db/repository.js";

/**
 * يمنح/يسحب XP ويسجّل صف بالـLedger. لو source مذكور وموجود مسبقًا لنفس المستخدم، يتجاهل
 * العملية (Idempotency — يمنع منح نفس المكافأة مرتين). يرجّع true لو تم المنح فعليًا، false
 * لو تجاهله (مكرر).
 */
export async function awardXp(
  repo: Repository,
  user: UserRecord,
  amount: number,
  reason: string,
  source: string | null = null,
  metadata: Record<string, unknown> | null = null,
): Promise<boolean> {
  if (source) {
    const exists = await repo.findXpTransactionBySource(user.id, source);
    if (exists) return false;
  }

  await repo.insertXpTransaction({
    user_id: user.id, amount, reason, source,
    metadata_json: metadata ? JSON.stringify(metadata) : null,
  });
  user.xp = Math.max(0, user.xp + amount);
  return true;
}

/**
 * يعكس منحة XP سابقة (تراجع عن DIRECT_LOG) — يسجّل معاملة عكسية بدل حذف السجل التاريخي.
 * مصدر العملية العكسية مختلف عمدًا عن الأصلي (لاحقة _undo) حتى ما يصطدم بفحص Idempotency.
 */
export async function reverseXp(
  repo: Repository,
  user: UserRecord,
  originalAmount: number,
  reason: string,
  source: string | null = null,
): Promise<void> {
  if (originalAmount === 0) return;
  const reversalSource = source ? `${source}_undo` : null;
  await awardXp(repo, user, -originalAmount, `${reason}_reversed`, reversalSource);
}
