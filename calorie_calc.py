"""
حساب BMR و TDEE بمعادلة Mifflin-St Jeor — Server-Side حصرًا.
حدود السلامة (الحد الأدنى الآمن، أقصى عجز/فائض) مصدرها nutrition_ai/safety.py حصرًا —
هذا الملف لا يقرر أي رقم حرج بنفسه.
"""
from nutrition_ai import safety

ACTIVITY_FACTORS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "very_active": 1.725,
}

ACTIVITY_LABELS = {
    "sedentary": "خامل — بدون تمرين",
    "light": "نشاط خفيف — 1-3 أيام بالأسبوع",
    "moderate": "نشاط متوسط — 4-5 أيام بالأسبوع",
    "very_active": "نشاط عالي جدًا — 6-7 أيام بالأسبوع",
}


def calculate(age: int, weight_kg: float, height_cm: float, sex: str,
              goal: str, activity_level: str) -> dict:
    if sex == "male":
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age - 161

    factor = ACTIVITY_FACTORS.get(activity_level, 1.2)
    tdee = bmr * factor

    if goal == "lose":
        target = tdee - 500
    elif goal == "gain":
        target = tdee + 400
    else:
        target = tdee

    safe_target, safety_warning = safety.enforce_safe_target(target, tdee, sex, goal)

    water_target_ml = round(weight_kg * 33)  # تقدير شائع ومعقول، قابل للتعديل لاحقًا

    return {
        "bmr": round(bmr),
        "tdee": round(tdee),
        "calorie_target": safe_target,
        "water_target_ml": water_target_ml,
        "safety_warning": safety_warning,
    }
