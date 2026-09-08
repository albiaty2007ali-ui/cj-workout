"""
اختبارات رجوع (Regression) لميزات الجلسة الماضية (nutrition_ai/) — نتأكد إن إعادة هيكلة
orchestrator.py لهذي الجلسة (DIRECT_LOG/Undo) ما كسرت أي سلوك كان يشتغل صح قبلها.
"""
from models import db, MealLog, WaterLog
import nutrition_engine


def send(user, models_dict, text, debug=False):
    return nutrition_engine.handle_message(user, text, db, models_dict, debug=debug)


class TestSwapFlow:
    def test_swap_food_shows_diff_and_awaits_confirm(self, user, models_dict):
        send(user, models_dict, "اكلت بيبسي")
        r = send(user, models_dict, "بدل البيبسي ببيبسي دايت")
        assert "الفرق" in r["reply"]
        assert r["meal_logged"] is False

        r2 = send(user, models_dict, "تمام")
        assert r2["meal_logged"] is True
        log = MealLog.query.filter_by(user_id=user.id).first()
        assert "بيبسي دايت" in log.matched_foods_json


class TestWaterAmbiguousAsksFirst:
    def test_bare_water_mention_asks_for_amount(self, user, models_dict):
        r = send(user, models_dict, "شربت ماي")
        assert WaterLog.query.filter_by(user_id=user.id).count() == 0
        assert "شكد" in r["reply"]


class TestWeightUpdate:
    def test_weight_update_recomputes_target(self, user, models_dict):
        r = send(user, models_dict, "وزني هسه 78")
        assert r.get("target_calories") is not None
        assert "78" in r["reply"]


class TestRemainingAndRecommendation:
    def test_remaining_query_before_any_meal(self, user, models_dict):
        r = send(user, models_dict, "باقيلي شكد؟")
        assert str(user.__class__) or True  # smoke: no crash
        assert "سعرة" in r["reply"]

    def test_recommendation_returns_real_foods(self, user, models_dict):
        r = send(user, models_dict, "شنو آكل هسه؟")
        assert "kcal" in r["reply"]


class TestEndOfDay:
    def test_end_of_day_after_a_direct_logged_meal(self, user, models_dict):
        send(user, models_dict, "اكلت بيضتين")
        r = send(user, models_dict, "راح أنام")
        assert "ملخص يومك" in r["reply"]
        assert "155" in r["reply"] or "بروتين" in r["reply"]


class TestCookingAssistant:
    def test_recipe_trigger_then_step_by_step(self, user, models_dict):
        r = send(user, models_dict, "خلينا نطبخ بيض بالطماطة")
        assert "بيض بالطماطة" in r["reply"]

        r2 = send(user, models_dict, "هسه شنو أسوي")
        assert r2["reply"]  # أول خطوة رجعت

        r3 = send(user, models_dict, "بعد شنو")
        assert r3["reply"] != r2["reply"]


class TestOfftopicAndMedical:
    def test_offtopic_declines_gracefully(self, user, models_dict):
        r = send(user, models_dict, "اكتبلي كود بايثون")
        assert "CJ WORKOUT" in r["reply"]
        assert MealLog.query.filter_by(user_id=user.id).count() == 0

    def test_medical_declines_gracefully(self, user, models_dict):
        r = send(user, models_dict, "عندي وجع مزمن")
        assert "مختص" in r["reply"] or "دكتور" in r["reply"]


class TestFreeMealCap:
    def test_seventh_confirmed_meal_requires_premium(self, user, models_dict):
        for _ in range(6):
            send(user, models_dict, "اكلت بيضة")
        r = send(user, models_dict, "اكلت بيضة")
        assert r.get("premium_required") is True
