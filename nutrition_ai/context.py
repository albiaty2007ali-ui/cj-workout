"""
Context Builder — يبني كائن سياق صغير وفعّال بدل تمرير كل بيانات المستخدم بكل مكان.
هذا نفس الشكل اللي راح يتغذّى منه أي LLM مستقبلاً (التصميم يجهّز لهذا بدون تفعيله الآن).
"""
import iraq_time
from nutrition_ai import calculator, macros


def build(user, profile, MealLog, WaterLog) -> dict:
    target = profile.calorie_target if profile else 2000
    totals = calculator.today_totals(user, MealLog)
    remaining = target - totals["calories"]
    water_ml = calculator.today_water_ml(user, WaterLog)

    macro_targets = {}
    if profile:
        macro_targets = macros.calculate_targets(target, profile.weight_kg, profile.goal)

    return {
        "target_calories": target,
        "consumed_calories": totals["calories"],
        "remaining_calories": remaining,
        "consumed_protein": totals["protein"],
        "consumed_carbs": totals["carbs"],
        "consumed_fat": totals["fat"],
        "macro_targets": macro_targets,
        "water_ml": water_ml,
        "water_target_ml": profile.water_target_ml if profile else 2000,
        "meals_logged_today": len(totals["logs"]),
        "goal": profile.goal if profile else "maintain",
        "period": iraq_time.get_current_period(),
        "over_target": remaining < 0,
    }
