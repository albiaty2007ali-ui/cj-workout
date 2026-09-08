"""
اختبارات نظام الإشعارات: زراعة القوالب، قواعد Anti-Spam (Quiet Hours/الحد اليومي/Cooldown/
عدم تكرار فوري/تراجع بعد تجاهل متكرر)، أمان القيد الفريد ضد إرسال مضاعف، تذكير الوجبات
(تخطي وجبة مسجّلة + عودة بعد غياب مرة وحدة لا Backlog)، ومحطة Streak حقيقية مربوطة بحدث فعلي.
"""
import os
import re
from datetime import datetime, timedelta

import iraq_time
from models import db, User, NotificationSettings, UserNotification, NotificationTemplate, MealStatus, PushSubscription
from nutrition_ai.notifications import engine
from nutrition_ai.notifications.engine import seed_default_notification_templates
import nutrition_engine


def send(user, models_dict, text, debug=False):
    return nutrition_engine.handle_message(user, text, db, models_dict, debug=debug)


def _extract(pattern: str, html: str) -> str:
    m = re.search(pattern, html)
    assert m, f"couldn't find pattern {pattern!r} in response"
    return m.group(1)


def _at(hour, minute):
    return datetime(2026, 1, 1, hour, minute)


def _neutral_settings(user):
    """إعدادات إشعارات بدون ساعات عدم إزعاج (start==end) — تعزل اختبارات لا تخص Quiet Hours
    عن وقت التشغيل الفعلي بتوقيت بغداد (الافتراضي 22:00-08:00 قد يطابق وقت تشغيل الاختبار)."""
    settings = engine.get_or_create_settings(user)
    settings.quiet_hours_start = settings.quiet_hours_end
    return settings


class TestNotificationTemplateSeed:
    def test_seed_is_idempotent(self, app):
        count_before = NotificationTemplate.query.count()
        seed_default_notification_templates()
        assert NotificationTemplate.query.count() == count_before
        assert count_before > 0

    def test_seed_covers_all_documented_categories(self, app):
        categories = {t.category for t in NotificationTemplate.query.all()}
        expected = {
            "BREAKFAST", "LUNCH", "DINNER", "SNACK", "WATER", "STREAK", "XP", "MOTIVATION",
            "RECIPE", "PROGRESS", "RETURN", "MEAL_REMINDER", "DAILY_SUMMARY", "CONSISTENCY", "HYDRATION",
        }
        assert expected.issubset(categories)

    def test_no_two_templates_in_same_category_are_identical_text(self, app):
        # تأكيد "لا رسائل متشابهة جدًا فقط لتكبير العدد" — كل قالب بنفس التصنيف نص مختلف فعليًا
        for category in {t.category for t in NotificationTemplate.query.all()}:
            bodies = [t.body for t in NotificationTemplate.query.filter_by(category=category).all()]
            assert len(bodies) == len(set(bodies))


class TestQuietHoursAndToggles:
    def test_quiet_hours_wraparound_midnight(self, app, user):
        settings = engine.get_or_create_settings(user)
        settings.quiet_hours_start = "22:00"
        settings.quiet_hours_end = "08:00"
        db.session.commit()
        assert engine.is_quiet_hours(settings, now=_at(23, 0)) is True
        assert engine.is_quiet_hours(settings, now=_at(3, 0)) is True
        assert engine.is_quiet_hours(settings, now=_at(12, 0)) is False

    def test_disabled_master_toggle_blocks_everything(self, app, user):
        settings = engine.get_or_create_settings(user)
        settings.enabled = False
        db.session.commit()
        assert engine.can_send_now(user, settings, "BREAKFAST") is False

    def test_category_toggle_off_blocks_only_that_category(self, app, user):
        settings = _neutral_settings(user)
        settings.enabled = True
        settings.breakfast_enabled = False
        db.session.commit()
        assert engine.can_send_now(user, settings, "BREAKFAST") is False
        assert engine.can_send_now(user, settings, "LUNCH") is True


class TestDailyLimitAndCooldown:
    def test_daily_limit_blocks_once_reached(self, app, user):
        settings = _neutral_settings(user)
        settings.enabled = True
        settings.daily_limit = 2
        db.session.commit()
        db.session.add(UserNotification(user_id=user.id, category="MOTIVATION", dedup_key="k1"))
        db.session.add(UserNotification(user_id=user.id, category="XP", dedup_key="k2"))
        db.session.commit()
        assert engine.can_send_now(user, settings, "STREAK") is False

    def test_cooldown_blocks_immediate_second_send_regardless_of_category(self, app, user):
        settings = _neutral_settings(user)
        settings.enabled = True
        settings.last_sent_at = datetime.utcnow()
        db.session.commit()
        assert engine.can_send_now(user, settings, "XP") is False

    def test_cooldown_elapsed_allows_send_again(self, app, user):
        settings = _neutral_settings(user)
        settings.enabled = True
        settings.last_sent_at = datetime.utcnow() - timedelta(minutes=200)
        db.session.commit()
        assert engine.can_send_now(user, settings, "XP") is True


class TestAntiRepeatAndDecay:
    def test_pick_template_excludes_last_sent_template(self, app):
        templates = NotificationTemplate.query.filter_by(category="BREAKFAST", active=True).all()
        assert len(templates) >= 2
        last = templates[0]
        for _ in range(25):
            picked = engine.pick_template("BREAKFAST", exclude_template_id=last.id)
            assert picked is not None
            assert picked.id != last.id

    def test_ignored_streak_increases_effective_cooldown(self, app, user):
        settings = _neutral_settings(user)
        settings.enabled = True
        settings.consecutive_ignored = 3
        settings.last_sent_at = datetime.utcnow() - timedelta(minutes=100)  # فوق الـCooldown العادي (90) وتحت المضاعف (270)
        db.session.commit()
        assert engine.can_send_now(user, settings, "XP") is False

    def test_opening_a_notification_resets_ignored_counter(self, app, user):
        settings = engine.get_or_create_settings(user)
        settings.consecutive_ignored = 5
        db.session.commit()
        template = NotificationTemplate.query.first()
        row = UserNotification(user_id=user.id, template_id=template.id, category=template.category, dedup_key="open-test")
        db.session.add(row)
        db.session.commit()

        engine.mark_opened(row.id)
        db.session.refresh(settings)
        assert settings.consecutive_ignored == 0
        assert row.opened_at is not None


class TestDedupSafety:
    def test_record_sent_rejects_duplicate_dedup_key(self, app, user):
        template = NotificationTemplate.query.filter_by(category="BREAKFAST").first()
        assert engine.record_sent(user, template, "BREAKFAST", "2026-01-01") is True
        assert engine.record_sent(user, template, "BREAKFAST", "2026-01-01") is False
        assert UserNotification.query.filter_by(user_id=user.id, category="BREAKFAST").count() == 1

    def test_different_dedup_key_same_day_different_category_both_succeed(self, app, user):
        b_template = NotificationTemplate.query.filter_by(category="BREAKFAST").first()
        l_template = NotificationTemplate.query.filter_by(category="LUNCH").first()
        assert engine.record_sent(user, b_template, "BREAKFAST", "2026-01-01") is True
        assert engine.record_sent(user, l_template, "LUNCH", "2026-01-01") is True


class TestPushConfiguration:
    def test_send_push_fails_safe_without_vapid_keys(self, app, user):
        from nutrition_ai.notifications import push
        sub = PushSubscription(user_id=user.id, endpoint="https://example.com/ep-test", p256dh="k", auth="a")
        db.session.add(sub)
        db.session.commit()
        assert push.is_configured() is False
        assert push.send_push(sub, "عنوان", "نص", "/app", "MOTIVATION") is False


class TestSchedulerMealReminderTick:
    def test_skips_already_logged_meal(self, app, user):
        from nutrition_ai.notifications import scheduler as sched
        settings = engine.get_or_create_settings(user)
        settings.enabled = True
        settings.breakfast_time = iraq_time.now_baghdad().strftime("%H:%M")
        db.session.commit()
        today = iraq_time.now_baghdad().date()
        db.session.add(MealStatus(user_id=user.id, date=today, meal_type="breakfast", status="logged"))
        db.session.commit()

        sched.run_meal_reminder_tick(app)
        assert UserNotification.query.filter_by(user_id=user.id, category="BREAKFAST").count() == 0

    def test_sends_when_meal_not_logged_and_time_matches(self, app, user):
        from nutrition_ai.notifications import scheduler as sched
        settings = _neutral_settings(user)
        settings.enabled = True
        settings.breakfast_time = iraq_time.now_baghdad().strftime("%H:%M")
        db.session.commit()

        sched.run_meal_reminder_tick(app)
        assert UserNotification.query.filter_by(user_id=user.id, category="BREAKFAST").count() == 1

    def test_disabled_settings_sends_nothing(self, app, user):
        from nutrition_ai.notifications import scheduler as sched
        settings = engine.get_or_create_settings(user)
        settings.enabled = False
        settings.breakfast_time = iraq_time.now_baghdad().strftime("%H:%M")
        db.session.commit()

        sched.run_meal_reminder_tick(app)
        assert UserNotification.query.filter_by(user_id=user.id).count() == 0

    def test_absent_user_gets_return_message_not_meal_reminder(self, app, user):
        from nutrition_ai.notifications import scheduler as sched
        settings = _neutral_settings(user)
        settings.enabled = True
        settings.breakfast_time = iraq_time.now_baghdad().strftime("%H:%M")
        db.session.commit()
        user.last_active_date = iraq_time.now_baghdad().date() - timedelta(days=5)
        db.session.commit()

        sched.run_meal_reminder_tick(app)
        assert UserNotification.query.filter_by(user_id=user.id, category="RETURN").count() == 1
        assert UserNotification.query.filter_by(user_id=user.id, category="BREAKFAST").count() == 0

    def test_return_sent_once_not_once_per_meal_window(self, app, user):
        """3 نوافذ وجبات (فطور/غداء/عشا) بنفس اللحظة — يوصل إشعار عودة واحد بس، مو Backlog."""
        from nutrition_ai.notifications import scheduler as sched
        settings = _neutral_settings(user)
        settings.enabled = True
        now_hm = iraq_time.now_baghdad().strftime("%H:%M")
        settings.breakfast_time = now_hm
        settings.lunch_time = now_hm
        settings.dinner_time = now_hm
        db.session.commit()
        user.last_active_date = iraq_time.now_baghdad().date() - timedelta(days=5)
        db.session.commit()

        sched.run_meal_reminder_tick(app)
        assert UserNotification.query.filter_by(user_id=user.id, category="RETURN").count() == 1


class TestStreakEventDrivenNotification:
    def test_real_streak_milestone_triggers_push_attempt(self, user, models_dict):
        settings = _neutral_settings(user)
        settings.enabled = True
        db.session.commit()

        r = send(user, models_dict, "اكلت بيضة")
        assert r["meal_logged"] is True
        # أول يوم نشاط = محطة "أول يوم" الحقيقية بـstreaks.DEFAULT_MILESTONES — لازم يحاول يرسل STREAK فعلي
        assert UserNotification.query.filter_by(user_id=user.id, category="STREAK").count() >= 1


class TestNotificationSettingsEndpoints:
    def test_save_settings_persists_real_values(self, client_user):
        client, test_user, csrf = client_user
        res = client.post("/settings/notifications", json={
            "enabled": True, "daily_limit": 3, "quiet_hours_start": "23:00", "quiet_hours_end": "07:00",
            "breakfast_enabled": False,
        }, headers={"X-CSRFToken": csrf})
        assert res.get_json()["ok"] is True

        settings = NotificationSettings.query.get(test_user.id)
        assert settings.enabled is True
        assert settings.daily_limit == 3
        assert settings.quiet_hours_start == "23:00"
        assert settings.breakfast_enabled is False

    def test_invalid_time_format_rejected(self, client_user):
        client, test_user, csrf = client_user
        res = client.post("/settings/notifications", json={"quiet_hours_start": "99:99"}, headers={"X-CSRFToken": csrf})
        assert res.status_code == 400

    def test_daily_limit_out_of_range_rejected(self, client_user):
        client, test_user, csrf = client_user
        res = client.post("/settings/notifications", json={"daily_limit": 999}, headers={"X-CSRFToken": csrf})
        assert res.status_code == 400

    def test_vapid_public_key_empty_when_unconfigured(self, client_user):
        client, test_user, csrf = client_user
        res = client.get("/settings/vapid-public-key")
        assert res.get_json()["public_key"] == ""

    def test_push_subscribe_then_unsubscribe(self, client_user):
        client, test_user, csrf = client_user
        sub_data = {"endpoint": "https://example.com/ep-1", "keys": {"p256dh": "abc", "auth": "def"}}
        res = client.post("/settings/push-subscribe", json=sub_data, headers={"X-CSRFToken": csrf})
        assert res.get_json()["ok"] is True
        assert PushSubscription.query.filter_by(user_id=test_user.id).count() == 1

        res2 = client.post("/settings/push-unsubscribe", json={"endpoint": "https://example.com/ep-1"}, headers={"X-CSRFToken": csrf})
        assert res2.get_json()["ok"] is True
        assert PushSubscription.query.filter_by(user_id=test_user.id).count() == 0

    def test_push_opened_marks_notification_and_resets_ignored(self, client_user):
        client, test_user, csrf = client_user
        settings = engine.get_or_create_settings(test_user)
        settings.consecutive_ignored = 4
        db.session.commit()
        template = NotificationTemplate.query.first()
        row = UserNotification(user_id=test_user.id, template_id=template.id, category=template.category, dedup_key="opened-test")
        db.session.add(row)
        db.session.commit()

        res = client.post("/settings/push-opened", json={"notification_id": row.id})
        assert res.get_json()["ok"] is True
        db.session.refresh(row)
        db.session.refresh(settings)
        assert row.opened_at is not None
        assert settings.consecutive_ignored == 0


class _AdminClient:
    def __init__(self, app):
        self.client = app.test_client()
        self.user = User(name="Admin Captain", email=f"admin-notif-{os.urandom(4).hex()}@test.com", role="admin")
        self.user.set_password("password123")
        self.user.onboarding_completed = True
        db.session.add(self.user)
        db.session.commit()

        login_page = self.client.get("/login").get_data(as_text=True)
        login_csrf = _extract(r'name="csrf_token"[^>]*value="([^"]+)"', login_page)
        self.client.post("/login", data={
            "csrf_token": login_csrf, "email": self.user.email, "password": "password123",
        }, follow_redirects=True)

    def csrf_from(self, url):
        html = self.client.get(url).get_data(as_text=True)
        return _extract(r'name="csrf_token"[^>]*value="([^"]+)"', html)


class TestAdminNotificationTemplateCRUD:
    def test_add_toggle_delete_template(self, app):
        admin = _AdminClient(app)
        csrf = admin.csrf_from("/admin/notifications")
        admin.client.post("/admin/notifications/add", data={
            "csrf_token": csrf, "category": "MOTIVATION", "title": "عنوان اختبار",
            "body": "نص اختبار للإشعار", "priority": "0", "cooldown_minutes": "0",
        }, follow_redirects=True)
        template = NotificationTemplate.query.filter_by(title="عنوان اختبار").first()
        assert template is not None
        assert template.active is True

        toggle_csrf = admin.csrf_from("/admin/notifications")
        admin.client.post(f"/admin/notifications/{template.id}/toggle", data={"csrf_token": toggle_csrf}, follow_redirects=True)
        db.session.refresh(template)
        assert template.active is False

        delete_csrf = admin.csrf_from("/admin/notifications")
        admin.client.post(f"/admin/notifications/{template.id}/delete", data={"csrf_token": delete_csrf}, follow_redirects=True)
        assert NotificationTemplate.query.get(template.id) is None
