"""
Level Engine — يحول XP إلى مستوى/تقدّم اعتمادًا على جدول Level بقاعدة البيانات (قابل للتعديل
من لوحة الأدمن) — لا أرقام ثابتة بالواجهة أو بالكود.
"""
from models import db, Level

# منحنى افتراضي معقول (يُزرع مرة وحدة فقط لو الجدول فاضي — الأدمن يقدر يعدّله بعدها بحرية)
_SPECIAL_TITLES = {1: "البداية", 5: "ملتزم", 10: "مستمر", 20: "منضبط", 30: "محترف"}


def seed_default_levels():
    if Level.query.first():
        return
    for level in range(1, 31):
        required_xp = round(50 * (level ** 1.6)) if level > 1 else 0
        title = _SPECIAL_TITLES.get(level, f"مستوى {level}")
        db.session.add(Level(level=level, required_xp=required_xp, title=title))
    db.session.commit()


def xp_progress(xp: int) -> dict:
    levels = Level.query.order_by(Level.level.asc()).all()
    if not levels:
        return {"level": 1, "title": "البداية", "current_in_level": xp, "needed_for_next": None, "xp": xp}

    current = levels[0]
    next_level = None
    for i, lvl in enumerate(levels):
        if lvl.required_xp <= xp:
            current = lvl
            next_level = levels[i + 1] if i + 1 < len(levels) else None
        else:
            break

    needed_for_next = (next_level.required_xp - xp) if next_level else None
    span = (next_level.required_xp - current.required_xp) if next_level else None
    progress_in_level = xp - current.required_xp

    return {
        "level": current.level, "title": current.title,
        "xp": xp, "current_level_xp": current.required_xp,
        "next_level_xp": next_level.required_xp if next_level else None,
        "progress_in_level": progress_in_level, "span": span,
        "needed_for_next": needed_for_next,
        "is_max_level": next_level is None,
    }
