"""
اختبارات GENERAL_NUTRITION الحقيقي (كان Constant ميت بدون أي Trigger أو معالج) + توسيع
ASK_REMAINING ليجاوب عن ماكرو محدد (بروتين/كارب/دهون) بدل السعرات دائمًا.
"""
from nutrition_ai import macros
from models import db, NutritionProfile
import nutrition_engine


def send(user, models_dict, text, debug=False):
    return nutrition_engine.handle_message(user, text, db, models_dict, debug=debug)


class TestGeneralNutritionIntent:
    def test_protein_question_gets_real_answer_not_log_meal(self, user, models_dict):
        r = send(user, models_dict, "شنو فايدة البروتين؟", debug=True)
        assert r["debug"]["intent"] == "GENERAL_NUTRITION"
        assert r["meal_logged"] is False
        assert "بروتين" in r["reply"]

    def test_carb_harmful_question(self, user, models_dict):
        r = send(user, models_dict, "الكارب مضر؟", debug=True)
        assert r["debug"]["intent"] == "GENERAL_NUTRITION"
        assert "كارب" in r["reply"]

    def test_fat_question(self, user, models_dict):
        r = send(user, models_dict, "شنو الدهون المفيدة؟", debug=True)
        assert r["debug"]["intent"] == "GENERAL_NUTRITION"

    def test_pre_workout_question_gets_specific_topic_not_generic(self, user, models_dict):
        r = send(user, models_dict, "شنو فايدة الأكل قبل التمرين؟", debug=True)
        assert r["debug"]["intent"] == "GENERAL_NUTRITION"
        assert "تمرين" in r["reply"]

    def test_does_not_hijack_real_food_logging(self, user, models_dict):
        """'اكلت بروتين بار' لازم تبقى LOG_MEAL — GENERAL_NUTRITION ما يفترض يتدخل بدون علامة سؤال."""
        r = send(user, models_dict, "اكلت بروتين بار", debug=True)
        assert r["debug"]["intent"] == "LOG_MEAL"

    def test_does_not_hijack_portion_question_for_specific_food(self, user, models_dict):
        r = send(user, models_dict, "مشتهي دولمه شكد لازم اكل", debug=True)
        assert r["debug"]["intent"] == "ASK_PORTION_FOR_FOOD"


class TestMacroAwareRemaining:
    def test_plain_remaining_question_still_answers_calories(self, user, models_dict):
        """Regression: بدون ذكر ماكرو محدد، يبقى السلوك القديم (سعرات) بدون تغيير."""
        r = send(user, models_dict, "شكد باقيلي؟", debug=True)
        assert r["debug"]["intent"] == "ASK_REMAINING"
        assert "سعرة" in r["reply"]

    def test_protein_remaining_gives_real_grams_not_calories(self, user, models_dict):
        profile = NutritionProfile.query.filter_by(user_id=user.id).first()
        targets = macros.calculate_targets(profile.calorie_target, profile.weight_kg, profile.goal)

        r = send(user, models_dict, "شكد بروتين باقيلي؟", debug=True)
        assert r["debug"]["intent"] == "ASK_REMAINING"
        assert "غم" in r["reply"]
        assert "بروتين" in r["reply"]
        assert str(targets["protein_g"]) in r["reply"]  # ماكو وجبات مسجّلة بعد، فالباقي = الهدف الكامل

    def test_carb_remaining_gives_real_grams(self, user, models_dict):
        r = send(user, models_dict, "شكد كارب باقيلي؟", debug=True)
        assert r["debug"]["intent"] == "ASK_REMAINING"
        assert "كارب" in r["reply"]

    def test_fat_remaining_gives_real_grams(self, user, models_dict):
        r = send(user, models_dict, "شكد دهون باقيلي؟", debug=True)
        assert r["debug"]["intent"] == "ASK_REMAINING"
        assert "دهون" in r["reply"]

    def test_protein_remaining_reflects_logged_meal(self, user, models_dict):
        """بعد تسجيل وجبة فيها بروتين حقيقي، الباقي لازم ينزل عن الهدف الكامل (مو يبقى نفسه)."""
        profile = NutritionProfile.query.filter_by(user_id=user.id).first()
        targets = macros.calculate_targets(profile.calorie_target, profile.weight_kg, profile.goal)

        send(user, models_dict, "اكلت بيضتين")
        r = send(user, models_dict, "شكد بروتين باقيلي؟", debug=True)
        # "من أصل X" يبقى يظهر دايمًا كسياق — الفحص الحقيقي إن "باقيلك تقريبًا X" (يعني ماكو
        # أي استهلاك انطرح) ما ظهرت، لأنها كانت تعني الباقي ما تغيّر عن الهدف الكامل
        assert f"باقيلك تقريبًا {targets['protein_g']} غم" not in r["reply"]
        assert f"من أصل {targets['protein_g']} غم" in r["reply"]
