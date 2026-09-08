"""
Meal Budget — يوزّع السعرات المتبقية على الوجبات غير المسجّلة بعد فقط (الوجبات المسجّلة لا
تُغيَّر أبدًا). عرض معلوماتي بصفحة 'يومي الغذائي' فقط — لا يغيّر منطق ASK_RECOMMENDATION بالشات.

الأوزان مبنية على عوامل حقيقية متوفرة فعليًا بالمشروع (الوقت الحالي عبر iraq_time.py) فقط —
بدون افتراض بيانات نشاط/جدول تدريب/تفضيلات غير موجودة أصلاً.
"""

# وزن نسبي لكل وجبة حسب الفترة الحالية بتوقيت بغداد — وجبة الفترة الحالية/القادمة تاخذ حصة
# أعلى، ووجبة فات وقتها تاخذ حصة أقل (بس ما تُستبعَد كليًا، ممكن المستخدم لسا يريد ياكلها)
_BASE_WEIGHTS = {"breakfast": 1.0, "lunch": 1.0, "dinner": 1.0, "snack": 0.6}

_PERIOD_BOOST = {
    "morning": {"breakfast": 1.4, "lunch": 1.0, "dinner": 0.8, "snack": 0.7},
    "noon": {"breakfast": 0.5, "lunch": 1.4, "dinner": 1.0, "snack": 0.8},
    "evening": {"breakfast": 0.3, "lunch": 0.8, "dinner": 1.4, "snack": 0.9},
    "late_night": {"breakfast": 0.3, "lunch": 0.5, "dinner": 1.0, "snack": 1.2},
}


def distribute_remaining_budget(remaining_calories: int, unlogged_meal_types: list, current_period: str) -> dict:
    """unlogged_meal_types: قائمة من {'breakfast','lunch','dinner','snack'} — الوجبات المسجّلة
    فعلاً لا تُمرَّر هنا أصلاً. يرجّع {meal_type: budget_kcal}، مجموعها = remaining_calories بالضبط
    (تقريب مضبوط على آخر عنصر لتفادي فقدان/زيادة كيلوكالوري بسبب التقريب)."""
    if not unlogged_meal_types or remaining_calories <= 0:
        return {m: 0 for m in unlogged_meal_types}

    boosts = _PERIOD_BOOST.get(current_period, _BASE_WEIGHTS)
    weights = {m: _BASE_WEIGHTS.get(m, 1.0) * boosts.get(m, 1.0) for m in unlogged_meal_types}
    total_weight = sum(weights.values()) or 1.0

    budgets = {}
    running_total = 0
    meal_list = list(unlogged_meal_types)
    for m in meal_list[:-1]:
        share = round(remaining_calories * (weights[m] / total_weight))
        budgets[m] = share
        running_total += share
    budgets[meal_list[-1]] = remaining_calories - running_total  # الباقي يذهب لآخر عنصر، صفر فقدان تقريب

    return budgets
