"""
لوحة أدمن للنصائح الغذائية (NutritionTip) — يسمح للأدمن يضيف/يعدّل/يعطّل نصيحة
بدون تعديل الكود (مطابق لقاعدة #51/#28 بالطلب: بنك نصائح قابل للتوسع من الإدارة).
لوحة أدمن كاملة للأكل/aliases تبقى عبر scripts/import_foods.py (خارج نطاق هذا الملف).
"""
import os
from datetime import datetime

from flask import Blueprint, render_template, redirect, url_for, request, flash, abort
from flask_login import login_required, current_user
from flask_wtf import FlaskForm
from werkzeug.utils import secure_filename
from PIL import Image, UnidentifiedImageError

from models import (
    db, NutritionTip, AdminLog, Level, StreakMilestone,
    Recipe, RecipeCategory, RecipeIngredient, RecipeStep, RecipeSubstitution,
    NotificationTemplate,
)
from auth import admin_required
from nutrition_ai.tips_engine import ALL_CATEGORIES
from nutrition_ai.notifications.templates_seed import NOTIFICATION_TEMPLATES_SEED

NOTIFICATION_CATEGORIES = sorted({t["category"] for t in NOTIFICATION_TEMPLATES_SEED})

admin_bp = Blueprint("admin", __name__)


class _CSRFOnlyForm(FlaskForm):
    pass


@admin_bp.route("/admin/tips", methods=["GET"])
@login_required
@admin_required
def admin_tips():
    tips = NutritionTip.query.order_by(NutritionTip.category, NutritionTip.priority.desc()).all()
    form = _CSRFOnlyForm()
    return render_template("admin_tips.html", tips=tips, form=form, categories=ALL_CATEGORIES)


@admin_bp.route("/admin/tips/add", methods=["POST"])
@login_required
@admin_required
def admin_tips_add():
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    text = request.form.get("text", "").strip()
    category = request.form.get("category", "").strip()
    meal_type = request.form.get("meal_type", "").strip() or None
    goal = request.form.get("goal", "").strip() or None
    time_period = request.form.get("time_period", "").strip() or None
    try:
        priority = int(request.form.get("priority", "0"))
    except ValueError:
        priority = 0

    if len(text) < 5 or not category:
        flash("لازم تكتب نص النصيحة والتصنيف على الأقل", "error")
        return redirect(url_for("admin.admin_tips"))

    tip = NutritionTip(
        text=text, category=category, meal_type=meal_type,
        goal=goal, time_period=time_period, priority=priority,
        active=True, created_by=current_user.id,
    )
    db.session.add(tip)
    db.session.flush()  # نحتاج tip.id (Column default) قبل تسجيله بـ AdminLog
    db.session.add(AdminLog(admin_id=current_user.id, action="tip_added", target_id=tip.id, details=category))
    db.session.commit()

    flash("تمت إضافة النصيحة", "success")
    return redirect(url_for("admin.admin_tips"))


@admin_bp.route("/admin/tips/<tip_id>/toggle", methods=["POST"])
@login_required
@admin_required
def admin_tips_toggle(tip_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    tip = NutritionTip.query.get_or_404(tip_id)
    tip.active = not tip.active
    db.session.add(AdminLog(
        admin_id=current_user.id, action="tip_toggled", target_id=tip.id,
        details=f"active={tip.active}",
    ))
    db.session.commit()
    return redirect(url_for("admin.admin_tips"))


@admin_bp.route("/admin/tips/<tip_id>/delete", methods=["POST"])
@login_required
@admin_required
def admin_tips_delete(tip_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    tip = NutritionTip.query.get_or_404(tip_id)
    db.session.add(AdminLog(admin_id=current_user.id, action="tip_deleted", target_id=tip.id, details=tip.category))
    db.session.delete(tip)
    db.session.commit()
    flash("تم حذف النصيحة", "info")
    return redirect(url_for("admin.admin_tips"))


# ==================== Levels ====================

@admin_bp.route("/admin/levels", methods=["GET"])
@login_required
@admin_required
def admin_levels():
    rows = Level.query.order_by(Level.level.asc()).all()
    form = _CSRFOnlyForm()
    return render_template("admin_levels.html", levels=rows, form=form)


@admin_bp.route("/admin/levels/add", methods=["POST"])
@login_required
@admin_required
def admin_levels_add():
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    try:
        level_num = int(request.form.get("level", ""))
        required_xp = int(request.form.get("required_xp", ""))
    except ValueError:
        flash("رقم المستوى والـXP المطلوب لازم يكونون أرقام صحيحة", "error")
        return redirect(url_for("admin.admin_levels"))

    title = request.form.get("title", "").strip()
    reward = request.form.get("reward", "").strip() or None

    if Level.query.get(level_num):
        flash("هذا المستوى موجود أصلاً — عدّله بدل إضافته من جديد", "error")
        return redirect(url_for("admin.admin_levels"))
    if not title:
        flash("لازم تكتب عنوان للمستوى", "error")
        return redirect(url_for("admin.admin_levels"))

    db.session.add(Level(level=level_num, required_xp=required_xp, title=title, reward=reward))
    db.session.add(AdminLog(admin_id=current_user.id, action="level_added", target_id=str(level_num), details=title))
    db.session.commit()
    flash("تمت إضافة المستوى", "success")
    return redirect(url_for("admin.admin_levels"))


@admin_bp.route("/admin/levels/<int:level_num>/update", methods=["POST"])
@login_required
@admin_required
def admin_levels_update(level_num):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    row = Level.query.get_or_404(level_num)
    try:
        row.required_xp = int(request.form.get("required_xp", row.required_xp))
    except ValueError:
        pass
    row.title = request.form.get("title", row.title).strip() or row.title
    row.reward = request.form.get("reward", "").strip() or None

    db.session.add(AdminLog(admin_id=current_user.id, action="level_updated", target_id=str(level_num), details=row.title))
    db.session.commit()
    flash("تم تحديث المستوى", "success")
    return redirect(url_for("admin.admin_levels"))


@admin_bp.route("/admin/levels/<int:level_num>/delete", methods=["POST"])
@login_required
@admin_required
def admin_levels_delete(level_num):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    row = Level.query.get_or_404(level_num)
    db.session.add(AdminLog(admin_id=current_user.id, action="level_deleted", target_id=str(level_num), details=row.title))
    db.session.delete(row)
    db.session.commit()
    flash("تم حذف المستوى", "info")
    return redirect(url_for("admin.admin_levels"))


# ==================== Streak Milestones ====================

@admin_bp.route("/admin/streak-milestones", methods=["GET"])
@login_required
@admin_required
def admin_streak_milestones():
    rows = StreakMilestone.query.order_by(StreakMilestone.days.asc()).all()
    form = _CSRFOnlyForm()
    return render_template("admin_streak_milestones.html", milestones=rows, form=form)


@admin_bp.route("/admin/streak-milestones/add", methods=["POST"])
@login_required
@admin_required
def admin_streak_milestones_add():
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    try:
        days = int(request.form.get("days", ""))
        xp_reward = int(request.form.get("xp_reward", "0"))
    except ValueError:
        flash("عدد الأيام ومكافأة الـXP لازم يكونون أرقام صحيحة", "error")
        return redirect(url_for("admin.admin_streak_milestones"))

    label = request.form.get("label", "").strip()
    if not label:
        flash("لازم تكتب وصف للمحطة", "error")
        return redirect(url_for("admin.admin_streak_milestones"))
    if StreakMilestone.query.filter_by(days=days).first():
        flash("فيه محطة أصلاً بنفس عدد الأيام", "error")
        return redirect(url_for("admin.admin_streak_milestones"))

    m = StreakMilestone(days=days, xp_reward=xp_reward, label=label, active=True)
    db.session.add(m)
    db.session.flush()
    db.session.add(AdminLog(admin_id=current_user.id, action="milestone_added", target_id=m.id, details=label))
    db.session.commit()
    flash("تمت إضافة المحطة", "success")
    return redirect(url_for("admin.admin_streak_milestones"))


@admin_bp.route("/admin/streak-milestones/<milestone_id>/toggle", methods=["POST"])
@login_required
@admin_required
def admin_streak_milestones_toggle(milestone_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    m = StreakMilestone.query.get_or_404(milestone_id)
    m.active = not m.active
    db.session.add(AdminLog(admin_id=current_user.id, action="milestone_toggled", target_id=m.id, details=f"active={m.active}"))
    db.session.commit()
    return redirect(url_for("admin.admin_streak_milestones"))


@admin_bp.route("/admin/streak-milestones/<milestone_id>/delete", methods=["POST"])
@login_required
@admin_required
def admin_streak_milestones_delete(milestone_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    m = StreakMilestone.query.get_or_404(milestone_id)
    db.session.add(AdminLog(admin_id=current_user.id, action="milestone_deleted", target_id=m.id, details=m.label))
    db.session.delete(m)
    db.session.commit()
    flash("تم حذف المحطة", "info")
    return redirect(url_for("admin.admin_streak_milestones"))


# ==================== Recipes ====================

ALLOWED_RECIPE_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
MAX_RECIPE_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB


def _allowed_recipe_image(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_RECIPE_IMAGE_EXTENSIONS


def _unique_slug() -> str:
    import uuid
    while True:
        slug = f"recipe-{uuid.uuid4().hex[:8]}"
        if not Recipe.query.filter_by(slug=slug).first():
            return slug


@admin_bp.route("/admin/recipes", methods=["GET"])
@login_required
@admin_required
def admin_recipes():
    recipes = Recipe.query.order_by(Recipe.created_at.desc()).all()
    categories = RecipeCategory.query.order_by(RecipeCategory.order_index).all()
    form = _CSRFOnlyForm()
    return render_template("admin_recipes.html", recipes=recipes, categories=categories, form=form)


@admin_bp.route("/admin/recipes/add", methods=["POST"])
@login_required
@admin_required
def admin_recipes_add():
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    name = request.form.get("name", "").strip()
    category_id = request.form.get("category_id", "").strip()
    if len(name) < 2 or not category_id:
        flash("لازم تدخل اسم الوصفة والتصنيف على الأقل", "error")
        return redirect(url_for("admin.admin_recipes"))

    try:
        calories = int(request.form.get("calories", "0"))
        protein = float(request.form.get("protein", "0") or 0)
        carbs = float(request.form.get("carbs", "0") or 0)
        fat = float(request.form.get("fat", "0") or 0)
        fiber = request.form.get("fiber", "").strip()
        fiber = float(fiber) if fiber else None
        servings = int(request.form.get("servings", "1") or 1)
        prep_time_min = request.form.get("prep_time_min", "").strip()
        prep_time_min = int(prep_time_min) if prep_time_min else None
        cook_time_min = request.form.get("cook_time_min", "").strip()
        cook_time_min = int(cook_time_min) if cook_time_min else None
    except ValueError:
        flash("تأكد إن الحقول الرقمية (سعرات/بروتين/كارب/دهون/حصص/وقت) أرقام صحيحة", "error")
        return redirect(url_for("admin.admin_recipes"))

    recipe = Recipe(
        name=name, slug=_unique_slug(), description=request.form.get("description", "").strip() or None,
        category_id=category_id, prep_time_min=prep_time_min, cook_time_min=cook_time_min,
        servings=servings, difficulty=request.form.get("difficulty", "easy"),
        calories=calories, protein=protein, carbs=carbs, fat=fat, fiber=fiber, active=False,
    )
    db.session.add(recipe)
    db.session.flush()
    db.session.add(AdminLog(admin_id=current_user.id, action="recipe_added", target_id=recipe.id, details=name))
    db.session.commit()

    flash("تمت إضافة الوصفة — أكمل المكونات والخطوات قبل التفعيل", "success")
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))


@admin_bp.route("/admin/recipes/<recipe_id>/edit", methods=["GET"])
@login_required
@admin_required
def admin_recipe_edit(recipe_id):
    recipe = Recipe.query.get_or_404(recipe_id)
    categories = RecipeCategory.query.order_by(RecipeCategory.order_index).all()
    form = _CSRFOnlyForm()
    ingredients = sorted(recipe.ingredients, key=lambda i: i.order_index)
    steps = sorted(recipe.steps, key=lambda s: s.step_number)
    return render_template(
        "admin_recipe_edit.html", recipe=recipe, categories=categories, form=form,
        ingredients=ingredients, steps=steps, substitutions=recipe.substitutions,
    )


@admin_bp.route("/admin/recipes/<recipe_id>/update", methods=["POST"])
@login_required
@admin_required
def admin_recipe_update(recipe_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    recipe = Recipe.query.get_or_404(recipe_id)
    name = request.form.get("name", "").strip()
    category_id = request.form.get("category_id", "").strip()
    if len(name) < 2 or not category_id:
        flash("لازم تدخل اسم الوصفة والتصنيف على الأقل", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    try:
        recipe.calories = int(request.form.get("calories", "0"))
        recipe.protein = float(request.form.get("protein", "0") or 0)
        recipe.carbs = float(request.form.get("carbs", "0") or 0)
        recipe.fat = float(request.form.get("fat", "0") or 0)
        fiber = request.form.get("fiber", "").strip()
        recipe.fiber = float(fiber) if fiber else None
        recipe.servings = int(request.form.get("servings", "1") or 1)
        prep_time_min = request.form.get("prep_time_min", "").strip()
        recipe.prep_time_min = int(prep_time_min) if prep_time_min else None
        cook_time_min = request.form.get("cook_time_min", "").strip()
        recipe.cook_time_min = int(cook_time_min) if cook_time_min else None
    except ValueError:
        flash("تأكد إن الحقول الرقمية أرقام صحيحة", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    recipe.name = name
    recipe.category_id = category_id
    recipe.description = request.form.get("description", "").strip() or None
    recipe.difficulty = request.form.get("difficulty", "easy")
    recipe.updated_at = datetime.utcnow()

    db.session.add(AdminLog(admin_id=current_user.id, action="recipe_updated", target_id=recipe.id, details=name))
    db.session.commit()
    flash("تم تحديث بيانات الوصفة", "success")
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))


@admin_bp.route("/admin/recipes/<recipe_id>/toggle", methods=["POST"])
@login_required
@admin_required
def admin_recipe_toggle(recipe_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    recipe = Recipe.query.get_or_404(recipe_id)
    if not recipe.active and (not recipe.ingredients or not recipe.steps):
        flash("لازم تضيف مكونات وخطوات قبل تفعيل الوصفة", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    recipe.active = not recipe.active
    db.session.add(AdminLog(admin_id=current_user.id, action="recipe_toggled", target_id=recipe.id, details=f"active={recipe.active}"))
    db.session.commit()
    return redirect(url_for("admin.admin_recipes"))


@admin_bp.route("/admin/recipes/<recipe_id>/delete", methods=["POST"])
@login_required
@admin_required
def admin_recipe_delete(recipe_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    recipe = Recipe.query.get_or_404(recipe_id)
    if recipe.image_path:
        old_path = os.path.join("static", recipe.image_path)
        if os.path.exists(old_path):
            os.remove(old_path)
    db.session.add(AdminLog(admin_id=current_user.id, action="recipe_deleted", target_id=recipe.id, details=recipe.name))
    db.session.delete(recipe)
    db.session.commit()
    flash("تم حذف الوصفة", "info")
    return redirect(url_for("admin.admin_recipes"))


@admin_bp.route("/admin/recipes/<recipe_id>/image", methods=["POST"])
@login_required
@admin_required
def admin_recipe_image(recipe_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    recipe = Recipe.query.get_or_404(recipe_id)
    photo = request.files.get("image")
    if not photo or not photo.filename:
        flash("ما انتخبت صورة", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))
    if not _allowed_recipe_image(photo.filename):
        flash("صيغة الصورة غير مدعومة (png, jpg, jpeg, webp فقط)", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    photo.seek(0, os.SEEK_END)
    size = photo.tell()
    photo.seek(0)
    if size > MAX_RECIPE_IMAGE_SIZE:
        flash("حجم الصورة كبير جدًا (الحد الأقصى 5MB)", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    try:
        img = Image.open(photo.stream)
        img.verify()
    except (UnidentifiedImageError, OSError):
        flash("الملف مو صورة صالحة", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    photo.stream.seek(0)
    img = Image.open(photo.stream).convert("RGB")
    width, height = img.size
    side = min(width, height)
    left, top = (width - side) // 2, (height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((800, 800), Image.LANCZOS)

    old_image = recipe.image_path
    filename = secure_filename(f"{recipe.id}_{int(datetime.utcnow().timestamp())}.jpg")
    upload_dir = os.path.join("static", "uploads", "recipe_images")
    os.makedirs(upload_dir, exist_ok=True)
    img.save(os.path.join(upload_dir, filename), "JPEG", quality=85, optimize=True)

    recipe.image_path = f"uploads/recipe_images/{filename}"
    db.session.add(AdminLog(admin_id=current_user.id, action="recipe_image_updated", target_id=recipe.id, details=recipe.name))
    db.session.commit()

    if old_image and old_image.startswith("uploads/recipe_images/"):
        old_path = os.path.join("static", old_image)
        if os.path.exists(old_path):
            os.remove(old_path)

    flash("تم تحديث صورة الوصفة", "success")
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))


@admin_bp.route("/admin/recipes/<recipe_id>/ingredients/add", methods=["POST"])
@login_required
@admin_required
def admin_recipe_ingredient_add(recipe_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    recipe = Recipe.query.get_or_404(recipe_id)
    name = request.form.get("name", "").strip()
    if not name:
        flash("لازم تكتب اسم المكوّن", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    max_order = max([i.order_index for i in recipe.ingredients], default=-1)
    db.session.add(RecipeIngredient(
        recipe_id=recipe.id, name=name,
        quantity=request.form.get("quantity", "").strip() or None,
        unit=request.form.get("unit", "").strip() or None,
        order_index=max_order + 1,
    ))
    db.session.commit()
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))


@admin_bp.route("/admin/recipes/<recipe_id>/ingredients/<ingredient_id>/delete", methods=["POST"])
@login_required
@admin_required
def admin_recipe_ingredient_delete(recipe_id, ingredient_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    ingredient = RecipeIngredient.query.filter_by(id=ingredient_id, recipe_id=recipe_id).first_or_404()
    db.session.delete(ingredient)
    db.session.commit()
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe_id))


@admin_bp.route("/admin/recipes/<recipe_id>/steps/add", methods=["POST"])
@login_required
@admin_required
def admin_recipe_step_add(recipe_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    recipe = Recipe.query.get_or_404(recipe_id)
    instruction = request.form.get("instruction", "").strip()
    if not instruction:
        flash("لازم تكتب نص الخطوة", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    max_step = max([s.step_number for s in recipe.steps], default=0)
    db.session.add(RecipeStep(
        recipe_id=recipe.id, step_number=max_step + 1, instruction=instruction,
        duration=request.form.get("duration", "").strip() or None,
        temperature=request.form.get("temperature", "").strip() or None,
        tip=request.form.get("tip", "").strip() or None,
        warning=request.form.get("warning", "").strip() or None,
    ))
    db.session.commit()
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))


@admin_bp.route("/admin/recipes/<recipe_id>/steps/<step_id>/delete", methods=["POST"])
@login_required
@admin_required
def admin_recipe_step_delete(recipe_id, step_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    step = RecipeStep.query.filter_by(id=step_id, recipe_id=recipe_id).first_or_404()
    db.session.delete(step)
    db.session.commit()
    # إعادة ترقيم الخطوات المتبقية حتى تبقى متسلسلة بدون فجوات
    recipe = Recipe.query.get(recipe_id)
    for idx, s in enumerate(sorted(recipe.steps, key=lambda s: s.step_number), start=1):
        s.step_number = idx
    db.session.commit()
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe_id))


@admin_bp.route("/admin/recipes/<recipe_id>/substitutions/add", methods=["POST"])
@login_required
@admin_required
def admin_recipe_substitution_add(recipe_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    recipe = Recipe.query.get_or_404(recipe_id)
    ingredient_name = request.form.get("ingredient_name", "").strip()
    replacement = request.form.get("replacement", "").strip()
    if not ingredient_name or not replacement:
        flash("لازم تكتب اسم المكوّن والبديل", "error")
        return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))

    db.session.add(RecipeSubstitution(recipe_id=recipe.id, ingredient_name=ingredient_name, replacement=replacement))
    db.session.commit()
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe.id))


@admin_bp.route("/admin/recipes/<recipe_id>/substitutions/<sub_id>/delete", methods=["POST"])
@login_required
@admin_required
def admin_recipe_substitution_delete(recipe_id, sub_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    sub = RecipeSubstitution.query.filter_by(id=sub_id, recipe_id=recipe_id).first_or_404()
    db.session.delete(sub)
    db.session.commit()
    return redirect(url_for("admin.admin_recipe_edit", recipe_id=recipe_id))


@admin_bp.route("/admin/recipes/categories/add", methods=["POST"])
@login_required
@admin_required
def admin_recipe_category_add():
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    name = request.form.get("name", "").strip()
    icon = request.form.get("icon", "").strip() or "🍽️"
    if not name:
        flash("لازم تكتب اسم التصنيف", "error")
        return redirect(url_for("admin.admin_recipes"))
    if RecipeCategory.query.filter_by(name=name).first():
        flash("فيه تصنيف أصلاً بنفس الاسم", "error")
        return redirect(url_for("admin.admin_recipes"))

    max_order = max([c.order_index for c in RecipeCategory.query.all()], default=0)
    category = RecipeCategory(name=name, icon=icon, order_index=max_order + 1)
    db.session.add(category)
    db.session.flush()
    db.session.add(AdminLog(admin_id=current_user.id, action="recipe_category_added", target_id=category.id, details=name))
    db.session.commit()
    flash("تمت إضافة التصنيف", "success")
    return redirect(url_for("admin.admin_recipes"))


# ==================== Notification Templates ====================

@admin_bp.route("/admin/notifications", methods=["GET"])
@login_required
@admin_required
def admin_notifications():
    templates = NotificationTemplate.query.order_by(NotificationTemplate.category, NotificationTemplate.priority.desc()).all()
    form = _CSRFOnlyForm()
    return render_template("admin_notifications.html", templates=templates, form=form, categories=NOTIFICATION_CATEGORIES)


@admin_bp.route("/admin/notifications/add", methods=["POST"])
@login_required
@admin_required
def admin_notifications_add():
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    category = request.form.get("category", "").strip()
    title = request.form.get("title", "").strip()
    body = request.form.get("body", "").strip()
    meal_type = request.form.get("meal_type", "").strip() or None
    goal = request.form.get("goal", "").strip() or None
    try:
        priority = int(request.form.get("priority", "0"))
        cooldown_minutes = int(request.form.get("cooldown_minutes", "0"))
    except ValueError:
        priority = 0
        cooldown_minutes = 0

    if not category or len(title) < 2 or len(body) < 5:
        flash("لازم تكتب التصنيف والعنوان ونص الإشعار على الأقل", "error")
        return redirect(url_for("admin.admin_notifications"))

    template = NotificationTemplate(
        category=category, title=title, body=body, meal_type=meal_type, goal=goal,
        priority=priority, cooldown_minutes=cooldown_minutes, active=True,
    )
    db.session.add(template)
    db.session.flush()
    db.session.add(AdminLog(admin_id=current_user.id, action="notification_template_added", target_id=template.id, details=category))
    db.session.commit()
    flash("تمت إضافة قالب الإشعار", "success")
    return redirect(url_for("admin.admin_notifications"))


@admin_bp.route("/admin/notifications/<template_id>/toggle", methods=["POST"])
@login_required
@admin_required
def admin_notifications_toggle(template_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    template = NotificationTemplate.query.get_or_404(template_id)
    template.active = not template.active
    db.session.add(AdminLog(
        admin_id=current_user.id, action="notification_template_toggled", target_id=template.id,
        details=f"active={template.active}",
    ))
    db.session.commit()
    return redirect(url_for("admin.admin_notifications"))


@admin_bp.route("/admin/notifications/<template_id>/delete", methods=["POST"])
@login_required
@admin_required
def admin_notifications_delete(template_id):
    form = _CSRFOnlyForm()
    if not form.validate_on_submit():
        abort(400)

    template = NotificationTemplate.query.get_or_404(template_id)
    db.session.add(AdminLog(admin_id=current_user.id, action="notification_template_deleted", target_id=template.id, details=template.category))
    db.session.delete(template)
    db.session.commit()
    flash("تم حذف القالب", "info")
    return redirect(url_for("admin.admin_notifications"))
