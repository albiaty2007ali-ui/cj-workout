"""
صفحة الإعدادات — الأقسام الحقيقية فقط (كل قسم مربوط ببيانات حقيقية موجودة بالنظام).
خصوصية "أصدقاء" مؤجّلة عمدًا — ما فيه بنية تحتية لها بعد، ولا نبني واجهة وهمية.
تفضيلات الإشعارات (نظام Web Push حقيقي — nutrition_ai/notifications/) لم تعد مؤجّلة.
"""
import json
import os
import re
import uuid
from datetime import datetime

from flask import Blueprint, render_template, request, jsonify, Response
from flask_login import login_required, current_user
from flask_wtf import FlaskForm
from flask_wtf.csrf import validate_csrf, ValidationError

from models import db, MealLog, WaterLog, WeightHistory, NutritionProfile, PushSubscription
from nutrition_ai.notifications import engine as notifications_engine
from validation import validate_password

settings_bp = Blueprint("settings", __name__)

AI_STYLES = {"concise", "balanced", "detailed"}
VISIBILITY_OPTIONS = {"public", "private"}
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class _CSRFOnlyForm(FlaskForm):
    pass


def _validate_csrf_json():
    try:
        validate_csrf(request.headers.get("X-CSRFToken", ""))
        return None
    except ValidationError:
        return jsonify({"ok": False, "error": "جلسة منتهية، أعد تحميل الصفحة"}), 400


@settings_bp.route("/settings")
@login_required
def index():
    form = _CSRFOnlyForm()
    notification_settings = notifications_engine.get_or_create_settings(current_user)
    return render_template("settings.html", form=form, notification_settings=notification_settings)


@settings_bp.route("/settings/ai-style", methods=["POST"])
@login_required
def set_ai_style():
    err = _validate_csrf_json()
    if err:
        return err
    style = (request.get_json(silent=True) or {}).get("style")
    if style not in AI_STYLES:
        return jsonify({"ok": False, "error": "خيار غير صحيح"}), 400
    current_user.ai_response_style = style
    db.session.commit()
    return jsonify({"ok": True, "style": style})


@settings_bp.route("/settings/privacy", methods=["POST"])
@login_required
def set_privacy():
    err = _validate_csrf_json()
    if err:
        return err
    visibility = (request.get_json(silent=True) or {}).get("visibility")
    if visibility not in VISIBILITY_OPTIONS:
        return jsonify({"ok": False, "error": "خيار غير صحيح"}), 400
    current_user.profile_visibility = visibility
    db.session.commit()
    return jsonify({"ok": True, "visibility": visibility})


@settings_bp.route("/settings/password", methods=["POST"])
@login_required
def change_password():
    err = _validate_csrf_json()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    current_pw = data.get("current_password", "")
    new_pw = data.get("new_password", "")
    confirm_pw = data.get("confirm_password", "")

    if not current_user.check_password(current_pw):
        return jsonify({"ok": False, "error": "كلمة المرور الحالية غير صحيحة"}), 400
    if new_pw != confirm_pw:
        return jsonify({"ok": False, "error": "كلمتا المرور الجديدتان غير متطابقتين"}), 400
    if err_msg := validate_password(new_pw):
        return jsonify({"ok": False, "error": err_msg}), 400

    current_user.set_password(new_pw)
    db.session.commit()
    return jsonify({"ok": True})


@settings_bp.route("/settings/delete-account", methods=["POST"])
@login_required
def delete_account():
    """تعطيل + مسح البيانات الشخصية — نبقي سجلات الدفع/الاشتراك للتدقيق المالي بدل حذفها."""
    err = _validate_csrf_json()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    if not current_user.check_password(data.get("password", "")):
        return jsonify({"ok": False, "error": "كلمة المرور غير صحيحة"}), 400

    current_user.disabled = True
    current_user.name = "مستخدم محذوف"
    current_user.username = None
    current_user.bio = None
    current_user.photo_url = None
    current_user.email = f"deleted-{uuid.uuid4().hex}@deleted.cjworkout.local"
    db.session.commit()
    return jsonify({"ok": True})


@settings_bp.route("/settings/export")
@login_required
def export_data():
    profile = NutritionProfile.query.get(current_user.id)
    data = {
        "account": {
            "name": current_user.name, "email": current_user.email,
            "username": current_user.username, "created_at": current_user.created_at.isoformat(),
        },
        "nutrition_profile": {
            "age": profile.age, "weight_kg": profile.weight_kg, "height_cm": profile.height_cm,
            "goal": profile.goal, "calorie_target": profile.calorie_target,
        } if profile else None,
        "meals": [
            {
                "meal_type": m.meal_type, "raw_text": m.raw_text, "total_calories": m.total_calories,
                "total_protein": m.total_protein, "total_carbs": m.total_carbs, "total_fat": m.total_fat,
                "created_at": m.created_at.isoformat(),
            }
            for m in MealLog.query.filter_by(user_id=current_user.id).order_by(MealLog.created_at).all()
        ],
        "water_logs": [
            {"ml": w.ml, "created_at": w.created_at.isoformat()}
            for w in WaterLog.query.filter_by(user_id=current_user.id).order_by(WaterLog.created_at).all()
        ],
        "weight_history": [
            {"weight_kg": w.weight_kg, "recorded_at": w.recorded_at.isoformat()}
            for w in WeightHistory.query.filter_by(user_id=current_user.id).order_by(WeightHistory.recorded_at).all()
        ],
        "xp": current_user.xp, "streak_days": current_user.streak_days,
        "longest_streak": current_user.longest_streak,
        "exported_at": datetime.utcnow().isoformat(),
    }
    filename = f"cjworkout_data_{current_user.id}.json"
    return Response(
        json.dumps(data, ensure_ascii=False, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@settings_bp.route("/settings/notifications", methods=["POST"])
@login_required
def set_notification_settings():
    """يحفظ كل تفضيلات الإشعارات فعليًا (تفعيل عام/لكل تصنيف/ساعات عدم إزعاج/الحد اليومي/
    أوقات التذكير) — هذا القسم حقيقي بالكامل، مو UI وهمي بانتظار بنية تحتية."""
    err = _validate_csrf_json()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    settings = notifications_engine.get_or_create_settings(current_user)

    for time_field in ("quiet_hours_start", "quiet_hours_end", "breakfast_time", "lunch_time", "dinner_time"):
        if time_field in data:
            value = data[time_field]
            if not TIME_RE.match(value or ""):
                return jsonify({"ok": False, "error": f"صيغة وقت غير صحيحة: {time_field}"}), 400
            setattr(settings, time_field, value)

    if "daily_limit" in data:
        try:
            limit = int(data["daily_limit"])
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "الحد اليومي لازم يكون رقم"}), 400
        if not (1 <= limit <= 20):
            return jsonify({"ok": False, "error": "الحد اليومي بين 1 و20"}), 400
        settings.daily_limit = limit

    for bool_field in (
        "enabled", "breakfast_enabled", "lunch_enabled", "dinner_enabled", "water_enabled",
        "streak_enabled", "xp_enabled", "recipe_enabled", "daily_summary_enabled",
    ):
        if bool_field in data:
            setattr(settings, bool_field, bool(data[bool_field]))

    db.session.commit()
    return jsonify({"ok": True})


@settings_bp.route("/settings/vapid-public-key")
@login_required
def vapid_public_key():
    key = os.environ.get("VAPID_PUBLIC_KEY", "")
    if key.startswith("CHANGE_ME"):
        key = ""
    return jsonify({"public_key": key})


@settings_bp.route("/settings/push-subscribe", methods=["POST"])
@login_required
def push_subscribe():
    err = _validate_csrf_json()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    endpoint = data.get("endpoint")
    keys = data.get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        return jsonify({"ok": False, "error": "بيانات اشتراك غير مكتملة"}), 400

    existing = PushSubscription.query.filter_by(endpoint=endpoint).first()
    if existing:
        existing.user_id = current_user.id
        existing.p256dh = keys["p256dh"]
        existing.auth = keys["auth"]
    else:
        db.session.add(PushSubscription(
            user_id=current_user.id, endpoint=endpoint,
            p256dh=keys["p256dh"], auth=keys["auth"],
            user_agent=request.headers.get("User-Agent", "")[:300],
        ))
    db.session.commit()
    return jsonify({"ok": True})


@settings_bp.route("/settings/push-unsubscribe", methods=["POST"])
@login_required
def push_unsubscribe():
    err = _validate_csrf_json()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    endpoint = data.get("endpoint")
    if endpoint:
        PushSubscription.query.filter_by(endpoint=endpoint, user_id=current_user.id).delete()
        db.session.commit()
    return jsonify({"ok": True})


@settings_bp.route("/settings/push-opened", methods=["POST"])
def push_opened():
    """يُستدعى من static/sw.js (خارج سياق صفحة، بدون CSRF Token متاح) — تسجيل 'تم الفتح'
    فقط، أثره الوحيد إنعاش عدّاد التجاهل المتتالي (Anti-Spam)، لا بيانات حساسة يكشفها."""
    data = request.get_json(silent=True) or {}
    notification_id = data.get("notification_id")
    if notification_id:
        notifications_engine.mark_opened(notification_id)
    return jsonify({"ok": True})
