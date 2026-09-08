"""
اختبارات إنفاذ التجربة المجانية — تعيد إنتاج الفجوة المؤكَّدة (أي رسالة شات غير محاولة تسجيل
وجبة كانت تستمر تعمل بلا قيد بعد انتهاء الوجبات المجانية) وتتحقق من إصلاح Race Condition
بالعداد (UPDATE Atomic بدل اقرأ-ثم-اكتب).
"""
from models import db, MealLog
import nutrition_engine


def send(user, models_dict, text, debug=False):
    return nutrition_engine.handle_message(user, text, db, models_dict, debug=debug)


class TestChatGateBlocksEverythingNotJustLogging:
    def test_non_logging_message_blocked_via_real_route_when_trial_exhausted(self, client_user):
        """إعادة إنتاج الفجوة الحقيقية: 'شنو آكل؟' (توصية، مو تسجيل) يجب تُقفل فورًا،
        وليس فقط محاولة تسجيل وجبة."""
        client, user, csrf_token = client_user
        user.free_meals_used = 6
        db.session.commit()

        r = client.post(
            "/api/chat",
            json={"message": "شنو آكل؟"},
            headers={"X-CSRFToken": csrf_token},
        )
        data = r.get_json()
        assert data["premium_required"] is True
        assert "subscribe_url" in data

    def test_greeting_also_blocked_when_trial_exhausted(self, client_user):
        client, user, csrf_token = client_user
        user.free_meals_used = 6
        db.session.commit()

        r = client.post(
            "/api/chat",
            json={"message": "هلا"},
            headers={"X-CSRFToken": csrf_token},
        )
        assert r.get_json()["premium_required"] is True

    def test_chat_works_normally_with_meals_remaining(self, client_user):
        client, user, csrf_token = client_user
        user.free_meals_used = 2
        db.session.commit()

        r = client.post(
            "/api/chat",
            json={"message": "هلا"},
            headers={"X-CSRFToken": csrf_token},
        )
        data = r.get_json()
        assert not data.get("premium_required")
        assert data["reply"]


class TestAtomicFreeMealCounter:
    def test_meal_logs_successfully_when_slot_available(self, user, models_dict):
        user.free_meals_used = 5
        db.session.commit()
        r = send(user, models_dict, "اكلت بيضتين")
        assert r["meal_logged"] is True
        assert user.free_meals_used == 6

    def test_seventh_meal_blocked_with_no_extra_meallog(self, user, models_dict):
        user.free_meals_used = 6
        db.session.commit()
        r = send(user, models_dict, "اكلت بيضتين")
        assert r["meal_logged"] is False
        assert r.get("premium_required") is True
        assert MealLog.query.filter_by(user_id=user.id).count() == 0

    def test_atomic_update_rejects_second_call_after_slot_consumed(self, user, models_dict, app):
        """يحاكي التزامن: بعد ما تستهلك أول عملية الفتحة الأخيرة فعليًا (Commit)، أي محاولة
        ثانية تصطدم بشرط WHERE الحقيقي بقاعدة البيانات وتُرفض — مو بقيمة قديمة بالذاكرة فقط."""
        user.free_meals_used = 5
        db.session.commit()

        r1 = send(user, models_dict, "اكلت بيضتين")
        assert r1["meal_logged"] is True
        assert user.free_meals_used == 6

        r2 = send(user, models_dict, "اكلت صمونة")
        assert r2["meal_logged"] is False
        assert r2.get("premium_required") is True
        assert MealLog.query.filter_by(user_id=user.id).count() == 1

    def test_premium_user_never_blocked_regardless_of_counter(self, user, models_dict):
        from datetime import timedelta, datetime
        from models import Subscription

        user.free_meals_used = 999  # حتى لو تجاوز نظريًا من قبل الاشتراك
        db.session.add(Subscription(
            user_id=user.id, plan_code="monthly", status="active",
            start_date=datetime.utcnow(), end_date=datetime.utcnow() + timedelta(days=30),
        ))
        db.session.commit()

        assert user.trial_exhausted is False
        r = send(user, models_dict, "اكلت بيضتين")
        assert r["meal_logged"] is True


class TestRecipeStartGate:
    def test_start_cooking_blocked_when_trial_exhausted(self, client_user, app):
        from models import Recipe

        client, user, csrf_token = client_user
        user.free_meals_used = 6
        db.session.commit()
        recipe = Recipe.query.filter_by(active=True).first()
        assert recipe is not None, "لازم وصفة مفعّلة موجودة بالبذرة الافتراضية"

        r = client.post(
            f"/recipes/{recipe.slug}/start",
            json={},
            headers={"X-CSRFToken": csrf_token},
        )
        data = r.get_json()
        assert data["ok"] is False
        assert "مجاني" in data["message"] or "اشترك" in data["message"]


class TestUndoStillReversesCounterCorrectly:
    def test_undo_after_atomic_increment_restores_counter(self, user, models_dict):
        free_before = user.free_meals_used
        send(user, models_dict, "اكلت بيضة")
        assert user.free_meals_used == free_before + 1
        send(user, models_dict, "شيلها")
        assert user.free_meals_used == free_before
