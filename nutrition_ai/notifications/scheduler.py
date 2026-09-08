"""
Scheduler — يقرر *متى* ولمين يُرسَل إشعار (الـ*هل يُسمح*/*شنو القالب* بـengine.py). يشتغل
داخل نفس عملية Flask عبر APScheduler (بدون Celery/Redis — يناسب حجم النشر الحالي على
Render Free). الحماية من إرسال مضاعف تحت أكثر من Worker (gunicorn -w 2) مصدرها القيد
الفريد بجدول UserNotification (engine.py:record_sent) — مو قفل توزيعي هنا، فتشغيل هذا
الملف بأكثر من Worker بنفس الوقت آمن فعليًا (يحاول الاثنين، وحد بس ينجح فعليًا بالإرسال).

كل Tick دالة عادية تقبل `app` وتفتح app_context بنفسها — قابلة للاستدعاء المباشر
بالاختبارات بدون انتظار الجدولة الحقيقية.
"""
import os

import iraq_time
from models import db, User, NotificationSettings, MealStatus
from nutrition_ai import streaks
from nutrition_ai.notifications import engine

_scheduler = None

MEAL_REMINDER_WINDOW_MINUTES = 15  # نافذة تسامح بعد الوقت المضبوط (تغطي فجوات الـTick كل 5 دقايق)


def _hhmm_to_minutes(value: str) -> int:
    h, m = value.split(":")
    return int(h) * 60 + int(m)


def _within_window(now_hm: str, target_hm: str, window_minutes: int = MEAL_REMINDER_WINDOW_MINUTES) -> bool:
    diff = _hhmm_to_minutes(now_hm) - _hhmm_to_minutes(target_hm)
    return 0 <= diff < window_minutes


def _enabled_users():
    return (
        User.query.join(NotificationSettings, NotificationSettings.user_id == User.id)
        .filter(NotificationSettings.enabled.is_(True), User.disabled.is_(False))
        .all()
    )


def run_meal_reminder_tick(app):
    """يفحص كل مستخدم مفعّل — لو الوقت الحالي بغداد قريب من وقت وجبة مضبوط له ولسا ما
    سجّلها اليوم (MealStatus)، يرسل تذكير. مستخدم غايب 3+ أيام يوصله رسالة عودة لطيفة
    بدل تذكير وجبة عادي (مرة وحدة، مو Backlog)."""
    with app.app_context():
        today = iraq_time.now_baghdad().date()
        now_hm = iraq_time.now_baghdad().strftime("%H:%M")
        for user in _enabled_users():
            settings = engine.get_or_create_settings(user)
            for meal_type, time_field, category in (
                ("breakfast", "breakfast_time", "BREAKFAST"),
                ("lunch", "lunch_time", "LUNCH"),
                ("dinner", "dinner_time", "DINNER"),
            ):
                if not _within_window(now_hm, getattr(settings, time_field)):
                    continue
                status = MealStatus.query.filter_by(user_id=user.id, date=today, meal_type=meal_type).first()
                if status and status.status == "logged":
                    continue

                if streaks.days_absent(user) >= 3:
                    engine.send_notification(user, "RETURN", f"return_{today.isoformat()}", "/app")
                else:
                    engine.send_notification(user, category, f"{category.lower()}_{today.isoformat()}", "/app")


def run_water_tick(app):
    """تذكير ماي — مرة وحدة باليوم كحد أقصى (v1 مبسّط عمدًا لضمان بساطة قواعد Anti-Spam)،
    فقط بأوقات معقولة من اليوم (10ص-8م بغداد) حتى ما يوصل إشعار بنص الليل بالخطأ لو
    الجدولة تأخرت."""
    with app.app_context():
        today = iraq_time.now_baghdad().date()
        hour = iraq_time.now_baghdad().hour
        if not (10 <= hour <= 20):
            return
        for user in _enabled_users():
            engine.send_notification(user, "WATER", f"water_{today.isoformat()}", "/app")


def run_engagement_tick(app):
    """رسالة تحفيز/تنويع يومية وحدة (MOTIVATION/CONSISTENCY/PROGRESS/RECIPE) — تنويع
    بدون إغراق، وقت واحد باليوم (الظهر تقريبًا)."""
    with app.app_context():
        today = iraq_time.now_baghdad().date()
        hour = iraq_time.now_baghdad().hour
        if hour != 12:
            return
        categories = ["MOTIVATION", "CONSISTENCY", "PROGRESS", "RECIPE"]
        for user in _enabled_users():
            import random
            category = random.choice(categories)
            engine.send_notification(user, category, f"engagement_{today.isoformat()}", "/app")


def run_daily_summary_tick(app):
    """ملخص نهاية اليوم — مرة وحدة قرب نهاية يوم بغداد."""
    with app.app_context():
        today = iraq_time.now_baghdad().date()
        hour = iraq_time.now_baghdad().hour
        if hour != 22:
            return
        for user in _enabled_users():
            engine.send_notification(user, "DAILY_SUMMARY", f"summary_{today.isoformat()}", "/app")


def _run_all_ticks(app):
    run_meal_reminder_tick(app)
    run_water_tick(app)
    run_engagement_tick(app)
    run_daily_summary_tick(app)


def start_scheduler(app):
    """يبدأ الجدولة الدورية (كل 5 دقايق) — يُستدعى مرة وحدة من app.py:create_app().
    محروس ضد ازدواجية Werkzeug Reloader بوضع Dev (نفس نمط Flask القياسي)، وضد بدء أكثر
    من Scheduler بنفس العملية لو create_app() انادى أكثر من مرة (الاختبارات مثلاً)."""
    global _scheduler

    if os.environ.get("NOTIFICATION_SCHEDULER_ENABLED", "True").lower() != "true":
        return None

    # بوضع Dev، Werkzeug Reloader يشغّل عمليتين (أب يراقب + ابن حقيقي بـWERKZEUG_RUN_MAIN=true) —
    # نشغّل الجدولة بالابن فقط حتى ما تصير نسختين بنفس العملية الحية. بالإنتاج (gunicorn، بدون
    # Reloader) ماكو هذا المتغير أصلًا، فتشتغل عادي بكل Worker (القيد الفريد بقاعدة البيانات
    # يحمي من الإرسال المضاعف بين الـWorkers، مو هذا الحارس).
    is_dev_mode = os.environ.get("FLASK_ENV") == "development"
    in_reloader_child = os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    if is_dev_mode and not in_reloader_child:
        return None
    if _scheduler is not None:
        return _scheduler

    from apscheduler.schedulers.background import BackgroundScheduler

    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(lambda: _run_all_ticks(app), "interval", minutes=5, id="cj_notification_tick")
    _scheduler.start()
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
