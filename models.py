import uuid
from datetime import datetime, timedelta
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


def gen_id() -> str:
    return uuid.uuid4().hex


class User(db.Model, UserMixin):
    __tablename__ = "users"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user")  # user | admin
    disabled = db.Column(db.Boolean, nullable=False, default=False)
    photo_url = db.Column(db.String(500), nullable=True)
    welcome_email_sent = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ---- البروفايل الاجتماعي ----
    username = db.Column(db.String(20), unique=True, nullable=True, index=True)
    bio = db.Column(db.Text, nullable=True)
    profile_visibility = db.Column(db.String(10), nullable=False, default="public")  # public | private
    ai_response_style = db.Column(db.String(10), nullable=False, default="balanced")  # concise|balanced|detailed

    # ---- التغذية والـChat ----
    onboarding_completed = db.Column(db.Boolean, nullable=False, default=False)
    xp = db.Column(db.Integer, nullable=False, default=0)
    streak_days = db.Column(db.Integer, nullable=False, default=0)
    longest_streak = db.Column(db.Integer, nullable=False, default=0)
    streak_started_at = db.Column(db.Date, nullable=True)
    last_active_date = db.Column(db.Date, nullable=True)
    free_meals_used = db.Column(db.Integer, nullable=False, default=0)  # حد أقصى 6 — Server-Side فقط
    # حالة "مساعد الطبخ" الحالية (لجعل المحادثة Context-Aware)
    current_recipe_id = db.Column(db.String(50), nullable=True)
    current_recipe_step = db.Column(db.Integer, nullable=False, default=0)
    # وصفة خلص طبخها وبانتظار جواب "أكلتها/بعدني/لا" — يبقى محفوظ حتى لو "بعدني" لين يجاوب لاحقًا
    pending_recipe_confirmation_id = db.Column(db.String(50), nullable=True)
    pending_food_topic_json = db.Column(db.Text, nullable=True)  # آخر طعام ذكره المستخدم برغبة/نية (مو استهلاك فعلي)
    pending_meal_json = db.Column(db.Text, nullable=True)  # وجبة قيد التأكيد/التوضيح — لا تُحتسب حتى تُؤكَّد
    last_direct_log_json = db.Column(db.Text, nullable=True)  # Snapshot تراجع لآخر وجبة/ماي انسجل مباشرة (DIRECT_LOG)

    subscriptions = db.relationship("Subscription", backref="user", lazy="dynamic")
    payments = db.relationship("Payment", backref="user", lazy="dynamic")

    def set_password(self, raw_password: str) -> None:
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        return check_password_hash(self.password_hash, raw_password)

    @property
    def is_active(self) -> bool:
        # Flask-Login: حساب معطّل من الأدمن لا يقدر يسجّل دخول
        return not self.disabled

    def active_subscription(self):
        return (
            self.subscriptions.filter(
                Subscription.status == "active",
                Subscription.end_date > datetime.utcnow(),
            )
            .order_by(Subscription.end_date.desc())
            .first()
        )

    @property
    def is_premium(self) -> bool:
        return self.active_subscription() is not None

    @property
    def free_meals_remaining(self) -> int:
        return max(0, 6 - self.free_meals_used)

    @property
    def trial_exhausted(self) -> bool:
        return not self.is_premium and self.free_meals_remaining <= 0


class Plan(db.Model):
    __tablename__ = "plans"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    code = db.Column(db.String(50), unique=True, nullable=False)  # "monthly"
    name = db.Column(db.String(120), nullable=False)
    price_iqd = db.Column(db.Integer, nullable=False)
    duration_days = db.Column(db.Integer, nullable=False, default=30)
    active = db.Column(db.Boolean, default=True)


class Subscription(db.Model):
    __tablename__ = "subscriptions"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    plan_code = db.Column(db.String(50), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="active")  # active|expired|cancelled
    start_date = db.Column(db.DateTime, default=datetime.utcnow)
    end_date = db.Column(db.DateTime, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_payment_id = db.Column(db.String(32), nullable=True)


class Payment(db.Model):
    __tablename__ = "payments"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    plan_code = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Integer, nullable=False)
    currency = db.Column(db.String(10), default="IQD")
    method = db.Column(db.String(30), default="manual_card_transfer")
    status = db.Column(
        db.String(30), nullable=False, default="pending_manual_review", index=True
    )  # pending_manual_review|completed|rejected
    transfer_reference = db.Column(db.String(120), nullable=True)
    proof_image_path = db.Column(db.String(300), nullable=True)
    user_note = db.Column(db.Text, nullable=True)
    reviewed_by = db.Column(db.String(32), nullable=True)
    reviewed_at = db.Column(db.DateTime, nullable=True)
    rejection_reason = db.Column(db.String(300), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    completed_at = db.Column(db.DateTime, nullable=True)


class Advertisement(db.Model):
    __tablename__ = "advertisements"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    title = db.Column(db.String(200), nullable=False)
    image_path = db.Column(db.String(300), nullable=False)
    link_url = db.Column(db.String(500), nullable=True)
    placement = db.Column(db.String(50), nullable=False)  # homepage|dashboard|subscription_page|banner
    active = db.Column(db.Boolean, default=True)
    start_date = db.Column(db.DateTime, default=datetime.utcnow)
    end_date = db.Column(db.DateTime, nullable=False)
    created_by = db.Column(db.String(32), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class PasswordResetToken(db.Model):
    """رموز إعادة تعيين كلمة المرور — محدودة الصلاحية، أحادية الاستخدام."""

    __tablename__ = "password_reset_tokens"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    token_hash = db.Column(db.String(255), nullable=False)  # نخزن hash الرمز وليس الرمز نفسه
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    @staticmethod
    def new_expiry(minutes: int = 30) -> datetime:
        return datetime.utcnow() + timedelta(minutes=minutes)


class AdminLog(db.Model):
    __tablename__ = "admin_logs"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    admin_id = db.Column(db.String(32), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    target_id = db.Column(db.String(32), nullable=True)
    details = db.Column(db.Text, nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)


class NutritionProfile(db.Model):
    """ملف التغذية — يُحسب مرة بالـ Onboarding ويُحدَّث كل ما غيّر المستخدم وزنه."""

    __tablename__ = "nutrition_profiles"

    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), primary_key=True)
    age = db.Column(db.Integer, nullable=False)
    weight_kg = db.Column(db.Float, nullable=False)
    height_cm = db.Column(db.Float, nullable=False)
    sex = db.Column(db.String(10), nullable=False)  # male | female
    goal = db.Column(db.String(20), nullable=False)  # lose | maintain | gain
    activity_level = db.Column(db.String(20), nullable=False)
    bmr = db.Column(db.Float, nullable=False)
    tdee = db.Column(db.Float, nullable=False)
    calorie_target = db.Column(db.Integer, nullable=False)
    water_target_ml = db.Column(db.Integer, nullable=False, default=2000)
    goal_weight = db.Column(db.Float, nullable=True)  # هدف وزن رقمي اختياري — يُضبط من صفحة متابعة الوزن
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WeightHistory(db.Model):
    __tablename__ = "weight_history"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    weight_kg = db.Column(db.Float, nullable=False)
    bmr = db.Column(db.Float, nullable=False)
    tdee = db.Column(db.Float, nullable=False)
    calorie_target = db.Column(db.Integer, nullable=False)
    recorded_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class MealLog(db.Model):
    """كل وجبة يسجّلها المستخدم عبر المحادثة — هذا هو مصدر الحقيقة للسعرات، وليس الـFrontend."""

    __tablename__ = "meal_logs"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    meal_type = db.Column(db.String(20), nullable=False)  # breakfast|lunch|dinner|snack
    raw_text = db.Column(db.Text, nullable=False)
    matched_foods_json = db.Column(db.Text, nullable=True)  # JSON: [{name, calories, protein, carbs, fat}]
    total_calories = db.Column(db.Integer, nullable=False, default=0)
    total_protein = db.Column(db.Float, nullable=False, default=0)
    total_carbs = db.Column(db.Float, nullable=False, default=0)
    total_fat = db.Column(db.Float, nullable=False, default=0)
    is_free_meal = db.Column(db.Boolean, nullable=False, default=True)
    swapped = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class ChatMessage(db.Model):
    """سجل المحادثة — يبقى المستخدم يشوف تاريخ حديثه مع الكابتن."""

    __tablename__ = "chat_messages"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    role = db.Column(db.String(10), nullable=False)  # user | bot
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class MealStatus(db.Model):
    """حالة كل وجبة لكل يوم — حتى لا نسأل عن نفس الوجبة أكثر من مرة بنفس اليوم."""

    __tablename__ = "meal_status"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    meal_type = db.Column(db.String(20), nullable=False)  # breakfast | lunch | dinner
    status = db.Column(db.String(20), nullable=False, default="not_started")
    # not_started | asked | logged | skipped
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "date", "meal_type", name="uq_meal_status_day"),
    )


class ShownTip(db.Model):
    """سجل النصائح اللي شافها المستخدم مؤخرًا — لمنع التكرار المزعج."""

    __tablename__ = "shown_tips"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    tip_id = db.Column(db.String(50), nullable=False)
    shown_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class WaterLog(db.Model):
    """سجل شرب الماي — كل رسالة "شربت X مل/لتر" تنشئ صف هنا بعد ما تنحسم الكمية بوضوح."""

    __tablename__ = "water_logs"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    ml = db.Column(db.Integer, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class NutritionTip(db.Model):
    """بنك النصائح الغذائية — قابل للتوسّع من لوحة الأدمن بدون تعديل الكود (لا نصائح طبية)."""

    __tablename__ = "nutrition_tips"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    text = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), nullable=False, index=True)
    meal_type = db.Column(db.String(20), nullable=True)   # breakfast|lunch|dinner|snack|null=أي وقت
    goal = db.Column(db.String(20), nullable=True)        # lose|maintain|gain|null=أي هدف
    time_period = db.Column(db.String(20), nullable=True)  # morning|noon|evening|late_night|null=أي وقت
    priority = db.Column(db.Integer, nullable=False, default=0)  # الأعلى يُفضَّل عند تعادل السياق
    difficulty = db.Column(db.String(20), nullable=False, default="easy")  # easy|medium|hard
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_by = db.Column(db.String(32), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class XPTransaction(db.Model):
    """Ledger حقيقي لكل XP يُمنح — user.xp عمود Cache سريع، هذا الجدول مصدر الحقيقة والتدقيق."""

    __tablename__ = "xp_transactions"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    amount = db.Column(db.Integer, nullable=False)  # سالب = تراجع/عكس
    reason = db.Column(db.String(100), nullable=False)  # "meal_logged" | "streak_milestone_7" ...
    source = db.Column(db.String(100), nullable=True)  # مرجع اختياري (meal_log_id, milestone id...) لمنع التكرار
    metadata_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class ActiveDay(db.Model):
    """يوم واحد (بتوقيت بغداد) كان فيه المستخدم نشطاً فعلياً — مصدر الحقيقة لحساب/عرض الستريك،
    بدل الاعتماد على عداد قابل للانجراف."""

    __tablename__ = "active_days"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("user_id", "date", name="uq_active_day"),
    )


class Level(db.Model):
    """جدول مستويات XP قابل للتعديل من الأدمن — الواجهة ما ترتبط بأرقام ثابتة."""

    __tablename__ = "levels"

    level = db.Column(db.Integer, primary_key=True)
    required_xp = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(50), nullable=False)
    reward = db.Column(db.String(200), nullable=True)


class StreakMilestone(db.Model):
    """محطات الستريك (7/14/30 يوم...) وXP المكافأة عندها — قابلة للتعديل من الأدمن."""

    __tablename__ = "streak_milestones"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    days = db.Column(db.Integer, nullable=False, unique=True)
    xp_reward = db.Column(db.Integer, nullable=False, default=0)
    label = db.Column(db.String(100), nullable=False)
    active = db.Column(db.Boolean, nullable=False, default=True)


class RecipeCategory(db.Model):
    """تصنيفات الوصفات — قابلة للتوسّع من الأدمن بدون تعديل الكود."""

    __tablename__ = "recipe_categories"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    name = db.Column(db.String(50), unique=True, nullable=False)
    icon = db.Column(db.String(10), nullable=False, default="🍽️")
    order_index = db.Column(db.Integer, nullable=False, default=0)


class Recipe(db.Model):
    """وصفة حقيقية — السعرات/الماكروز هنا هي مصدر الحقيقة لأي عرض بالشات أو الصفحة، لا يُخترع شي."""

    __tablename__ = "recipes"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    name = db.Column(db.String(150), nullable=False)
    slug = db.Column(db.String(160), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=True)
    category_id = db.Column(db.String(32), db.ForeignKey("recipe_categories.id"), nullable=False, index=True)
    image_path = db.Column(db.String(300), nullable=True)
    prep_time_min = db.Column(db.Integer, nullable=True)
    cook_time_min = db.Column(db.Integer, nullable=True)
    servings = db.Column(db.Integer, nullable=False, default=1)
    difficulty = db.Column(db.String(20), nullable=False, default="easy")  # easy|medium|hard
    calories = db.Column(db.Integer, nullable=False)
    protein = db.Column(db.Float, nullable=False, default=0)
    carbs = db.Column(db.Float, nullable=False, default=0)
    fat = db.Column(db.Float, nullable=False, default=0)
    fiber = db.Column(db.Float, nullable=True)
    match_keywords = db.Column(db.Text, nullable=True)  # كلمات إضافية مفصولة بفاصلة لمطابقة الشات
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = db.relationship("RecipeCategory")
    ingredients = db.relationship(
        "RecipeIngredient", backref="recipe", order_by="RecipeIngredient.order_index",
        cascade="all, delete-orphan",
    )
    steps = db.relationship(
        "RecipeStep", backref="recipe", order_by="RecipeStep.step_number",
        cascade="all, delete-orphan",
    )
    substitutions = db.relationship(
        "RecipeSubstitution", backref="recipe", cascade="all, delete-orphan",
    )


class RecipeIngredient(db.Model):
    __tablename__ = "recipe_ingredients"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    recipe_id = db.Column(db.String(32), db.ForeignKey("recipes.id"), nullable=False, index=True)
    name = db.Column(db.String(150), nullable=False)
    quantity = db.Column(db.String(50), nullable=True)  # نص حر ("2"، "نصف"...) — لا نفرض وحدة SI
    unit = db.Column(db.String(50), nullable=True)
    order_index = db.Column(db.Integer, nullable=False, default=0)


class RecipeStep(db.Model):
    __tablename__ = "recipe_steps"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    recipe_id = db.Column(db.String(32), db.ForeignKey("recipes.id"), nullable=False, index=True)
    step_number = db.Column(db.Integer, nullable=False)
    instruction = db.Column(db.Text, nullable=False)
    duration = db.Column(db.String(50), nullable=True)
    temperature = db.Column(db.String(50), nullable=True)
    tip = db.Column(db.Text, nullable=True)
    warning = db.Column(db.Text, nullable=True)


class RecipeSubstitution(db.Model):
    __tablename__ = "recipe_substitutions"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    recipe_id = db.Column(db.String(32), db.ForeignKey("recipes.id"), nullable=False, index=True)
    ingredient_name = db.Column(db.String(150), nullable=False)
    replacement = db.Column(db.Text, nullable=False)


class NotificationTemplate(db.Model):
    __tablename__ = "notification_templates"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    category = db.Column(db.String(30), nullable=False, index=True)
    title = db.Column(db.String(150), nullable=False)
    body = db.Column(db.Text, nullable=False)
    meal_type = db.Column(db.String(20), nullable=True)
    goal = db.Column(db.String(20), nullable=True)
    priority = db.Column(db.Integer, nullable=False, default=0)
    active = db.Column(db.Boolean, nullable=False, default=True)
    cooldown_minutes = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class PushSubscription(db.Model):
    __tablename__ = "push_subscriptions"

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    endpoint = db.Column(db.Text, nullable=False)
    p256dh = db.Column(db.String(300), nullable=False)
    auth = db.Column(db.String(100), nullable=False)
    user_agent = db.Column(db.String(300), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class UserNotification(db.Model):
    """سجل كل إشعار أُرسل فعليًا — هذا الجدول هو أساس منع التكرار/الحد اليومي/Cooldown كلها.
    dedup_key (مثلاً تاريخ اليوم لتذكير وجبة، أو 'streak_{days}' لمحطة) + قيد فريد يمنع إرسال
    مضاعف تحت أكثر من Worker (gunicorn -w 2) عبر IntegrityError بدل قفل توزيعي."""
    __tablename__ = "user_notifications"
    __table_args__ = (
        db.UniqueConstraint("user_id", "category", "dedup_key", name="uq_user_notification_dedup"),
    )

    id = db.Column(db.String(32), primary_key=True, default=gen_id)
    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), nullable=False, index=True)
    template_id = db.Column(db.String(32), db.ForeignKey("notification_templates.id"), nullable=True)
    category = db.Column(db.String(30), nullable=False, index=True)
    dedup_key = db.Column(db.String(40), nullable=False)
    sent_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    opened_at = db.Column(db.DateTime, nullable=True)
    metadata_json = db.Column(db.Text, nullable=True)


class NotificationSettings(db.Model):
    """صف واحد لكل مستخدم — كل شي معطّل افتراضيًا (enabled=False) لين المستخدم يفعّله صراحة
    من الإعدادات (لا نطلب إذن Push ولا نرسل شي بدون قرار واعٍ منه)."""
    __tablename__ = "notification_settings"

    user_id = db.Column(db.String(32), db.ForeignKey("users.id"), primary_key=True)
    enabled = db.Column(db.Boolean, nullable=False, default=False)
    breakfast_enabled = db.Column(db.Boolean, nullable=False, default=True)
    lunch_enabled = db.Column(db.Boolean, nullable=False, default=True)
    dinner_enabled = db.Column(db.Boolean, nullable=False, default=True)
    water_enabled = db.Column(db.Boolean, nullable=False, default=True)
    streak_enabled = db.Column(db.Boolean, nullable=False, default=True)
    xp_enabled = db.Column(db.Boolean, nullable=False, default=True)
    recipe_enabled = db.Column(db.Boolean, nullable=False, default=True)
    daily_summary_enabled = db.Column(db.Boolean, nullable=False, default=True)
    quiet_hours_start = db.Column(db.String(5), nullable=False, default="22:00")
    quiet_hours_end = db.Column(db.String(5), nullable=False, default="08:00")
    daily_limit = db.Column(db.Integer, nullable=False, default=5)
    breakfast_time = db.Column(db.String(5), nullable=False, default="08:00")
    lunch_time = db.Column(db.String(5), nullable=False, default="13:30")
    dinner_time = db.Column(db.String(5), nullable=False, default="19:30")
    # Anti-Spam: يرتفع بكل إشعار ما انفتح، ينصفر أول ما المستخدم يتفاعل (يفتح إشعار أو يستخدم الشات)
    consecutive_ignored = db.Column(db.Integer, nullable=False, default=0)
    last_sent_category = db.Column(db.String(30), nullable=True)
    last_sent_template_id = db.Column(db.String(32), nullable=True)
    last_sent_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
