"""
Weight Statistics — إحصائيات وزن حقيقية من WeightHistory فقط، صفر رقم مخترع. لو البيانات
غير كافية لحساب شي (اتجاه، تغيّر أسبوعي)، يرجّع None + سبب صريح بدل تخمين.
"""
from datetime import timedelta, timezone

import iraq_time

MIN_POINTS_FOR_TREND = 3
WEEKLY_COMPARISON_WINDOW_DAYS = (5, 9)  # نافذة تسامح حول 7 أيام لإيجاد قياس مقارن حقيقي
TREND_STABLE_THRESHOLD_KG = 0.3  # فرق أصغر من هذا يُعتبر ثبات، مو اتجاه فعلي


def _period_start(period_days):
    """يرجّع حد بداية الفترة كـUTC ساذج (بدون tzinfo) — نفس تحويل calculator.py's day_utc_range
    (بغداد UTC+3، فطرح الـtzinfo مباشرة بدون تحويل كان يزيح الحدود 3 ساعات بالخطأ)."""
    if period_days is None:
        return None
    start_baghdad = iraq_time.now_baghdad() - timedelta(days=period_days)
    return start_baghdad.astimezone(timezone.utc).replace(tzinfo=None)


def compute_weight_stats(user, WeightHistory, goal_weight=None, goal_type=None, period_days=None) -> dict:
    query = WeightHistory.query.filter(WeightHistory.user_id == user.id)
    start = _period_start(period_days)
    if start is not None:
        query = query.filter(WeightHistory.recorded_at >= start)
    rows = query.order_by(WeightHistory.recorded_at.asc()).all()

    entries = [{"date": r.recorded_at, "weight_kg": r.weight_kg} for r in rows]

    if not entries:
        return {
            "entries": [], "current_weight": None, "starting_weight": None,
            "total_change": None, "average_weight": None, "lowest_weight": None,
            "highest_weight": None, "weekly_change": None,
            "weekly_change_note": "ماكو قياسات وزن مسجّلة بعد.",
            "trend": "INSUFFICIENT_DATA", "goal_weight": goal_weight,
            "distance_to_goal": None, "goal_direction": None,
        }

    weights = [e["weight_kg"] for e in entries]
    current_weight = weights[-1]
    starting_weight = weights[0]
    average_weight = round(sum(weights) / len(weights), 1)

    weekly_change, weekly_note = _weekly_change(entries, current_weight)
    trend = _trend(entries)

    distance_to_goal, goal_direction = _goal_distance(current_weight, goal_weight, goal_type)

    return {
        "entries": entries,
        "current_weight": current_weight,
        "starting_weight": starting_weight,
        "total_change": round(current_weight - starting_weight, 1),
        "average_weight": average_weight,
        "lowest_weight": min(weights),
        "highest_weight": max(weights),
        "weekly_change": weekly_change,
        "weekly_change_note": weekly_note,
        "trend": trend,
        "goal_weight": goal_weight,
        "distance_to_goal": distance_to_goal,
        "goal_direction": goal_direction,
    }


def _weekly_change(entries, current_weight):
    now = entries[-1]["date"]
    target_low = now - timedelta(days=WEEKLY_COMPARISON_WINDOW_DAYS[1])
    target_high = now - timedelta(days=WEEKLY_COMPARISON_WINDOW_DAYS[0])
    candidates = [e for e in entries[:-1] if target_low <= e["date"] <= target_high]
    if not candidates:
        return None, "نحتاج قياسات أكثر حتى نحسب التغير الأسبوعي بدقة."
    # أقرب قياس لمنتصف النافذة (7 أيام بالضبط) هو الأدق للمقارنة
    reference = min(candidates, key=lambda e: abs((now - e["date"]).days - 7))
    return round(current_weight - reference["weight_kg"], 1), None


def _trend(entries):
    if len(entries) < MIN_POINTS_FOR_TREND:
        return "INSUFFICIENT_DATA"
    weights = [e["weight_kg"] for e in entries]
    mid = len(weights) // 2
    first_half_avg = sum(weights[:mid or 1]) / (mid or 1)
    second_half_avg = sum(weights[mid:]) / (len(weights) - mid)
    diff = second_half_avg - first_half_avg
    if abs(diff) < TREND_STABLE_THRESHOLD_KG:
        return "STABLE"
    return "INCREASING" if diff > 0 else "DECREASING"


def _goal_distance(current_weight, goal_weight, goal_type):
    if goal_weight is None:
        return None, None
    diff = round(goal_weight - current_weight, 1)
    if goal_type == "gain":
        direction = "GAIN" if diff > 0 else "REACHED" if diff == 0 else "OVER_GOAL"
    elif goal_type == "lose":
        direction = "LOSS" if diff < 0 else "REACHED" if diff == 0 else "UNDER_GOAL"
    else:
        direction = "REACHED" if diff == 0 else "MAINTAIN"
    return abs(diff), direction
