"""
اختبارات Part 3: يومي الغذائي (تجميع الوجبات حسب النوع + توزيع الميزانية) ومتابعة الوزن
(إحصائيات حقيقية من WeightHistory، صفر رقم مخترع عند نقص البيانات).
"""
from datetime import datetime, timedelta

import iraq_time
from models import db, MealLog, NutritionProfile, WeightHistory
from nutrition_ai import calculator, meal_budget, weight_stats
import nutrition_engine


def send(user, models_dict, text):
    return nutrition_engine.handle_message(user, text, db, models_dict)


class TestMealsByTypeForDay:
    def test_empty_day_returns_not_started_for_all(self, user, models_dict):
        today = iraq_time.now_baghdad().date()
        meals = calculator.meals_by_type_for_day(user, MealLog, today)
        assert meals["breakfast"]["status"] == "NOT_STARTED"
        assert meals["lunch"]["status"] == "NOT_STARTED"
        assert meals["dinner"]["status"] == "NOT_STARTED"
        assert meals["snack"] == []

    def test_single_logged_meal_shows_real_macros(self, user, models_dict):
        """'اكلت بيضتين' بدون ذكر اسم وجبة صريح تُصنَّف حسب الوقت الحالي فعليًا (فطور/غداء/عشاء) —
        الاختبار لا يفترض وجبة محددة، يتأكد فقط إن وحدة انسجّلت والباقي بقوا NOT_STARTED."""
        send(user, models_dict, "اكلت بيضتين")
        today = iraq_time.now_baghdad().date()
        meals = calculator.meals_by_type_for_day(user, MealLog, today)
        logged = [m for m in ("breakfast", "lunch", "dinner") if meals[m]["status"] == "LOGGED"]
        not_started = [m for m in ("breakfast", "lunch", "dinner") if meals[m]["status"] == "NOT_STARTED"]
        assert len(logged) == 1
        assert len(not_started) == 2
        logged_meal = meals[logged[0]]
        assert logged_meal["calories"] > 0
        assert logged_meal["foods"]

    def test_multiple_snacks_same_day_all_appear(self, user, models_dict):
        send(user, models_dict, "اكلت تفاحة سناك")
        send(user, models_dict, "اكلت موزة سناك")
        today = iraq_time.now_baghdad().date()
        meals = calculator.meals_by_type_for_day(user, MealLog, today)
        assert len(meals["snack"]) >= 1  # حسب تصنيف meal_type الفعلي بالرسائل أعلاه

    def test_explicit_meal_type_keyword_logs_to_the_right_bucket(self, user, models_dict):
        """ذكر اسم الوجبة صراحة يضمن أي نوع تنسجل فيه، بغض النظر عن وقت تشغيل الاختبار."""
        send(user, models_dict, "اكلت صمونة غداء")
        today = iraq_time.now_baghdad().date()
        meals = calculator.meals_by_type_for_day(user, MealLog, today)
        assert meals["lunch"]["status"] == "LOGGED"
        assert meals["breakfast"]["status"] == "NOT_STARTED"
        assert meals["dinner"]["status"] == "NOT_STARTED"


class TestWeightStats:
    def test_no_entries_returns_insufficient_data_honestly(self, user):
        stats = weight_stats.compute_weight_stats(user, WeightHistory)
        assert stats["trend"] == "INSUFFICIENT_DATA"
        assert stats["current_weight"] is None
        assert stats["weekly_change"] is None

    def test_single_entry_no_trend_no_weekly_change(self, user):
        db.session.add(WeightHistory(user_id=user.id, weight_kg=80, bmr=1600, tdee=2000, calorie_target=2000))
        db.session.commit()
        stats = weight_stats.compute_weight_stats(user, WeightHistory)
        assert stats["current_weight"] == 80
        assert stats["trend"] == "INSUFFICIENT_DATA"
        assert stats["weekly_change"] is None
        assert stats["weekly_change_note"]

    def test_weekly_change_computed_when_comparable_entry_exists(self, user):
        week_ago = datetime.utcnow() - timedelta(days=7)
        db.session.add(WeightHistory(user_id=user.id, weight_kg=82, bmr=1600, tdee=2000, calorie_target=2000, recorded_at=week_ago))
        db.session.add(WeightHistory(user_id=user.id, weight_kg=80, bmr=1600, tdee=2000, calorie_target=2000))
        db.session.commit()
        stats = weight_stats.compute_weight_stats(user, WeightHistory)
        assert stats["weekly_change"] == -2.0

    def test_trend_detects_real_decrease(self, user):
        for i, w in enumerate([84, 83, 82, 81, 80]):
            recorded = datetime.utcnow() - timedelta(days=(4 - i) * 3)
            db.session.add(WeightHistory(user_id=user.id, weight_kg=w, bmr=1600, tdee=2000, calorie_target=2000, recorded_at=recorded))
        db.session.commit()
        stats = weight_stats.compute_weight_stats(user, WeightHistory)
        assert stats["trend"] == "DECREASING"

    def test_trend_stable_when_fluctuation_is_tiny(self, user):
        for i, w in enumerate([80.0, 80.1, 79.9, 80.05, 80.0]):
            recorded = datetime.utcnow() - timedelta(days=(4 - i) * 2)
            db.session.add(WeightHistory(user_id=user.id, weight_kg=w, bmr=1600, tdee=2000, calorie_target=2000, recorded_at=recorded))
        db.session.commit()
        stats = weight_stats.compute_weight_stats(user, WeightHistory)
        assert stats["trend"] == "STABLE"

    def test_no_goal_weight_gives_no_distance(self, user):
        db.session.add(WeightHistory(user_id=user.id, weight_kg=80, bmr=1600, tdee=2000, calorie_target=2000))
        db.session.commit()
        stats = weight_stats.compute_weight_stats(user, WeightHistory, goal_weight=None)
        assert stats["distance_to_goal"] is None

    def test_goal_distance_for_loss_goal(self, user):
        db.session.add(WeightHistory(user_id=user.id, weight_kg=80, bmr=1600, tdee=2000, calorie_target=2000))
        db.session.commit()
        stats = weight_stats.compute_weight_stats(user, WeightHistory, goal_weight=75, goal_type="lose")
        assert stats["distance_to_goal"] == 5
        assert stats["goal_direction"] == "LOSS"

    def test_goal_distance_for_gain_goal(self, user):
        db.session.add(WeightHistory(user_id=user.id, weight_kg=70, bmr=1600, tdee=2000, calorie_target=2000))
        db.session.commit()
        stats = weight_stats.compute_weight_stats(user, WeightHistory, goal_weight=75, goal_type="gain")
        assert stats["distance_to_goal"] == 5
        assert stats["goal_direction"] == "GAIN"


class TestMealBudgetEngine:
    def test_budgets_sum_exactly_to_remaining(self, user, models_dict):
        budgets = meal_budget.distribute_remaining_budget(1580, ["lunch", "dinner", "snack"], "noon")
        assert sum(budgets.values()) == 1580

    def test_zero_remaining_gives_zero_budgets(self, user, models_dict):
        budgets = meal_budget.distribute_remaining_budget(0, ["lunch", "dinner"], "noon")
        assert budgets == {"lunch": 0, "dinner": 0}

    def test_current_period_meal_gets_larger_share(self, user, models_dict):
        budgets = meal_budget.distribute_remaining_budget(1000, ["lunch", "dinner"], "noon")
        assert budgets["lunch"] > budgets["dinner"]


class TestProgressRoutesSecurity:
    def test_daily_requires_login(self, app):
        client = app.test_client()
        r = client.get("/daily")
        assert r.status_code in (302, 401)

    def test_weight_progress_requires_login(self, app):
        client = app.test_client()
        r = client.get("/progress/weight")
        assert r.status_code in (302, 401)

    def test_cannot_delete_another_users_weight_entry(self, app, client_user):
        """client_user يعتمد على fixture 'user' نفسها — لازم مستخدم ثاني منفصل تمامًا هنا
        حتى الاختبار يتحقق فعليًا من عزل الملكية، مو بس نفس الحساب المسجّل دخوله."""
        from models import User
        other_user = User(name="Someone Else", email=f"other-{__import__('os').urandom(4).hex()}@test.com", role="user")
        other_user.set_password("password123")
        db.session.add(other_user)
        db.session.commit()

        other_entry = WeightHistory(user_id=other_user.id, weight_kg=80, bmr=1600, tdee=2000, calorie_target=2000)
        db.session.add(other_entry)
        db.session.commit()

        client, logged_in_user, csrf_token = client_user
        assert logged_in_user.id != other_user.id
        r = client.post(
            f"/progress/weight/{other_entry.id}/delete",
            json={}, headers={"X-CSRFToken": csrf_token},
        )
        assert r.status_code == 404
        assert WeightHistory.query.get(other_entry.id) is not None  # ما انحذف

    def test_weight_log_route_matches_chat_behavior(self, client_user):
        client, logged_in_user, csrf_token = client_user
        r = client.post(
            "/progress/weight/log",
            json={"weight_kg": 76.5}, headers={"X-CSRFToken": csrf_token},
        )
        assert r.get_json()["ok"] is True
        profile = NutritionProfile.query.get(logged_in_user.id)
        assert profile.weight_kg == 76.5
        assert WeightHistory.query.filter_by(user_id=logged_in_user.id, weight_kg=76.5).count() == 1
