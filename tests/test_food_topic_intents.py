"""
اختبارات EXPRESS_CRAVING / PLAN_TO_EAT / ASK_PORTION_FOR_FOOD — تعيد إنتاج الـBug الحقيقي
المُبلَّغ عنه حرفيًا (المستخدم كتب "راح اكل دولمه" فسأله البوت "شكد أكلت؟"، ثم "مشتهي اكل دولمه"
فرد باقتراح وصفة دجاج مشوي غير مرتبطة إطلاقًا) وتتأكد من الإصلاح الجذري بدل تصحيح مثال واحد فقط.
"""
import json

from models import db, MealLog
import nutrition_engine


def send(user, models_dict, text, debug=False):
    return nutrition_engine.handle_message(user, text, db, models_dict, debug=debug)


class TestPlanToEatDoesNotLog:
    def test_plan_to_eat_does_not_create_pending_meal(self, user, models_dict):
        r = send(user, models_dict, "راح اكل دولمه", debug=True)
        assert r["debug"]["intent"] == "PLAN_TO_EAT"
        assert r["meal_logged"] is False
        assert user.pending_meal_json is None
        assert "دولمة" in r["reply"] or "دولمه" in r["reply"]
        # الـBug الأصلي: يسأل "شكد أكلت؟" وكأنه استهلاك فعلي — هذا ممنوع يصير بعد الإصلاح
        assert "أكلت" not in r["reply"]

    def test_plan_to_eat_alternate_phrasing(self, user, models_dict):
        r = send(user, models_dict, "ناوي اكل دولمه", debug=True)
        assert r["debug"]["intent"] == "PLAN_TO_EAT"
        assert user.pending_meal_json is None

    def test_plan_to_eat_stores_food_topic(self, user, models_dict):
        send(user, models_dict, "راح اكل دولمه")
        assert user.pending_food_topic_json is not None
        topic = json.loads(user.pending_food_topic_json)
        assert topic["food_name"] == "دولمة"
        assert topic["kind"] == "plan"


class TestExpressCravingDoesNotHijackToRecipe:
    def test_craving_mentions_the_actual_food_not_a_random_recipe(self, user, models_dict):
        """إعادة إنتاج مباشرة لثاني نصف الـBug بالصورة: 'مشتهي اكل دولمه' كانت ترجع وصفة
        'دجاج مشوي مع سلطة' بسبب تطابق ضبابي زائف بين 'مشتهي' و'مشوي'."""
        r = send(user, models_dict, "مشتهي اكل دولمه", debug=True)
        assert r["debug"]["intent"] == "EXPRESS_CRAVING"
        assert "دجاج" not in r["reply"]
        assert "مشوي" not in r["reply"]
        assert "دولم" in r["reply"]
        assert r["meal_logged"] is False

    def test_craving_bare_food_name(self, user, models_dict):
        r = send(user, models_dict, "مشتهي دولمه", debug=True)
        assert r["debug"]["intent"] == "EXPRESS_CRAVING"
        assert "دولم" in r["reply"]

    def test_craving_without_food_gives_generic_prompt(self, user, models_dict):
        r = send(user, models_dict, "مشتهي شي حلو مو معروف", debug=True)
        assert r["debug"]["intent"] == "EXPRESS_CRAVING"
        assert r["meal_logged"] is False


class TestAskPortionForFood:
    def test_combined_craving_and_portion_question_goes_straight_to_portion(self, user, models_dict):
        """'مشتهي دولمه، شكد لازم اكل؟' يجب يروح لتوصية كمية مباشرة، مو رد اشتهاء عام."""
        r = send(user, models_dict, "مشتهي دولمه، شكد لازم اكل؟", debug=True)
        assert r["debug"]["intent"] == "ASK_PORTION_FOR_FOOD"
        assert "دولم" in r["reply"]
        assert "kcal" in r["reply"]
        assert r["meal_logged"] is False

    def test_portion_question_uses_real_portion_data(self, user, models_dict):
        import food_search
        r = send(user, models_dict, "شكد آكل من الدولمة؟", debug=True)
        assert r["debug"]["intent"] == "ASK_PORTION_FOR_FOOD"
        # التحقق إن الرقم بالرد مطابق فعليًا لما يرجعه calculator.compute_food لنفس الـfood_id/grams
        from nutrition_ai import calculator
        portions = food_search.get_portions_for(12)  # دولمة seeded بـfoods_seed.py
        assert portions, "لازم دولمة تكون موجودة بقاعدة بيانات الاختبار"
        expected_cal = calculator.compute_food(12, portions[0]["grams"])["calories"]
        assert str(expected_cal) in r["reply"]

    def test_short_followup_resolves_food_from_memory(self, user, models_dict):
        """'مشتهي دولمة' ثم 'شكد آكل؟' وحدها — يجب يفهم دولمة من الذاكرة القصيرة بدون إعادة ذكرها."""
        send(user, models_dict, "مشتهي دولمة")
        r = send(user, models_dict, "شكد آكل؟", debug=True)
        assert r["debug"]["intent"] == "ASK_PORTION_FOR_FOOD"
        assert "دولم" in r["reply"]

    def test_confirm_after_craving_triggers_portion_not_generic_ack(self, user, models_dict):
        """'مشتهي دولمة' ثم 'اي' — يجب يفهمها كطلب حساب الكمية، مو رد عام لا علاقة له بالدولمة."""
        send(user, models_dict, "مشتهي دولمة")
        r = send(user, models_dict, "اي", debug=True)
        assert r["debug"]["intent"] == "CONFIRM"
        assert "دولم" in r["reply"]
        assert "kcal" in r["reply"]


class TestCancelAndNotYetForFoodTopic:
    def test_cancel_after_plan_clears_food_topic(self, user, models_dict):
        send(user, models_dict, "راح آكل دولمة")
        r = send(user, models_dict, "ماريد", debug=True)
        assert r["debug"]["intent"] == "CANCEL"
        assert user.pending_food_topic_json is None

    def test_not_yet_after_plan_keeps_topic_and_gives_generic_reply(self, user, models_dict):
        send(user, models_dict, "راح آكل دولمة")
        r = send(user, models_dict, "بعدني", debug=True)
        assert r["debug"]["intent"] == "NOT_YET"
        assert user.pending_food_topic_json is not None  # الحالة تبقى محفوظة، ما تُمسح


class TestDirectLoggingStillWorksUnchanged:
    """أهم تأكيد Regression: 'اكلت X' الصريحة يجب تبقى تسجّل مباشرة تمامًا كالسابق."""

    def test_explicit_past_tense_still_logs_via_multi_message_flow(self, user, models_dict):
        """دولمة 'is_bulk' بقاعدة البيانات — تحتاج دايمًا جولة توضيح كمية، وبما إنها صارت وجبة
        متعددة الرسائل (pending) فالتأكيد الصريح مطلوب دايمًا قبل التسجيل (سلوك موجود مسبقًا
        وموثّق بـCLAUDE.md، غير متعلق بهذا الإصلاح). المهم: يبقى LOG_MEAL من أول رسالة، ويكتمل
        التسجيل صح — صفر تراجع بهذا التدفق."""
        r1 = send(user, models_dict, "اكلت دولمة", debug=True)
        assert r1["debug"]["intent"] == "LOG_MEAL"
        assert r1["meal_logged"] is False
        r2 = send(user, models_dict, "5 حبات", debug=True)
        assert r2["meal_logged"] is False
        assert r2["debug"]["intent"] == "LOG_MEAL"
        r3 = send(user, models_dict, "تمام", debug=True)
        assert r3["debug"]["intent"] == "CONFIRM"
        assert r3["meal_logged"] is True
        assert MealLog.query.filter_by(user_id=user.id).count() == 1

    def test_simple_egg_direct_log_unaffected(self, user, models_dict):
        r = send(user, models_dict, "اكلت بيضتين", debug=True)
        assert r["debug"]["intent"] == "LOG_MEAL"
        assert r["meal_logged"] is True


class TestBroadenedRecommendationPhrases:
    def test_what_do_you_suggest_triggers_recommendation(self, user, models_dict):
        r = send(user, models_dict, "شنو تقترح آكل؟", debug=True)
        assert r["debug"]["intent"] == "ASK_RECOMMENDATION"

    def test_what_do_you_recommend_i_eat_triggers_recommendation(self, user, models_dict):
        r = send(user, models_dict, "شنو تنصحني آكل؟", debug=True)
        assert r["debug"]["intent"] == "ASK_RECOMMENDATION"

    def test_plain_what_to_eat_still_works(self, user, models_dict):
        r = send(user, models_dict, "شنو آكل هسه؟", debug=True)
        assert r["debug"]["intent"] == "ASK_RECOMMENDATION"
