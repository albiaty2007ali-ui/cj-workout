"""
Fixtures مشتركة لاختبارات المحادثة — تطبيق Flask كامل بقاعدة SQLite بالذاكرة (معزول تمامًا
عن instance/cjworkout.db الحقيقية)، ومستخدم جاهز أكمل الـ Onboarding.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("NOTIFICATION_SCHEDULER_ENABLED", "False")  # الاختبارات تستدعي الـTicks يدويًا، لا تحتاج Thread حقيقي

import pytest

import calorie_calc
from app import create_app
from models import db, User, NutritionProfile, MealLog, MealStatus, ShownTip, WaterLog, NutritionTip


@pytest.fixture()
def app():
    application = create_app()
    application.config.update(TESTING=True)
    with application.app_context():
        yield application


@pytest.fixture()
def models_dict():
    return {
        "MealLog": MealLog, "NutritionProfile": NutritionProfile,
        "MealStatus": MealStatus, "ShownTip": ShownTip,
        "WaterLog": WaterLog, "NutritionTip": NutritionTip,
    }


@pytest.fixture()
def user(app):
    u = User(name="Test Captain", email=f"test-{os.urandom(4).hex()}@test.com", role="user")
    u.set_password("password123")
    db.session.add(u)
    db.session.commit()

    calc = calorie_calc.calculate(25, 80, 175, "male", "lose", "moderate")
    profile = NutritionProfile(
        user_id=u.id, age=25, weight_kg=80, height_cm=175, sex="male",
        goal="lose", activity_level="moderate", bmr=calc["bmr"], tdee=calc["tdee"],
        calorie_target=calc["calorie_target"], water_target_ml=calc["water_target_ml"],
    )
    db.session.add(profile)
    u.onboarding_completed = True
    db.session.commit()
    return u


def _extract(pattern: str, html: str) -> str:
    m = re.search(pattern, html)
    assert m, f"couldn't find pattern {pattern!r} in response"
    return m.group(1)


@pytest.fixture()
def client_user(app, user):
    """Flask test client مسجّل دخول فعليًا (كوكيز حقيقية) + توكن CSRF صالح — لاختبار
    Routes اللي تتحقق من CSRF يدويًا (profile_bp.py/settings_bp.py)."""
    client = app.test_client()

    login_page = client.get("/login").get_data(as_text=True)
    login_csrf = _extract(r'name="csrf_token"[^>]*value="([^"]+)"', login_page)
    client.post("/login", data={
        "csrf_token": login_csrf, "email": user.email, "password": "password123",
    }, follow_redirects=True)

    profile_page = client.get("/profile").get_data(as_text=True)
    csrf_token = _extract(r'CJ_CSRF_TOKEN = "([^"]+)"', profile_page)

    return client, user, csrf_token
