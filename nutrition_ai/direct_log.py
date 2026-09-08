"""
Direct-Log Undo/Reopen Engine — يخزّن Snapshot كامل لآخر تسجيل مباشر (وجبة أو ماي) على
User.last_direct_log_json، حتى ينجو من Refresh/إعادة فتح الشات. نافذة التراجع قصيرة ومحدودة
بثابت واحد. هذا الملف هو المصدر الوحيد اللي يقرر "شنو يرجع/يتعدّل" — لا منطق تراجع مبعثر
بأي مكان ثاني.
"""
import json
from datetime import date, timedelta

import iraq_time
from nutrition_ai import calculator, streaks, xp_engine

UNDO_WINDOW_SECONDS = 300  # 5 دقايق — قابل للتعديل من هنا فقط


def _expires_at_iso() -> str:
    return (iraq_time.now_baghdad() + timedelta(seconds=UNDO_WINDOW_SECONDS)).isoformat()


def _is_expired(snapshot: dict) -> bool:
    try:
        from datetime import datetime as _dt
        expires_at = _dt.fromisoformat(snapshot["expires_at"])
    except (KeyError, ValueError, TypeError):
        return True
    return iraq_time.now_baghdad() >= expires_at


def _serialize_streak_snapshot(s: dict) -> dict:
    return {
        "is_new_day": s["is_new_day"], "active_day_id": s["active_day_id"],
        "streak_before": s["streak_before"], "longest_before": s["longest_before"],
        "streak_started_before": s["streak_started_before"].isoformat() if s["streak_started_before"] else None,
        "last_active_before": s["last_active_before"].isoformat() if s["last_active_before"] else None,
        "new_milestones": s.get("new_milestones", []),
    }


def _deserialize_streak_snapshot(s: dict) -> dict:
    return {
        "is_new_day": s["is_new_day"], "active_day_id": s["active_day_id"],
        "streak_before": s["streak_before"], "longest_before": s["longest_before"],
        "streak_started_before": date.fromisoformat(s["streak_started_before"]) if s["streak_started_before"] else None,
        "last_active_before": date.fromisoformat(s["last_active_before"]) if s["last_active_before"] else None,
        "new_milestones": s.get("new_milestones", []),
    }


def build_meal_snapshot(meal_log_id: str, meal_type: str, raw_text: str, items: list,
                         xp_awarded: int, was_free_meal: bool, streak_snapshot: dict,
                         meal_status_before: str | None) -> dict:
    return {
        "kind": "meal",
        "expires_at": _expires_at_iso(),
        "meal_log_id": meal_log_id, "meal_type": meal_type, "raw_text": raw_text, "items": items,
        "xp_awarded": xp_awarded, "was_free_meal": was_free_meal,
        "streak_snapshot": _serialize_streak_snapshot(streak_snapshot),
        "meal_status_before": meal_status_before,
    }


def build_water_snapshot(water_log_id: str, ml: int, streak_snapshot: dict) -> dict:
    return {
        "kind": "water",
        "expires_at": _expires_at_iso(),
        "water_log_id": water_log_id, "ml": ml,
        "streak_snapshot": _serialize_streak_snapshot(streak_snapshot),
    }


def save(user, db, snapshot: dict) -> None:
    user.last_direct_log_json = json.dumps(snapshot, ensure_ascii=False)
    db.session.commit()


def clear(user, db) -> None:
    user.last_direct_log_json = None
    db.session.commit()


def load_valid(user, db) -> dict | None:
    """يرجّع الـSnapshot لو موجود وما زال ضمن النافذة، وإلا يمسحه ويرجّع None."""
    if not user.last_direct_log_json:
        return None
    try:
        snapshot = json.loads(user.last_direct_log_json)
    except (ValueError, TypeError):
        clear(user, db)
        return None
    if _is_expired(snapshot):
        clear(user, db)
        return None
    return snapshot


def _revert_streak_and_milestones(user, source_prefix: str, streak_snapshot_raw: dict) -> None:
    streak_snapshot = _deserialize_streak_snapshot(streak_snapshot_raw)
    for m in streak_snapshot.get("new_milestones", []):
        xp_engine.reverse_xp(
            user, m["xp_reward"], reason="streak_milestone", source=f"streak_milestone_{m['days']}",
        )
    streaks.undo_active_day(user, streak_snapshot)


def _revert_meal_side_effects(user, db, models, snapshot: dict):
    """يرجّع الآثار الجانبية لوجبة DIRECT_LOG (يحذف MealLog، يرجّع free_meals/XP/الستريك/MealStatus).
    مشترك بين undo() الكامل وreopen_meal_for_edit()."""
    MealLog = models["MealLog"]
    MealStatus = models["MealStatus"]

    log = MealLog.query.get(snapshot["meal_log_id"])
    if log:
        db.session.delete(log)
    if snapshot.get("was_free_meal"):
        user.free_meals_used = max(0, user.free_meals_used - 1)

    today = iraq_time.now_baghdad().date()
    status_row = MealStatus.query.filter_by(
        user_id=user.id, date=today, meal_type=snapshot["meal_type"]
    ).first()
    if status_row:
        status_row.status = snapshot.get("meal_status_before") or "asked"

    xp_engine.reverse_xp(user, snapshot.get("xp_awarded", 0), reason="meal_logged", source=snapshot["meal_log_id"])
    _revert_streak_and_milestones(user, "meal", snapshot["streak_snapshot"])


def _current_totals_fields(user, models) -> dict:
    """أرقام محدّثة بعد التراجع — نفس شكل حقول _finalize_meal حتى الواجهة (chat.js) تحدّث
    البطاقات مباشرة بدون Reload."""
    NutritionProfile = models["NutritionProfile"]
    MealLog = models["MealLog"]
    profile = NutritionProfile.query.get(user.id)
    target = profile.calorie_target if profile else 2000
    day_totals = calculator.today_totals(user, MealLog)
    return {
        "today_calories": day_totals["calories"], "target_calories": target,
        "remaining": target - day_totals["calories"],
        "xp": user.xp, "free_meals_used": user.free_meals_used,
    }


def undo(user, db, models) -> dict:
    snapshot = load_valid(user, db)
    if not snapshot:
        return {"reply": "ماكو شي أگدر أتراجع عنه هسه.", "meal_logged": False}

    if snapshot["kind"] == "meal":
        _revert_meal_side_effects(user, db, models, snapshot)
        clear(user, db)
        db.session.commit()
        return {
            "reply": "تمام، رجعتها. السعرات والحالة رجعت متل ما كانت قبل التسجيل.",
            "meal_logged": False, **_current_totals_fields(user, models),
        }

    if snapshot["kind"] == "water":
        WaterLog = models["WaterLog"]
        log = WaterLog.query.get(snapshot["water_log_id"])
        if log:
            db.session.delete(log)
        _revert_streak_and_milestones(user, "water", snapshot["streak_snapshot"])
        clear(user, db)
        db.session.commit()
        return {"reply": "تمام، رجعت تسجيل الماي.", "meal_logged": False}

    clear(user, db)
    return {"reply": "تمام، ألغيتها.", "meal_logged": False}


def reopen_meal_for_edit(user, db, models) -> dict | None:
    """
    يرجّع الوجبة المسجّلة مباشرة (DIRECT_LOG) إلى pending قابل للتعديل — يُستخدم لما المستخدم
    يصحّح آخر وجبة مباشرة ("لا مو بيضتين، 3") بدل ما يبدأ وجبة جديدة. يرجّع None إذا ماكو
    DIRECT_LOG صالح (منتهي النافذة أو من نوع ماي).
    """
    snapshot = load_valid(user, db)
    if not snapshot or snapshot["kind"] != "meal":
        return None

    _revert_meal_side_effects(user, db, models, snapshot)
    clear(user, db)

    return {
        "meal_type": snapshot["meal_type"],
        "raw_text": snapshot["raw_text"],
        "items": snapshot["items"],
        "pending_clarifications": [],
        "state": "AWAITING_CONFIRMATION",
    }
