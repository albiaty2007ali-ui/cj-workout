"""
اختبارات نظام الوصفات: البحث (تطابق/جزئي/خطأ إملائي/فراغ)، زراعة idempotent، ربط الشات
(اقتراح وصفة حقيقية + Tutorial + substitution صادق)، وCRUD الأدمن الأساسي.
"""
import os
import re

from models import db, User, Recipe, RecipeCategory, MealLog, NutritionProfile
from nutrition_ai import recipe_search
from nutrition_ai.recipe_search import seed_default_recipes
import nutrition_engine


def send(user, models_dict, text, debug=False):
    return nutrition_engine.handle_message(user, text, db, models_dict, debug=debug)


def _extract(pattern: str, html: str) -> str:
    m = re.search(pattern, html)
    assert m, f"couldn't find pattern {pattern!r} in response"
    return m.group(1)


class TestSeedIdempotency:
    def test_seed_default_recipes_does_not_duplicate(self, app):
        count_before = Recipe.query.count()
        cat_count_before = RecipeCategory.query.count()
        seed_default_recipes()
        seed_default_recipes()
        assert Recipe.query.count() == count_before
        assert RecipeCategory.query.count() == cat_count_before


class TestRecipeSearch:
    def test_exact_name_match(self, app):
        results = recipe_search.search_recipes(query="بيض بالطماطة")
        assert any(r.slug == "eggs-tomato" for r in results)

    def test_partial_name_match(self, app):
        results = recipe_search.search_recipes(query="عدس")
        assert any(r.slug == "lentil-soup" for r in results)

    def test_typo_tolerant_match(self, app):
        results = recipe_search.search_recipes(query="دجاي مشوي")
        assert any(r.slug == "grilled-chicken-salad" for r in results)

    def test_category_filter_returns_only_that_category(self, app):
        cold_cat = RecipeCategory.query.filter_by(name="مشروبات باردة").first()
        results = recipe_search.search_recipes(category_id=cold_cat.id)
        assert len(results) >= 1
        assert all(r.category_id == cold_cat.id for r in results)

    def test_empty_category_returns_honest_empty_list(self, app):
        sweets_cat = RecipeCategory.query.filter_by(name="حلويات").first()
        results = recipe_search.search_recipes(category_id=sweets_cat.id)
        assert results == []

    def test_no_match_returns_empty_list_never_guesses(self, app):
        results = recipe_search.search_recipes(query="طبخة غير موجودة إطلاقًا")
        assert results == []

    def test_empty_query_returns_all_active_recipes(self, app):
        results = recipe_search.search_recipes()
        assert len(results) == Recipe.query.filter_by(active=True).count()


class TestChatRecipeIntegration:
    def test_ask_recipe_by_name_shows_real_db_data(self, user, models_dict):
        r = send(user, models_dict, "خلينا نطبخ بيض بالطماطة")
        assert "320" in r["reply"]
        assert "/recipes/eggs-tomato" in r["reply"]

    def test_cooking_tutorial_walks_through_real_steps_in_order(self, user, models_dict):
        send(user, models_dict, "وصفة شوربة عدس")
        r1 = send(user, models_dict, "هسه شنو أسوي")
        assert "الخطوة 1" in r1["reply"]
        r2 = send(user, models_dict, "بعد شنو")
        assert "الخطوة 2" in r2["reply"]
        assert r1["reply"] != r2["reply"]

    def test_substitution_lookup_uses_real_registered_data(self, user, models_dict):
        send(user, models_dict, "خلينا نطبخ بيض بالطماطة")
        r = send(user, models_dict, "ما عندي بصل")
        assert "بصل" in r["reply"]

    def test_missing_substitution_is_honest_not_invented(self, user, models_dict):
        send(user, models_dict, "وصفة مشروب بارد بالليمون")
        r = send(user, models_dict, "ما عندي ليمون")
        assert "ما عندي بديل" in r["reply"]

    def test_empty_category_request_is_honest_not_fake(self, user, models_dict):
        r = send(user, models_dict, "أريد حلو دايت")
        assert "ما لقيت وصفة" in r["reply"]

    def test_unrelated_tea_message_still_logs_meal_not_recipe(self, user, models_dict):
        # تأكيد إن كلمة "شاي" (تصنيف وصفات) ما تكسر تسجيل وجبة فعلي بنفس الكلمة
        r = send(user, models_dict, "اكلت شاي")
        assert r.get("meal_logged") is True or "شاي" in (r.get("reply") or "")
        assert "ما لقيت وصفة" not in r["reply"]


class _AdminClient:
    def __init__(self, app):
        self.client = app.test_client()
        self.user = User(name="Admin Captain", email=f"admin-{os.urandom(4).hex()}@test.com", role="admin")
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


class TestAdminRecipeCRUD:
    def test_add_recipe_starts_inactive_until_ingredients_and_steps_exist(self, app):
        admin = _AdminClient(app)
        csrf = admin.csrf_from("/admin/recipes")
        category = RecipeCategory.query.first()

        res = admin.client.post("/admin/recipes/add", data={
            "csrf_token": csrf, "name": "وصفة اختبار", "category_id": category.id,
            "calories": "100", "protein": "5", "carbs": "10", "fat": "2", "servings": "1",
            "difficulty": "easy",
        }, follow_redirects=True)
        assert res.status_code == 200

        recipe = Recipe.query.filter_by(name="وصفة اختبار").first()
        assert recipe is not None
        assert recipe.active is False

        toggle_csrf = admin.csrf_from(f"/admin/recipes/{recipe.id}/edit")
        toggle_res = admin.client.post(f"/admin/recipes/{recipe.id}/toggle", data={
            "csrf_token": toggle_csrf,
        }, follow_redirects=True)
        assert toggle_res.status_code == 200
        db.session.refresh(recipe)
        assert recipe.active is False  # ما عنده مكونات/خطوات بعد

    def test_add_ingredient_and_step_then_activation_succeeds(self, app):
        admin = _AdminClient(app)
        category = RecipeCategory.query.first()
        csrf = admin.csrf_from("/admin/recipes")
        admin.client.post("/admin/recipes/add", data={
            "csrf_token": csrf, "name": "وصفة اختبار كاملة", "category_id": category.id,
            "calories": "200", "protein": "10", "carbs": "20", "fat": "5", "servings": "2",
            "difficulty": "easy",
        }, follow_redirects=True)
        recipe = Recipe.query.filter_by(name="وصفة اختبار كاملة").first()

        edit_csrf = admin.csrf_from(f"/admin/recipes/{recipe.id}/edit")
        admin.client.post(f"/admin/recipes/{recipe.id}/ingredients/add", data={
            "csrf_token": edit_csrf, "name": "مكوّن تجريبي", "quantity": "1", "unit": "حبة",
        }, follow_redirects=True)
        admin.client.post(f"/admin/recipes/{recipe.id}/steps/add", data={
            "csrf_token": edit_csrf, "instruction": "خطوة تجريبية",
        }, follow_redirects=True)

        db.session.refresh(recipe)
        assert len(recipe.ingredients) == 1
        assert len(recipe.steps) == 1

        toggle_csrf = admin.csrf_from(f"/admin/recipes/{recipe.id}/edit")
        admin.client.post(f"/admin/recipes/{recipe.id}/toggle", data={"csrf_token": toggle_csrf}, follow_redirects=True)
        db.session.refresh(recipe)
        assert recipe.active is True

    def test_new_category_addable_without_code_change(self, app):
        admin = _AdminClient(app)
        csrf = admin.csrf_from("/admin/recipes")
        admin.client.post("/admin/recipes/categories/add", data={
            "csrf_token": csrf, "name": "فطور خفيف تجريبي", "icon": "🥐",
        }, follow_redirects=True)
        assert RecipeCategory.query.filter_by(name="فطور خفيف تجريبي").first() is not None

    def test_delete_recipe_cascades_ingredients_and_steps(self, app):
        admin = _AdminClient(app)
        category = RecipeCategory.query.first()
        csrf = admin.csrf_from("/admin/recipes")
        admin.client.post("/admin/recipes/add", data={
            "csrf_token": csrf, "name": "وصفة للحذف", "category_id": category.id,
            "calories": "50", "protein": "1", "carbs": "1", "fat": "1", "servings": "1",
            "difficulty": "easy",
        }, follow_redirects=True)
        recipe = Recipe.query.filter_by(name="وصفة للحذف").first()
        recipe_id = recipe.id

        delete_csrf = admin.csrf_from("/admin/recipes")
        admin.client.post(f"/admin/recipes/{recipe_id}/delete", data={"csrf_token": delete_csrf}, follow_redirects=True)
        assert Recipe.query.get(recipe_id) is None


def _finish_recipe_via_chat(user, models_dict, trigger_text):
    """يفعّل وصفة ويمشي بخطواتها بالشات لين يوصل رسالة 'أكلتها لو بعدك؟' — بدون افتراض عدد خطوات ثابت."""
    send(user, models_dict, trigger_text)
    r = send(user, models_dict, "هسه شنو أسوي")
    for _ in range(10):
        if "أكلتها" in r["reply"]:
            return r
        r = send(user, models_dict, "بعد شنو")
    return r


class TestRecipeEatenConfirmation:
    def test_opening_and_walking_recipe_never_logs(self, user, models_dict):
        send(user, models_dict, "وصفة شوربة عدس")
        send(user, models_dict, "هسه شنو أسوي")
        send(user, models_dict, "بعد شنو")
        assert MealLog.query.filter_by(user_id=user.id).count() == 0

    def test_finishing_recipe_asks_before_logging_anything(self, user, models_dict):
        r = _finish_recipe_via_chat(user, models_dict, "وصفة شوربة عدس")
        assert "أكلتها" in r["reply"]
        assert MealLog.query.filter_by(user_id=user.id).count() == 0
        assert user.pending_recipe_confirmation_id is not None

    def test_answering_eaten_logs_real_recipe_macros_and_awards_xp(self, user, models_dict):
        _finish_recipe_via_chat(user, models_dict, "وصفة شوربة عدس")
        xp_before = user.xp
        r = send(user, models_dict, "أكلتها")
        assert r["meal_logged"] is True
        log = MealLog.query.filter_by(user_id=user.id).first()
        assert log is not None
        assert log.total_calories == 220  # قيمة شوربة عدس الحقيقية بـrecipes_seed.py
        assert user.xp > xp_before
        assert user.pending_recipe_confirmation_id is None

    def test_answering_no_does_not_log_and_clears_state(self, user, models_dict):
        _finish_recipe_via_chat(user, models_dict, "وصفة شوربة عدس")
        r = send(user, models_dict, "لا")
        assert MealLog.query.filter_by(user_id=user.id).count() == 0
        assert user.pending_recipe_confirmation_id is None
        assert r["reply"]  # رد ودّي (نص متنوّع عشوائيًا) — لا نفرض صياغة واحدة محددة

    def test_answering_later_defers_then_eaten_resumes_correctly(self, user, models_dict):
        _finish_recipe_via_chat(user, models_dict, "وصفة شوربة عدس")
        r1 = send(user, models_dict, "بعدني")
        assert MealLog.query.filter_by(user_id=user.id).count() == 0
        assert user.pending_recipe_confirmation_id is not None
        assert r1["reply"]

        send(user, models_dict, "شكرا")  # رسالة غير مرتبطة ما تمسح الحالة المعلّقة
        assert user.pending_recipe_confirmation_id is not None

        r2 = send(user, models_dict, "أكلتها")
        assert r2["meal_logged"] is True
        assert MealLog.query.filter_by(user_id=user.id).count() == 1

    def test_no_double_count_answering_eaten_twice(self, user, models_dict):
        _finish_recipe_via_chat(user, models_dict, "وصفة شوربة عدس")
        send(user, models_dict, "أكلتها")
        count_after_first = MealLog.query.filter_by(user_id=user.id).count()
        r = send(user, models_dict, "أكلتها")  # ماكو وصفة معلّقة بعد الأولى
        assert MealLog.query.filter_by(user_id=user.id).count() == count_after_first
        assert r["meal_logged"] is False

    def test_over_target_real_recipe_meal_still_logs_truthfully(self, user, models_dict):
        profile = NutritionProfile.query.get(user.id)
        db.session.add(MealLog(
            user_id=user.id, meal_type="lunch", raw_text="وجبة كبيرة للاختبار",
            matched_foods_json="[]", total_calories=profile.calorie_target + 300,
            total_protein=0, total_carbs=0, total_fat=0,
        ))
        db.session.commit()

        _finish_recipe_via_chat(user, models_dict, "وصفة شوربة عدس")
        r = send(user, models_dict, "أكلتها")
        assert r["meal_logged"] is True
        recipe_log = MealLog.query.filter_by(user_id=user.id, raw_text="شوربة عدس").first()
        assert recipe_log is not None
        assert recipe_log.total_calories == 220  # لا تلاعب بالرقم لمجرد تجاوز الهدف


class TestRecipeStartCalorieGate:
    def test_start_blocked_server_side_when_over_target(self, client_user):
        client, test_user, csrf = client_user
        profile = NutritionProfile.query.get(test_user.id)
        db.session.add(MealLog(
            user_id=test_user.id, meal_type="lunch", raw_text="وجبة كبيرة للاختبار",
            matched_foods_json="[]", total_calories=profile.calorie_target + 300,
            total_protein=0, total_carbs=0, total_fat=0,
        ))
        db.session.commit()

        res = client.post("/recipes/lentil-soup/start", json={}, headers={"X-CSRFToken": csrf})
        data = res.get_json()
        assert data["ok"] is False
        assert "هدف" in data["message"]
        assert MealLog.query.filter_by(user_id=test_user.id).count() == 1  # ما ضاف وجبة جديدة

    def test_start_allowed_when_under_target(self, client_user):
        client, test_user, csrf = client_user
        res = client.post("/recipes/lentil-soup/start", json={}, headers={"X-CSRFToken": csrf})
        data = res.get_json()
        assert data["ok"] is True

    def test_search_api_exposes_fits_remaining_flag(self, client_user):
        client, test_user, csrf = client_user
        res = client.get("/recipes/api/search")
        data = res.get_json()
        assert any(r["fits_remaining"] is not None for r in data["recipes"])
