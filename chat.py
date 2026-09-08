from flask import Blueprint, render_template, redirect, url_for, request, jsonify
from flask_login import login_required, current_user
from flask_wtf import FlaskForm
from flask_wtf.csrf import validate_csrf, ValidationError

from models import db, NutritionProfile, MealLog, WeightHistory, MealStatus, ShownTip, WaterLog, NutritionTip
import calorie_calc
import nutrition_engine
import iraq_time
from nutrition_ai import calculator
from whatsapp_util import consultation_whatsapp_link

chat_bp = Blueprint("chat", __name__)


MEAL_LABELS_AR = {"breakfast": "الفطور", "lunch": "الغداء", "dinner": "العشاء"}

GREETINGS = {
    "morning": {
        "text": "صباح الخير كابتن 🌤️\nشنو وضع الريوك اليوم؟\nأكلت لو بعدك؟",
        "prompts": [("🍳 أكلت الريوك", "فطرت "), ("⏰ بعدني", "بعدني"), ("🍽️ اقترحلي ريوك", "اقترحلي فطور خفيف")],
    },
    "noon": {
        "text": "هلا كابتن 👋\nشلونك ويا الغدا؟\nتغديت لو بعدك؟",
        "prompts": [("🍚 تغديت", "تغديت "), ("⏰ بعدني", "بعدني"), ("🍽️ اقترحلي غدا", "اقترحلي غداء")],
    },
    "evening": {
        "text": "مساء الخير كابتن 🌙\nشنو وضع العشة اليوم؟\nتعشيت لو بعدك؟",
        "prompts": [("🍽️ تعشيت", "تعشيت "), ("⏰ بعدني", "بعدني"), ("🥗 اقترحلي عشة", "اقترحلي عشاء خفيف")],
    },
    "late_night": {
        "text": "بعدك صاحي كابتن؟ 🌙\nإذا ما متعشي، أگدر أقترحلك شي خفيف يناسب سعراتك المتبقية.",
        "prompts": [("🥗 اقترحلي شي خفيف", "اقترحلي عشاء خفيف"), ("😴 راح أنام", "راح أنام")],
    },
}


def _get_or_create_status(user, meal_type, today):
    row = MealStatus.query.filter_by(user_id=user.id, date=today, meal_type=meal_type).first()
    if not row:
        row = MealStatus(user_id=user.id, date=today, meal_type=meal_type, status="not_started")
        db.session.add(row)
        db.session.commit()
    return row


def build_greeting(user, remaining_calories: int):
    """يبني تحية مناسبة للوقت الحالي بتوقيت بغداد، وما يعيد نفس السؤال إذا الوجبة مسجلة أو انسألت أصلًا."""
    period = iraq_time.get_current_period()
    meal_type = iraq_time.relevant_meal_for_period(period)
    today = iraq_time.now_baghdad().date()

    status_row = _get_or_create_status(user, meal_type, today)

    if status_row.status == "logged":
        label = MEAL_LABELS_AR[meal_type]
        return {
            "text": f"{label} مسجل ✓\nباقيلك اليوم {max(0, remaining_calories)} سعرة.",
            "prompts": [("🔥 شكد باقيلي؟", "باقيلي شكد؟"), ("🍽️ شنو آكل هسه؟", "شنو آكل هسه؟")],
        }

    if status_row.status == "asked":
        # ما نكرر نفس السؤال المزعج — تحية عامة أخف بدون إعادة نفس العبارة
        return {
            "text": "هلا بيك مرة ثانية 👋 خبرني إذا سجلت شي جديد أو تحتاج اقتراح وجبة.",
            "prompts": [("🍽️ شنو آكل هسه؟", "شنو آكل هسه؟"), ("🔥 شكد باقيلي؟", "باقيلي شكد؟")],
        }

    # not_started — أول مرة اليوم نسأل عن هذي الوجبة
    status_row.status = "asked"
    db.session.commit()
    g = GREETINGS.get(period, GREETINGS["noon"])
    return {"text": g["text"], "prompts": g["prompts"]}


class _CSRFOnlyForm(FlaskForm):
    pass


PREMIUM_LOCK_MESSAGE = (
    "🔒 خلصت وجباتك المجانية\n\n"
    "أنت جربت CJ WORKOUT وخلصت أول 6 وجبات 💪\n\n"
    "إذا تريد تكمل رحلتك، تحصل على:\n"
    "✓ خطط غذائية شخصية\n"
    "✓ أكلات عراقية دايت\n"
    "✓ أكل بيتنا\n"
    "✓ اقتراحات تعويض ذكية\n"
    "✓ خلي نطبخ دايت\n"
    "✓ مساعد الطبخ\n"
    "✓ تتبع السعرات والتقدم\n\n"
    "10,000 دينار عراقي / شهر"
)


@chat_bp.route("/onboarding", methods=["GET", "POST"])
@login_required
def onboarding():
    form = _CSRFOnlyForm()
    errors = {}

    if request.method == "POST" and form.validate_on_submit():
        try:
            age = int(request.form.get("age", 0))
            weight = float(request.form.get("weight", 0))
            height = float(request.form.get("height", 0))
            sex = request.form.get("sex")
            goal = request.form.get("goal")
            activity = request.form.get("activity")
        except ValueError:
            age = weight = height = 0
            sex = goal = activity = None

        if not (10 <= age <= 100):
            errors["age"] = "أدخل عمر صحيح (10-100)"
        if not (30 <= weight <= 300):
            errors["weight"] = "أدخل وزن صحيح بالكيلوغرام"
        if not (100 <= height <= 250):
            errors["height"] = "أدخل طول صحيح بالسنتيمتر"
        if sex not in ("male", "female"):
            errors["sex"] = "اختر الجنس"
        if goal not in ("lose", "maintain", "gain"):
            errors["goal"] = "اختر هدفك"
        if activity not in calorie_calc.ACTIVITY_FACTORS:
            errors["activity"] = "اختر مستوى نشاطك"

        if not errors:
            result = calorie_calc.calculate(age, weight, height, sex, goal, activity)

            profile = NutritionProfile.query.get(current_user.id)
            if not profile:
                profile = NutritionProfile(user_id=current_user.id)
                db.session.add(profile)

            profile.age = age
            profile.weight_kg = weight
            profile.height_cm = height
            profile.sex = sex
            profile.goal = goal
            profile.activity_level = activity
            profile.bmr = result["bmr"]
            profile.tdee = result["tdee"]
            profile.calorie_target = result["calorie_target"]
            profile.water_target_ml = result["water_target_ml"]

            db.session.add(WeightHistory(
                user_id=current_user.id, weight_kg=weight,
                bmr=result["bmr"], tdee=result["tdee"],
                calorie_target=result["calorie_target"],
            ))

            current_user.onboarding_completed = True
            db.session.commit()

            return redirect(url_for("chat.app_home", welcome=1))

    return render_template(
        "onboarding.html", form=form, errors=errors,
        activity_labels=calorie_calc.ACTIVITY_LABELS,
    )


@chat_bp.route("/app")
@login_required
def app_home():
    if not current_user.onboarding_completed:
        return redirect(url_for("chat.onboarding"))

    profile = NutritionProfile.query.get(current_user.id)
    today_calories = calculator.today_totals(current_user, MealLog)["calories"]
    target = profile.calorie_target if profile else 2000
    remaining = target - today_calories

    greeting = build_greeting(current_user, remaining)

    form = _CSRFOnlyForm()
    return render_template(
        "chat.html",
        form=form,
        profile=profile,
        today_calories=today_calories,
        target_calories=target,
        remaining=remaining,
        free_meals_remaining=current_user.free_meals_remaining,
        is_premium=current_user.is_premium,
        just_onboarded=request.args.get("welcome") == "1",
        greeting_text=greeting["text"],
        greeting_prompts=greeting["prompts"],
        consult_whatsapp_link=consultation_whatsapp_link(),
    )


@chat_bp.route("/api/chat", methods=["POST"])
@login_required
def api_chat():
    try:
        validate_csrf(request.headers.get("X-CSRFToken", ""))
    except ValidationError:
        return jsonify({"error": "جلسة منتهية، أعد تحميل الصفحة"}), 400

    # بوابة حقيقية على مستوى الخادم — قبل معالجة أي رسالة، مو بس عند محاولة تسجيل وجبة.
    # قبل هذا التعديل كانت أي رسالة غير تسجيل وجبة (توصية/سؤال عام/ماي...) تستمر تعمل بلا قيد
    # حتى بعد انتهاء الوجبات المجانية.
    if current_user.trial_exhausted:
        return jsonify({
            "reply": PREMIUM_LOCK_MESSAGE,
            "premium_required": True,
            "subscribe_url": url_for("payments.subscribe"),
        })

    data = request.get_json(silent=True) or {}
    text = (data.get("message") or "").strip()
    if not text:
        return jsonify({"error": "الرسالة فارغة"}), 400
    if len(text) > 500:
        return jsonify({"error": "الرسالة طويلة جدًا"}), 400

    # Debug Mode (#52 بالطلب الأصلي) — للأدمن فقط، حتى لو المستخدم العادي أرسل الفلاغ يدويًا
    debug_requested = bool(data.get("debug")) and current_user.role == "admin"

    result = nutrition_engine.handle_message(
        current_user, text, db,
        {
            "MealLog": MealLog, "NutritionProfile": NutritionProfile,
            "MealStatus": MealStatus, "ShownTip": ShownTip,
            "WaterLog": WaterLog, "NutritionTip": NutritionTip,
        },
        debug=debug_requested,
    )

    if result.get("premium_required"):
        return jsonify({
            "reply": PREMIUM_LOCK_MESSAGE,
            "premium_required": True,
            "subscribe_url": url_for("payments.subscribe"),
        })

    response = {
        "reply": result["reply"],
        "meal_logged": result.get("meal_logged", False),
        "today_calories": result.get("today_calories"),
        "target_calories": result.get("target_calories"),
        "remaining": result.get("remaining"),
        "xp": result.get("xp"),
        "free_meals_used": result.get("free_meals_used"),
        "free_meals_remaining": current_user.free_meals_remaining,
    }
    if debug_requested and "debug" in result:
        response["debug"] = result["debug"]
    return jsonify(response)
