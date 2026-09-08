"""
Nutrition Calculator — نقطة الحقيقة الوحيدة للأرقام. أي مكان يحتاج سعرات/ماكروز يمرّ من هنا،
وهذا بدوره يمرّ حصرًا من food_search.py (قاعدة foods.sqlite). لا AI يحسب أي رقم بنفسه.
"""
import json
from datetime import datetime, time, timedelta, timezone

import iraq_time
import food_search


def compute_food(food_id: int, grams: float) -> dict:
    return food_search.compute_nutrition(food_id, grams)


def totals_for_items(items: list) -> dict:
    return {
        "calories": sum(i["calories"] for i in items),
        "protein": sum(i["protein"] for i in items),
        "carbs": sum(i["carbs"] for i in items),
        "fat": sum(i["fat"] for i in items),
    }


def day_utc_range(target_date) -> tuple[datetime, datetime]:
    """نفس منطق today_utc_range لكن ليوم بغدادي محدد (date) بدل اليوم الحالي إجباريًا —
    يُستخدم لعرض أيام سابقة بصفحة 'يومي الغذائي' بدون تكرار منطق التحويل الزمني."""
    start_local = datetime.combine(target_date, time.min, tzinfo=iraq_time.BAGHDAD_TZ)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def today_utc_range() -> tuple[datetime, datetime]:
    """
    يرجّع (بداية، نهاية) اليوم الحالي بتوقيت بغداد، محوّلة لنطاق UTC ساذج (بدون tzinfo) —
    لازم نقارن بيه لأن created_at يُخزَّن عبر datetime.utcnow(). مقارنة date.today() (توقيت
    الجهاز المحلي) مباشرة مع تاريخ عمود UTC كانت تسبب إسقاط وجبات اليوم قرب منتصف الليل
    (بغداد UTC+3) — أي وجبة بين 21:00-23:59 UTC تحسب "أمس" محليًا بالخطأ.
    """
    return day_utc_range(iraq_time.now_baghdad().date())


def today_totals(user, MealLog):
    start_utc, end_utc = today_utc_range()
    logs = MealLog.query.filter(
        MealLog.user_id == user.id,
        MealLog.created_at >= start_utc,
        MealLog.created_at < end_utc,
    ).all()
    total_cal = sum(l.total_calories for l in logs)
    total_protein = sum(l.total_protein for l in logs)
    total_carbs = sum(l.total_carbs for l in logs)
    total_fat = sum(l.total_fat for l in logs)
    return {
        "calories": total_cal, "protein": total_protein,
        "carbs": total_carbs, "fat": total_fat, "logs": logs,
    }


def meals_by_type_for_day(user, MealLog, target_date) -> dict:
    """يجمّع وجبات يوم بغدادي محدد حسب نوعها — من نفس صفوف MealLog الحقيقية (created_at)،
    بدون أي حساب سعرات جديد (المجاميع مأخوذة من الأعمدة المحسوبة مسبقًا بـ_finalize_meal).
    breakfast/lunch/dinner كل وحدة صف واحد (أو None لو ماكو)، snack قائمة (يدعم أكثر من سناك
    بنفس اليوم)."""
    start_utc, end_utc = day_utc_range(target_date)
    logs = MealLog.query.filter(
        MealLog.user_id == user.id,
        MealLog.created_at >= start_utc,
        MealLog.created_at < end_utc,
    ).order_by(MealLog.created_at.asc()).all()

    def _summarize(log):
        try:
            items = json.loads(log.matched_foods_json) if log.matched_foods_json else []
        except (ValueError, TypeError):
            items = []
        return {
            "status": "LOGGED",
            "calories": log.total_calories, "protein": log.total_protein,
            "carbs": log.total_carbs, "fat": log.total_fat,
            "foods": items, "logged_at": log.created_at,
        }

    result = {"breakfast": None, "lunch": None, "dinner": None, "snack": []}
    for log in logs:
        if log.meal_type == "snack":
            result["snack"].append(_summarize(log))
        elif log.meal_type in result:
            result[log.meal_type] = _summarize(log)

    for meal_type in ("breakfast", "lunch", "dinner"):
        if result[meal_type] is None:
            result[meal_type] = {"status": "NOT_STARTED"}

    return result


def today_water_ml(user, WaterLog) -> int:
    start_utc, end_utc = today_utc_range()
    rows = WaterLog.query.filter(
        WaterLog.user_id == user.id,
        WaterLog.created_at >= start_utc,
        WaterLog.created_at < end_utc,
    ).all()
    return sum(r.ml for r in rows)
