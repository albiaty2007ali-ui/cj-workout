"""
Notification Engine — يقرر مين يستحق إشعار هسه وأي قالب يرسله، بدون إزعاج. القواعد كلها هنا
بمكان وحد: تفعيل عام/لكل تصنيف، ساعات عدم إزعاج، حد يومي، Cooldown، منع تكرار نفس القالب،
وتراجع تلقائي بالكثافة إذا المستخدم يتجاهل الإشعارات. الإرسال الفعلي (push.py) والجدولة
(scheduler.py) منفصلين عمدًا — هذا الملف منطق القرار فقط.
"""
import json
import random
from datetime import datetime, timedelta

import iraq_time
from models import db, NotificationTemplate, NotificationSettings, UserNotification, PushSubscription

DEFAULT_COOLDOWN_MINUTES = 90
IGNORED_STREAK_THRESHOLD = 3  # كم إشعار متتالي متجاهل قبل ما نخفف الكثافة
IGNORED_COOLDOWN_MULTIPLIER = 3  # مضاعف الـCooldown لما نخفف

CATEGORY_TOGGLE_FIELD = {
    "BREAKFAST": "breakfast_enabled", "LUNCH": "lunch_enabled", "DINNER": "dinner_enabled",
    "SNACK": "breakfast_enabled",  # سناك تابع لعموم تفعيل الوجبات — ماكو تبديل مستقل بالطلب
    "MEAL_REMINDER": "breakfast_enabled",
    "WATER": "water_enabled", "HYDRATION": "water_enabled",
    "STREAK": "streak_enabled", "XP": "xp_enabled",
    "RECIPE": "recipe_enabled",
    "DAILY_SUMMARY": "daily_summary_enabled",
    "MOTIVATION": "xp_enabled", "PROGRESS": "xp_enabled", "CONSISTENCY": "xp_enabled",
    "RETURN": None,  # RETURN دائمًا مسموح إذا enabled عام — لا تبديل فرعي له
}


def seed_default_notification_templates():
    if NotificationTemplate.query.first():
        return
    from nutrition_ai.notifications.templates_seed import NOTIFICATION_TEMPLATES_SEED
    for t in NOTIFICATION_TEMPLATES_SEED:
        db.session.add(NotificationTemplate(
            category=t["category"], title=t["title"], body=t["body"],
            meal_type=t.get("meal_type"), goal=t.get("goal"), active=True,
        ))
    db.session.commit()


def get_or_create_settings(user) -> NotificationSettings:
    settings = NotificationSettings.query.get(user.id)
    if not settings:
        settings = NotificationSettings(user_id=user.id)
        db.session.add(settings)
        db.session.commit()
    return settings


def _parse_hhmm(value: str):
    h, m = value.split(":")
    return int(h), int(m)


def is_quiet_hours(settings: NotificationSettings, now=None) -> bool:
    now = now or iraq_time.now_baghdad()
    start_h, start_m = _parse_hhmm(settings.quiet_hours_start)
    end_h, end_m = _parse_hhmm(settings.quiet_hours_end)
    start_minutes = start_h * 60 + start_m
    end_minutes = end_h * 60 + end_m
    now_minutes = now.hour * 60 + now.minute

    if start_minutes == end_minutes:
        return False
    if start_minutes < end_minutes:
        return start_minutes <= now_minutes < end_minutes
    # يلف عبر منتصف الليل (مثلاً 22:00 -> 08:00)
    return now_minutes >= start_minutes or now_minutes < end_minutes


def _today_sent_count(user_id: str) -> int:
    start_utc, end_utc = _today_utc_range()
    return UserNotification.query.filter(
        UserNotification.user_id == user_id,
        UserNotification.sent_at >= start_utc, UserNotification.sent_at < end_utc,
    ).count()


def _today_utc_range():
    from nutrition_ai.calculator import today_utc_range
    return today_utc_range()


def category_enabled(settings: NotificationSettings, category: str) -> bool:
    field = CATEGORY_TOGGLE_FIELD.get(category)
    if field is None:
        return True
    return bool(getattr(settings, field, True))


def can_send_now(user, settings: NotificationSettings, category: str) -> bool:
    """يفحص كل قواعد Anti-Spam بترتيب واحد. لا يفحص dedup_key (ذاك يُترك للقيد الفريد
    بقاعدة البيانات وقت الإدراج الفعلي — أضمن ضد التصادم بين أكثر من Worker)."""
    if not settings.enabled:
        return False
    if not category_enabled(settings, category):
        return False
    if is_quiet_hours(settings):
        return False
    if _today_sent_count(user.id) >= settings.daily_limit:
        return False

    if settings.last_sent_at:
        cooldown = DEFAULT_COOLDOWN_MINUTES
        if settings.consecutive_ignored >= IGNORED_STREAK_THRESHOLD:
            cooldown *= IGNORED_COOLDOWN_MULTIPLIER
        # last_sent_at مخزّن دائمًا بـdatetime.utcnow() (naive UTC) — نفس قاعدة كل created_at بالمشروع
        elapsed = datetime.utcnow() - settings.last_sent_at
        if elapsed < timedelta(minutes=cooldown):
            return False

    return True


def pick_template(category: str, exclude_template_id: str | None = None) -> NotificationTemplate | None:
    """اختيار عشوائي مرجّح بالأولوية — يستبعد آخر قالب انرسل لنفس المستخدم/التصنيف لتفادي
    التكرار الفوري. لو ماكو غيره متوفر (تصنيف بقالب واحد بس)، يرجّعه برضو (أفضل من ماكو شي)."""
    templates = NotificationTemplate.query.filter_by(category=category, active=True).all()
    if not templates:
        return None
    candidates = [t for t in templates if t.id != exclude_template_id] or templates
    weights = [max(1, t.priority) for t in candidates]
    return random.choices(candidates, weights=weights, k=1)[0]


def record_sent(user, template: NotificationTemplate, category: str, dedup_key: str) -> bool:
    """يسجّل الإرسال — يرجّع False بأمان لو صف مطابق (نفس user+category+dedup_key) موجود
    أصلًا (تصادم Worker ثاني سبقنا، أو إرسال مكرر بالخطأ)، بدل ما يرمي استثناء للمتصل."""
    from sqlalchemy.exc import IntegrityError

    settings = get_or_create_settings(user)
    # نعتبر آخر إشعار "متجاهل" إذا مرّ عليه وقت كافي وماكو opened_at — يُحسب مرة وحدة فقط هنا
    if settings.last_sent_at and not _was_last_notification_opened(user.id):
        settings.consecutive_ignored += 1
    else:
        settings.consecutive_ignored = 0

    row = UserNotification(
        user_id=user.id, template_id=template.id, category=category, dedup_key=dedup_key,
    )
    db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return False

    settings.last_sent_category = category
    settings.last_sent_template_id = template.id
    settings.last_sent_at = datetime.utcnow()
    db.session.commit()
    return True


def _was_last_notification_opened(user_id: str) -> bool:
    last = UserNotification.query.filter_by(user_id=user_id).order_by(UserNotification.sent_at.desc()).first()
    return bool(last and last.opened_at)


def mark_opened(notification_id: str) -> None:
    row = UserNotification.query.get(notification_id)
    if not row:
        return
    row.opened_at = datetime.utcnow()
    settings = NotificationSettings.query.get(row.user_id)
    if settings:
        settings.consecutive_ignored = 0
    db.session.commit()


def user_push_subscriptions(user_id: str) -> list:
    return PushSubscription.query.filter_by(user_id=user_id).all()


def send_notification(user, category: str, dedup_key: str, url: str) -> bool:
    """نقطة الدخول الوحيدة لإرسال إشعار فعلي — يُستخدم من scheduler.py (Ticks الدورية)
    ومن orchestrator.py (أحداث فورية متل محطة Streak). يفحص كل القواعد، يختار قالب،
    يسجّل الإرسال بأمان من التصادم، ثم يرسل Push فعلي لكل اشتراكات المستخدم. لا يرمي
    استثناء أبدًا للمتصل — فشل إشعار ما يوقف أي عملية ثانية (نفس مبدأ email_service.py)."""
    try:
        settings = get_or_create_settings(user)
        if not can_send_now(user, settings, category):
            return False
        template = pick_template(category, exclude_template_id=settings.last_sent_template_id)
        if not template:
            return False
        if not record_sent(user, template, category, dedup_key):
            return False

        from nutrition_ai.notifications import push
        sent_any = False
        for sub in user_push_subscriptions(user.id):
            if push.send_push(sub, template.title, template.body, url, category):
                sent_any = True
        return sent_any
    except Exception:
        return False
