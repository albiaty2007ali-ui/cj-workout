"""
واجهة نظام الوصفات (تصفح/بحث/تفاصيل) — البيانات تجي حصرًا من جداول Recipe/RecipeCategory
عبر nutrition_ai/recipe_search.py، لا بيانات وهمية أو مُختلقة هنا. واعية بحد السعرات اليومي
(nutrition_ai/context.py الموجودة أصلًا) — تمنع بدء وصفة جديدة عند تجاوز الهدف (Backend حقيقي،
مو بس تعطيل زر)، لكن لا تمنع أبدًا تسجيل وجبة أكلها المستخدم فعليًا (ذاك القرار بـorchestrator.py).
"""
from flask import Blueprint, render_template, request, jsonify, abort
from flask_login import login_required, current_user
from flask_wtf import FlaskForm
from flask_wtf.csrf import validate_csrf, ValidationError

from models import db, Recipe, RecipeCategory, MealLog, NutritionProfile, WaterLog
from nutrition_ai import recipe_search, context, orchestrator

recipes_bp = Blueprint("recipes", __name__, url_prefix="/recipes")


class _CSRFOnlyForm(FlaskForm):
    pass


def _validate_csrf_header():
    try:
        validate_csrf(request.headers.get("X-CSRFToken", ""))
        return None
    except ValidationError:
        return jsonify({"ok": False, "error": "جلسة منتهية، أعد تحميل الصفحة"}), 400


def _calorie_context() -> dict:
    """يعيد استخدام nutrition_ai/context.py الموجودة — لا حساب سعرات مكرر بأي مكان."""
    profile = NutritionProfile.query.get(current_user.id)
    return context.build(current_user, profile, MealLog, WaterLog)


def _recipe_card(r: Recipe, remaining_calories=None, over_target=False) -> dict:
    fits_remaining = None
    if remaining_calories is not None and not over_target:
        fits_remaining = r.calories <= remaining_calories
    return {
        "slug": r.slug, "name": r.name, "category": r.category.name if r.category else None,
        "category_icon": r.category.icon if r.category else "🍽️",
        "image_url": f"/static/{r.image_path}" if r.image_path else None,
        "calories": r.calories, "protein": r.protein, "carbs": r.carbs, "fat": r.fat,
        "fiber": r.fiber, "prep_time_min": r.prep_time_min, "cook_time_min": r.cook_time_min,
        "servings": r.servings, "difficulty": r.difficulty, "fits_remaining": fits_remaining,
    }


@recipes_bp.route("")
@login_required
def index():
    categories = RecipeCategory.query.order_by(RecipeCategory.order_index).all()
    recipes = recipe_search.search_recipes()
    ctx = _calorie_context()
    return render_template(
        "recipes_index.html", categories=categories,
        recipes=[_recipe_card(r, ctx["remaining_calories"], ctx["over_target"]) for r in recipes],
        over_target=ctx["over_target"], remaining_calories=ctx["remaining_calories"],
    )


@recipes_bp.route("/api/search")
@login_required
def api_search():
    query = request.args.get("q", "")
    category_id = request.args.get("category") or None
    recipes = recipe_search.search_recipes(query=query, category_id=category_id)
    ctx = _calorie_context()
    return jsonify({
        "ok": True,
        "recipes": [_recipe_card(r, ctx["remaining_calories"], ctx["over_target"]) for r in recipes],
    })


@recipes_bp.route("/<slug>")
@login_required
def detail(slug):
    recipe = Recipe.query.filter_by(slug=slug, active=True).first()
    if not recipe:
        abort(404)

    steps = sorted(recipe.steps, key=lambda s: s.step_number)
    ingredients = sorted(recipe.ingredients, key=lambda i: i.order_index)
    ctx = _calorie_context()
    return render_template(
        "recipe_detail.html", recipe=recipe, steps=steps, ingredients=ingredients,
        substitutions=recipe.substitutions, form=_CSRFOnlyForm(),
        over_target=ctx["over_target"], remaining_calories=ctx["remaining_calories"],
    )


@recipes_bp.route("/<slug>/start", methods=["POST"])
@login_required
def start_cooking(slug):
    """تحقق Backend حقيقي قبل الدخول لوضع Tutorial — يمنع بدء وصفة جديدة إذا تجاوز المستخدم
    هدفه اليومي فعلًا (مو مجرد تعطيل زر بالواجهة). لا علاقة له بتسجيل وجبة أُكلت فعليًا."""
    err = _validate_csrf_header()
    if err:
        return err

    recipe = Recipe.query.filter_by(slug=slug, active=True).first_or_404()
    if current_user.trial_exhausted:
        return jsonify({"ok": False, "message": "انتهت وجباتك المجانية 🌱 اشترك للمتابعة من صفحة الاشتراك."})

    ctx = _calorie_context()
    if ctx["over_target"]:
        return jsonify({
            "ok": False,
            "message": f"وصلت لهدف السعرات اليومي. \"{recipe.name}\" راح تزيد سعراتك أكثر من هدفك اليوم.",
        })

    current_user.current_recipe_id = recipe.id
    current_user.current_recipe_step = 0
    db.session.commit()
    return jsonify({"ok": True})


@recipes_bp.route("/<slug>/complete", methods=["POST"])
@login_required
def complete_cooking(slug):
    """يُستدعى مرة وحدة بالضبط لما Tutorial الويب يوصل آخر خطوة — يفعّل نفس حالة انتظار
    التأكيد المستخدمة بالشات (orchestrator.mark_recipe_awaiting_confirmation)، صفر تسجيل هنا."""
    err = _validate_csrf_header()
    if err:
        return err

    recipe = Recipe.query.filter_by(slug=slug, active=True).first_or_404()
    if current_user.current_recipe_id != recipe.id:
        return jsonify({"ok": False, "error": "لازم تبدأ الطبخ أول من هذي الصفحة."}), 400

    prompt = orchestrator.mark_recipe_awaiting_confirmation(current_user, db, recipe)
    return jsonify({"ok": True, "reply": prompt})
