"""
XP Engine — نقطة الحقيقة الوحيدة لتغيير user.xp. كل منح/سحب يمر من هنا فقط، ويُسجَّل
بجدول XPTransaction (Ledger) حتى نقدر نعرف ليش تغيّر كل رقم ونمنع تكرار غير محدود لنفس النشاط
(مثلاً milestone ستريك ما يُمنح مرتين لنفس المستخدم).
"""
import json

from models import db, XPTransaction


def award_xp(user, amount: int, reason: str, source: str | None = None, metadata: dict | None = None) -> bool:
    """
    يمنح/يسحب XP ويسجّل صف بالـLedger. لو source مذكور وموجود مسبقًا لنفس المستخدم، يتجاهل
    العملية (Idempotency — يمنع منح نفس المكافأة مرتين، مثل milestone ستريك معيّن).
    يرجّع True لو تم المنح فعليًا، False لو تجاهله (مكرر).
    """
    if source:
        exists = XPTransaction.query.filter_by(user_id=user.id, source=source).first()
        if exists:
            return False

    db.session.add(XPTransaction(
        user_id=user.id, amount=amount, reason=reason, source=source,
        metadata_json=json.dumps(metadata, ensure_ascii=False) if metadata else None,
    ))
    user.xp = max(0, user.xp + amount)
    return True


def reverse_xp(user, original_amount: int, reason: str, source: str | None = None) -> None:
    """يعكس منحة XP سابقة (تراجع عن DIRECT_LOG) — يسجّل معاملة عكسية بدل حذف السجل التاريخي.
    مصدر العملية العكسية مختلف عمدًا عن الأصلي (لاحقة _undo) حتى ما يصطدم بفحص Idempotency."""
    if original_amount == 0:
        return
    reversal_source = f"{source}_undo" if source else None
    award_xp(user, -original_amount, reason=f"{reason}_reversed", source=reversal_source)
