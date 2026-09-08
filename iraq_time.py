"""
نظام الوقت العراقي — يحدد فترة اليوم من توقيت بغداد الفعلي (مو وقت السيرفر).
الحدود قابلة للتعديل هنا مركزيًا لو احتجنا نغيرها مستقبلًا من الإعدادات.
"""
from datetime import datetime
from zoneinfo import ZoneInfo

BAGHDAD_TZ = ZoneInfo("Asia/Baghdad")

# كل فترة: (ساعة البداية شاملة, ساعة النهاية شاملة)
PERIOD_BOUNDARIES = {
    "morning": (5, 10),      # 05:00–10:59
    "noon": (11, 16),        # 11:00–16:59
    "evening": (17, 23),     # 17:00–23:59
    "late_night": (0, 4),    # 00:00–04:59
}

PERIOD_TO_MEAL = {
    "morning": "breakfast",
    "noon": "lunch",
    "evening": "dinner",
    "late_night": "dinner",  # نفترض العشاء لسا الميعاد المناسب للسؤال عنه، بأسلوب مختلف
}


def now_baghdad() -> datetime:
    return datetime.now(BAGHDAD_TZ)


def get_current_period() -> str:
    hour = now_baghdad().hour
    for period, (start, end) in PERIOD_BOUNDARIES.items():
        if start <= end:
            if start <= hour <= end:
                return period
        else:  # نطاق يلف منتصف الليل (غير مستخدم حاليًا لكن جاهز)
            if hour >= start or hour <= end:
                return period
    return "evening"


def relevant_meal_for_period(period: str) -> str:
    return PERIOD_TO_MEAL.get(period, "dinner")
