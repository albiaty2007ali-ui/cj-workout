"""
اختبارات آلية لآلة حالة تسجيل الوجبة (DIRECT_LOG / AWAITING_CONFIRMATION / UNDO / REOPEN)
— تغطي حرفيًا كل حالات الاختبار المطلوبة صراحة: رسالة واضحة تمامًا تُسجَّل فورًا، وجبة مبنية
عبر أكثر من رسالة تحتاج تأكيد صريح، رغبة/احتمال ما يسجّل أبدًا، تصحيح بعد تسجيل مباشر يعيد
فتح الوجبة، تراجع يرجّع كل الآثار الجانبية (MealLog + XP + free_meals_used + streak)، ونافذة
تراجع منتهية ما تلغي شي.
"""
from datetime import timedelta

import iraq_time
import nutrition_engine
from models import db, MealLog, WaterLog
from nutrition_ai import direct_log


def send(user, models_dict, text, debug=False):
    return nutrition_engine.handle_message(user, text, db, models_dict, debug=debug)


def meal_count(user):
    return MealLog.query.filter_by(user_id=user.id).count()


class TestDirectLogSingleMessage:
    def test_single_egg_logs_immediately(self, user, models_dict):
        r = send(user, models_dict, "اكلت بيضة")
        assert r["meal_logged"] is True
        assert meal_count(user) == 1

    def test_two_eggs_logs_immediately_with_correct_calories(self, user, models_dict):
        r = send(user, models_dict, "اكلت بيضتين")
        assert r["meal_logged"] is True
        log = MealLog.query.filter_by(user_id=user.id).first()
        assert log.total_calories == 155

    def test_three_eggs_logs_immediately(self, user, models_dict):
        r = send(user, models_dict, "اكلت 3 بيضات")
        assert r["meal_logged"] is True
        assert meal_count(user) == 1

    def test_two_foods_one_message_logs_immediately(self, user, models_dict):
        r = send(user, models_dict, "اكلت صمونة وبيضتين")
        assert r["meal_logged"] is True
        assert meal_count(user) == 1

    def test_water_logs_immediately(self, user, models_dict):
        r = send(user, models_dict, "شربت 500 مل ماي")
        assert WaterLog.query.filter_by(user_id=user.id).count() == 1
        assert "500" in r["reply"]

    def test_direct_log_reply_has_no_confirm_prompt(self, user, models_dict):
        r = send(user, models_dict, "اكلت بيضة")
        assert "أثبتها" not in r["reply"]


class TestMultiTurnMealNeedsExplicitConfirmation:
    def test_bulk_food_asks_quantity_first(self, user, models_dict):
        r = send(user, models_dict, "اكلت تمن")
        assert r["meal_logged"] is False
        assert meal_count(user) == 0

    def test_quantity_answer_awaits_confirmation_not_direct_log(self, user, models_dict):
        send(user, models_dict, "اكلت تمن")
        r = send(user, models_dict, "5 خواشيق", debug=True)
        assert r["meal_logged"] is False
        assert meal_count(user) == 0
        assert r["debug"]["meal_state"] == "AWAITING_CONFIRMATION"
        assert "شكد تقريب" not in r["reply"]  # لازم يكون تجاوز سؤال الكمية، مو يعيده

    def test_explicit_confirm_then_logs(self, user, models_dict):
        send(user, models_dict, "اكلت تمن")
        send(user, models_dict, "5 خواشيق")
        r = send(user, models_dict, "تمام")
        assert r["meal_logged"] is True
        assert meal_count(user) == 1


class TestExpressDesireNeverLogs:
    def test_desire_with_specific_food_does_not_log(self, user, models_dict):
        for text in ("أريد تمن", "اريد تمن", "يمكن آكل تمن", "أفكر آكل بيتزا", "أريد بيض"):
            r = send(user, models_dict, text)
            assert r["meal_logged"] is False, text
        assert meal_count(user) == 0

    def test_recommendation_question_does_not_log(self, user, models_dict):
        r = send(user, models_dict, "شنو آكل؟")
        assert r["meal_logged"] is False
        assert meal_count(user) == 0


class TestReopenForEditAfterDirectLog:
    def test_correction_reopens_deletes_old_log_and_awaits_new_confirm(self, user, models_dict):
        send(user, models_dict, "اكلت بيضتين")
        assert meal_count(user) == 1

        r = send(user, models_dict, "لا مو بيضتين، 3")
        assert meal_count(user) == 0  # الوجبة القديمة انحذفت لحين إعادة التأكيد
        assert r["meal_logged"] is False

        r2 = send(user, models_dict, "تمام")
        assert r2["meal_logged"] is True
        log = MealLog.query.filter_by(user_id=user.id).first()
        assert log.total_calories == 232  # 3 بيضات

    def test_remove_food_reopens_and_edits(self, user, models_dict):
        send(user, models_dict, "اكلت بيضة وصمونة")
        assert meal_count(user) == 1

        r = send(user, models_dict, "شيل الصمونة")
        assert meal_count(user) == 0
        assert r["meal_logged"] is False

        r2 = send(user, models_dict, "تمام")
        assert r2["meal_logged"] is True


class TestUndoWindow:
    def test_undo_reverses_meal_xp_and_free_meals(self, user, models_dict):
        xp_before = user.xp
        free_before = user.free_meals_used

        send(user, models_dict, "اكلت بيضة")
        assert meal_count(user) == 1
        # +10 تسجيل الوجبة، +5 محطة "أول يوم" بالستريك (يوم نشاط أول مرة)
        assert user.xp == xp_before + 15
        assert user.free_meals_used == free_before + 1

        send(user, models_dict, "شيلها")
        assert meal_count(user) == 0
        assert user.xp == xp_before
        assert user.free_meals_used == free_before

    def test_undo_reverses_streak_bump(self, user, models_dict):
        streak_before = user.streak_days
        last_active_before = user.last_active_date

        send(user, models_dict, "اكلت بيضة")
        assert user.streak_days == 1

        send(user, models_dict, "لا")
        assert user.streak_days == streak_before
        assert user.last_active_date == last_active_before

    def test_expired_undo_window_does_not_undo(self, user, models_dict):
        send(user, models_dict, "اكلت بيضة")
        assert meal_count(user) == 1

        snapshot = direct_log.load_valid(user, db)
        assert snapshot is not None
        expired_time = iraq_time.now_baghdad() - timedelta(seconds=10)
        snapshot["expires_at"] = expired_time.isoformat()
        direct_log.save(user, db, snapshot)

        send(user, models_dict, "لا")
        assert meal_count(user) == 1  # النافذة انتهت — ما انحذفت


class TestConfirmCancelWithoutPendingIsNoop:
    def test_confirm_without_pending_does_not_log(self, user, models_dict):
        r = send(user, models_dict, "تمام")
        assert r["meal_logged"] is False
        assert meal_count(user) == 0

    def test_cancel_without_pending_or_undo_is_harmless(self, user, models_dict):
        r = send(user, models_dict, "لا")
        assert r["meal_logged"] is False
        assert meal_count(user) == 0
