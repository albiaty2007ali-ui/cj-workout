"""
اختبارات نظام البروفايل/الستريك/XP/الإعدادات الجديد — Ledger حقيقي، محطات ستريك بدون تكرار،
تعديل بروفايل، رفع/حذف صورة، خصوصية، حذف حساب، ونيات GREETING/THANKS/ACKNOWLEDGEMENT.
"""
import io
import json

from models import db, User, XPTransaction, ActiveDay
from nutrition_ai import streaks, xp_engine
import nutrition_engine


def send(user, models_dict, text, debug=False):
    return nutrition_engine.handle_message(user, text, db, models_dict, debug=debug)


class TestXPEngine:
    def test_award_xp_creates_ledger_row_and_increments_total(self, user):
        xp_before = user.xp
        granted = xp_engine.award_xp(user, 10, reason="test_reason", source="src-1")
        db.session.commit()
        assert granted is True
        assert user.xp == xp_before + 10
        row = XPTransaction.query.filter_by(user_id=user.id, source="src-1").first()
        assert row is not None and row.amount == 10 and row.reason == "test_reason"

    def test_award_xp_idempotent_on_same_source(self, user):
        xp_engine.award_xp(user, 10, reason="r", source="dup-source")
        db.session.commit()
        xp_after_first = user.xp
        granted_again = xp_engine.award_xp(user, 10, reason="r", source="dup-source")
        db.session.commit()
        assert granted_again is False
        assert user.xp == xp_after_first  # ما تضاعف

    def test_reverse_xp_creates_negative_transaction_with_different_source(self, user):
        xp_engine.award_xp(user, 10, reason="meal_logged", source="meal-1")
        db.session.commit()
        xp_engine.reverse_xp(user, 10, reason="meal_logged", source="meal-1")
        db.session.commit()
        reversal = XPTransaction.query.filter_by(user_id=user.id, source="meal-1_undo").first()
        assert reversal is not None and reversal.amount == -10


class TestStreakEngine:
    def test_first_active_day_sets_streak_to_one_and_awards_milestone(self, user):
        snapshot = streaks.record_active_day(user)
        db.session.commit()
        assert user.streak_days == 1
        assert user.longest_streak == 1
        assert snapshot["is_new_day"] is True
        assert any(m["days"] == 1 for m in snapshot["new_milestones"])

    def test_same_day_twice_does_not_double_count(self, user):
        streaks.record_active_day(user)
        db.session.commit()
        streak_after_first = user.streak_days
        snapshot2 = streaks.record_active_day(user)
        db.session.commit()
        assert user.streak_days == streak_after_first
        assert snapshot2["is_new_day"] is False
        assert ActiveDay.query.filter_by(user_id=user.id).count() == 1

    def test_undo_active_day_reverses_streak_and_removes_row(self, user):
        snapshot = streaks.record_active_day(user)
        db.session.commit()
        assert ActiveDay.query.filter_by(user_id=user.id).count() == 1

        streaks.undo_active_day(user, snapshot)
        db.session.commit()
        assert user.streak_days == 0
        assert ActiveDay.query.filter_by(user_id=user.id).count() == 0

    def test_days_absent_zero_for_never_active_user(self, user):
        assert streaks.days_absent(user) == 0


class TestGreetingIntents:
    def test_greeting_does_not_log_meal_or_change_xp(self, user, models_dict):
        xp_before = user.xp
        r = send(user, models_dict, "هلا")
        assert r["meal_logged"] is False
        assert user.xp == xp_before

    def test_thanks_does_not_change_anything(self, user, models_dict):
        xp_before = user.xp
        r = send(user, models_dict, "شكراً")
        assert r["meal_logged"] is False
        assert user.xp == xp_before

    def test_acknowledgement_without_pending_does_not_log(self, user, models_dict):
        r = send(user, models_dict, "تمام")
        assert r["meal_logged"] is False

    def test_greeting_word_inside_real_meal_message_still_logs(self, user, models_dict):
        """'هلا' لحالها = تحية، لكن رسالة أكل حقيقية طويلة ما تنبلع حتى لو بدأت بكلمة ترحيب."""
        r = send(user, models_dict, "هلا كابتن اكلت بيضتين وصمونة هسه")
        assert r["meal_logged"] is True


class TestProfileEdit:
    def test_edit_updates_name_username_bio(self, client_user, models_dict):
        client, user, csrf = client_user
        resp = client.post(
            "/profile/edit",
            data=json.dumps({"name": "علي الجديد", "username": "ali_test", "bio": "رياضي عراقي"}),
            content_type="application/json",
            headers={"X-CSRFToken": csrf},
        )
        assert resp.status_code == 200
        assert resp.get_json()["ok"] is True
        refreshed = User.query.get(user.id)
        assert refreshed.name == "علي الجديد"
        assert refreshed.username == "ali_test"
        assert refreshed.bio == "رياضي عراقي"

    def test_duplicate_username_rejected(self, client_user, models_dict):
        client, user, csrf = client_user
        other = User(name="Other", email="other@test.com", role="user", username="taken")
        other.set_password("password123")
        db.session.add(other)
        db.session.commit()

        resp = client.post(
            "/profile/edit",
            data=json.dumps({"name": "Ali", "username": "taken", "bio": ""}),
            content_type="application/json",
            headers={"X-CSRFToken": csrf},
        )
        assert resp.status_code == 400
        assert "username" in resp.get_json()["errors"]


class TestPrivacyEnforcement:
    def test_private_profile_hidden_from_others(self, client_user, models_dict):
        client, user, csrf = client_user
        user.username = "privateuser"
        user.profile_visibility = "private"
        db.session.commit()

        client.get("/logout")
        resp = client.get("/u/privateuser")
        assert resp.status_code == 403

    def test_public_profile_visible(self, client_user, models_dict):
        client, user, csrf = client_user
        user.username = "publicuser"
        db.session.commit()
        resp = client.get("/u/publicuser")
        assert resp.status_code == 200


class TestAccountDeletion:
    def test_delete_account_disables_and_scrubs(self, client_user, models_dict):
        client, user, csrf = client_user
        original_email = user.email

        resp = client.post(
            "/settings/delete-account",
            data=json.dumps({"password": "password123"}),
            content_type="application/json",
            headers={"X-CSRFToken": csrf},
        )
        assert resp.status_code == 200
        refreshed = User.query.get(user.id)
        assert refreshed.disabled is True
        assert refreshed.name == "مستخدم محذوف"
        assert refreshed.email != original_email
        assert refreshed.username is None
