"""
Streak Engine — مبني على سجل أيام فعلية (ActiveDay) بدل عداد هش. توقيت بغداد دائمًا
(iraq_time.py)، ونشاط واحد أو أكثر بنفس اليوم = يوم واحد بالستريك (UniqueConstraint على
user_id+date يمنع المضاعفة تلقائيًا).
"""
from datetime import timedelta

import iraq_time
from models import db, ActiveDay, StreakMilestone
from nutrition_ai import xp_engine


DEFAULT_MILESTONES = [
    (1, 5, "أول يوم 🔥"),
    (3, 10, "3 أيام متتالية"),
    (7, 20, "أسبوع كامل 🔥"),
    (14, 35, "أسبوعين"),
    (30, 75, "شهر كامل 💪"),
    (60, 120, "شهرين"),
    (100, 200, "100 يوم 🏆"),
    (365, 500, "سنة كاملة 🏆"),
]


def seed_default_milestones():
    if StreakMilestone.query.first():
        return
    for days, xp_reward, label in DEFAULT_MILESTONES:
        db.session.add(StreakMilestone(days=days, xp_reward=xp_reward, label=label, active=True))
    db.session.commit()


def record_active_day(user) -> dict:
    """
    يسجّل اليوم الحالي (بغداد) كيوم نشط لو لسا ما انسجل، ويحدّث streak_days/longest_streak/
    streak_started_at تبع المستخدم. يرجّع Snapshot كامل (لأغراض التراجع عبر undo_active_day)
    + أي محطات (Milestones) جديدة تحققت بهذا التسجيل.
    """
    today = iraq_time.now_baghdad().date()
    snapshot = {
        "is_new_day": False, "active_day_id": None,
        "streak_before": user.streak_days, "longest_before": user.longest_streak,
        "streak_started_before": user.streak_started_at, "last_active_before": user.last_active_date,
    }

    existing = ActiveDay.query.filter_by(user_id=user.id, date=today).first()
    if existing:
        snapshot["active_day_id"] = existing.id
        return {**snapshot, "new_milestones": []}

    row = ActiveDay(user_id=user.id, date=today)
    db.session.add(row)
    db.session.flush()  # نحتاج row.id فورًا لأغراض التراجع

    yesterday = today - timedelta(days=1)
    had_yesterday = ActiveDay.query.filter_by(user_id=user.id, date=yesterday).first() is not None
    if had_yesterday:
        user.streak_days = snapshot["streak_before"] + 1
    else:
        user.streak_days = 1
        user.streak_started_at = today

    user.last_active_date = today
    user.longest_streak = max(snapshot["longest_before"], user.streak_days)

    new_milestones = _award_milestones(user, user.streak_days)

    return {
        **snapshot, "is_new_day": True, "active_day_id": row.id, "new_milestones": new_milestones,
    }


def _award_milestones(user, current_streak: int) -> list[dict]:
    milestones = StreakMilestone.query.filter(
        StreakMilestone.active.is_(True), StreakMilestone.days <= current_streak,
    ).all()
    newly_awarded = []
    for m in milestones:
        granted = xp_engine.award_xp(
            user, m.xp_reward, reason="streak_milestone", source=f"streak_milestone_{m.days}",
        )
        if granted:
            newly_awarded.append({"days": m.days, "label": m.label, "xp_reward": m.xp_reward})
    return newly_awarded


def undo_active_day(user, snapshot: dict) -> None:
    """يرجّع كل شي لقيمته قبل record_active_day — يُستخدم من direct_log.py عند تراجع/إعادة فتح."""
    if not snapshot.get("is_new_day"):
        return  # كان يوم نشط مسبقًا أصلاً — ما فيه شي نرجّعه
    if snapshot.get("active_day_id"):
        row = ActiveDay.query.get(snapshot["active_day_id"])
        if row:
            db.session.delete(row)
    user.streak_days = snapshot["streak_before"]
    user.longest_streak = snapshot["longest_before"]
    user.streak_started_at = snapshot["streak_started_before"]
    user.last_active_date = snapshot["last_active_before"]


def days_absent(user) -> int:
    """عدد الأيام منذ آخر نشاط. 0 لو نشط اليوم نفسه أو ما بدأ نشاط أبدًا."""
    if not user.last_active_date:
        return 0
    today = iraq_time.now_baghdad().date()
    return max(0, (today - user.last_active_date).days)


def recent_active_dates(user, days: int = 30) -> set:
    """آخر N يوم من ActiveDay — لعرض Calendar البروفايل."""
    today = iraq_time.now_baghdad().date()
    start = today - timedelta(days=days - 1)
    rows = ActiveDay.query.filter(
        ActiveDay.user_id == user.id, ActiveDay.date >= start, ActiveDay.date <= today,
    ).all()
    return {r.date for r in rows}
