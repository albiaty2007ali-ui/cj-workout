"""
يومي الغذائي + متابعة الوزن — صفحتان مبنيتان بالكامل على بيانات حقيقية موجودة أصلاً
(MealLog/WeightHistory/context.build()) — صفر حساب مستقل، نفس مصدر الحقيقة المستخدم بالشات
وبقية الصفحات. راجع CLAUDE.md لتفصيل المعمارية.
"""
from datetime import datetime, timedelta

from flask import Blueprint, render_template, request, jsonify
from flask_login import login_required, current_user
from flask_wtf import FlaskForm
from flask_wtf.csrf import validate_csrf, ValidationError

import iraq_time
from models import db, MealLog, NutritionProfile, WaterLog, WeightHistory
from nutrition_ai import calculator, context, meal_budget, weight_ops, weight_stats

progress_bp = Blueprint("progress", __name__)


class _CSRFOnlyForm(FlaskForm):
    pass


def _validate_csrf_json():
    try:
        validate_csrf(request.headers.get("X-CSRFToken", ""))
        return None
    except ValidationError:
        return jsonify({"ok": False, "error": "جلسة منتهية، أعد تحميل الصفحة"}), 400


@progress_bp.route("/daily")
@login_required
def daily():
    profile = NutritionProfile.query.get(current_user.id)
    if not profile:
        return render_template("daily.html", form=_CSRFOnlyForm(), profile=None)

    date_param = request.args.get("date")
    is_today = not date_param
    try:
        target_date = datetime.strptime(date_param, "%Y-%m-%d").date() if date_param else iraq_time.now_baghdad().date()
    except ValueError:
        target_date = iraq_time.now_baghdad().date()
        is_today = True

    meals = calculator.meals_by_type_for_day(current_user, MealLog, target_date)

    if is_today:
        ctx = context.build(current_user, profile, MealLog, WaterLog)
        remaining_calories = ctx["remaining_calories"]
        over_target = ctx["over_target"]
        unlogged = [m for m in ("breakfast", "lunch", "dinner") if meals[m]["status"] == "NOT_STARTED"]
        budgets = meal_budget.distribute_remaining_budget(
            max(remaining_calories, 0), unlogged, iraq_time.get_current_period()
        )
    else:
        consumed = sum(m["calories"] for m in [meals["breakfast"], meals["lunch"], meals["dinner"]] if m["status"] == "LOGGED")
        consumed += sum(s["calories"] for s in meals["snack"])
        remaining_calories = profile.calorie_target - consumed
        over_target = remaining_calories < 0
        budgets = {}

    return render_template(
        "daily.html", form=_CSRFOnlyForm(), profile=profile, meals=meals,
        target_calories=profile.calorie_target, remaining_calories=remaining_calories,
        over_target=over_target, budgets=budgets, is_today=is_today,
        target_date=target_date, prev_date=target_date - timedelta(days=1),
        next_date=target_date + timedelta(days=1) if not is_today else None,
    )


@progress_bp.route("/progress/weight")
@login_required
def weight_progress():
    profile = NutritionProfile.query.get(current_user.id)
    period_param = request.args.get("period", "30")
    period_days = None if period_param == "all" else int(period_param) if period_param.isdigit() else 30

    stats = weight_stats.compute_weight_stats(
        current_user, WeightHistory,
        goal_weight=profile.goal_weight if profile else None,
        goal_type=profile.goal if profile else None,
        period_days=period_days,
    )
    return render_template(
        "weight_progress.html", form=_CSRFOnlyForm(), profile=profile,
        stats=stats, period=period_param,
    )


@progress_bp.route("/progress/weight/chart-data")
@login_required
def weight_chart_data():
    period_param = request.args.get("period", "30")
    period_days = None if period_param == "all" else int(period_param) if period_param.isdigit() else 30
    stats = weight_stats.compute_weight_stats(current_user, WeightHistory, period_days=period_days)
    return jsonify({
        "entries": [{"date": e["date"].strftime("%Y-%m-%d"), "weight_kg": e["weight_kg"]} for e in stats["entries"]],
    })


@progress_bp.route("/progress/weight/log", methods=["POST"])
@login_required
def log_weight():
    err = _validate_csrf_json()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    try:
        new_weight = float(data.get("weight_kg"))
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "أدخل وزنًا صحيحًا"}), 400
    if not (30 <= new_weight <= 300):
        return jsonify({"ok": False, "error": "الوزن المدخل غير منطقي"}), 400

    result = weight_ops.apply_weight_update(current_user, new_weight, db, NutritionProfile, WeightHistory)
    if result is None:
        return jsonify({"ok": False, "error": "أكمل بياناتك الأساسية أولاً"}), 400
    return jsonify({"ok": True, "calorie_target": result["calorie_target"]})


@progress_bp.route("/progress/weight/goal", methods=["POST"])
@login_required
def set_weight_goal():
    err = _validate_csrf_json()
    if err:
        return err
    profile = NutritionProfile.query.get(current_user.id)
    if not profile:
        return jsonify({"ok": False, "error": "أكمل بياناتك الأساسية أولاً"}), 400
    data = request.get_json(silent=True) or {}
    raw = data.get("goal_weight")
    if raw in (None, ""):
        profile.goal_weight = None
        db.session.commit()
        return jsonify({"ok": True, "goal_weight": None})
    try:
        goal = float(raw)
    except (TypeError, ValueError):
        return jsonify({"ok": False, "error": "أدخل رقمًا صحيحًا"}), 400
    if not (30 <= goal <= 300):
        return jsonify({"ok": False, "error": "الرقم غير منطقي"}), 400
    profile.goal_weight = goal
    db.session.commit()
    return jsonify({"ok": True, "goal_weight": goal})


@progress_bp.route("/progress/weight/<entry_id>/delete", methods=["POST"])
@login_required
def delete_weight_entry(entry_id):
    err = _validate_csrf_json()
    if err:
        return err
    entry = WeightHistory.query.filter_by(id=entry_id, user_id=current_user.id).first()
    if not entry:
        return jsonify({"ok": False, "error": "ماكو قياس بهذا المعرّف"}), 404
    db.session.delete(entry)
    db.session.commit()
    return jsonify({"ok": True})
