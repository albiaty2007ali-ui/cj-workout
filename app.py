import os
from datetime import timedelta

from flask import Flask
from flask_login import LoginManager
from werkzeug.middleware.proxy_fix import ProxyFix
from dotenv import load_dotenv

from models import db, User, Plan, NutritionTip
from extensions import limiter
from nutrition_ai.tips_engine import seed_default_tips
from nutrition_ai.levels import seed_default_levels
from nutrition_ai.streaks import seed_default_milestones
from nutrition_ai.recipe_search import seed_default_recipes
from nutrition_ai.notifications.engine import seed_default_notification_templates
from nutrition_ai.notifications.scheduler import start_scheduler

load_dotenv()


def create_app():
    app = Flask(__name__, instance_relative_config=True)
    os.makedirs(app.instance_path, exist_ok=True)

    # خلف Reverse Proxy (Render/Railway/أي PaaS) الترافيك الخارجي HTTPS لكن يوصل للتطبيق HTTP —
    # بدون هذا، url_for(..., _external=True) (روابط الإيميل) ورؤوس الحماية تفترض HTTP بالخطأ
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-change-me")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get(
        "DATABASE_URL", f"sqlite:///{os.path.join(app.instance_path, 'cjworkout.db')}"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # ---- إعدادات جلسة آمنة ----
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_SECURE"] = (
        os.environ.get("SESSION_COOKIE_SECURE", "False").lower() == "true"
    )
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=14)
    app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024  # حد أقصى لحجم أي طلب (رفع ملفات)

    db.init_app(app)
    limiter.init_app(app)

    login_manager = LoginManager()
    login_manager.login_view = "auth.login"
    login_manager.login_message = "يجب تسجيل الدخول للوصول إلى هذه الصفحة"
    login_manager.login_message_category = "info"
    login_manager.init_app(app)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, user_id)

    # ---- تسجيل الـ Blueprints ----
    from main import main_bp
    from auth import auth_bp
    from payments import payments_bp
    from chat import chat_bp
    from admin import admin_bp
    from profile_bp import profile_bp
    from settings_bp import settings_bp
    from recipes_bp import recipes_bp
    from progress_bp import progress_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(payments_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(profile_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(recipes_bp)
    app.register_blueprint(progress_bp)

    # ---- رؤوس أمان أساسية على كل استجابة ----
    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response

    with app.app_context():
        db.create_all()
        _seed_default_plan()
        seed_default_tips(db, NutritionTip)
        seed_default_levels()
        seed_default_milestones()
        seed_default_recipes()
        seed_default_notification_templates()

    start_scheduler(app)

    @app.context_processor
    def inject_globals():
        from datetime import datetime
        return {"current_year": datetime.utcnow().year}

    return app


def _seed_default_plan():
    """يضمن وجود خطة الاشتراك الأساسية بقاعدة البيانات دائمًا (مو Hardcoded بالكود)."""
    if not Plan.query.filter_by(code="monthly").first():
        price = int(os.environ.get("SUBSCRIPTION_PRICE_IQD", "10000"))
        db.session.add(Plan(code="monthly", name="CJ WORKOUT Monthly",
                             price_iqd=price, duration_days=30, active=True))
        db.session.commit()


if __name__ == "__main__":
    app = create_app()
    app.run(debug=os.environ.get("FLASK_ENV") == "development", port=5000)
