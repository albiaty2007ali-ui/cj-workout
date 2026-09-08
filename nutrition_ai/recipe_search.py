"""
نظام الوصفات — بحث نصي مطبّع بديل عن FTS5 (قاعدة الوصفات صغيرة، القرار موثّق بالخطة)،
وزراعة أولية تهاجر فقط الوصفات الحقيقية من recipes_seed.py (لا اختراع بيانات).
"""
import difflib

from arabic_normalize import normalize
from models import db, Recipe, RecipeCategory, RecipeIngredient, RecipeStep, RecipeSubstitution

CONFIRM_THRESHOLD = 0.55


def seed_default_recipe_categories():
    from nutrition_ai.recipes_seed import CATEGORIES_SEED
    if RecipeCategory.query.first():
        return
    for c in CATEGORIES_SEED:
        db.session.add(RecipeCategory(name=c["name"], icon=c["icon"], order_index=c["order_index"]))
    db.session.commit()


def seed_default_recipes():
    """يهاجر الـ4 وصفات الحقيقية فقط من recipes_seed.py — مرة وحدة إذا الجدول فاضي."""
    seed_default_recipe_categories()

    if Recipe.query.first():
        return

    from nutrition_ai.recipes_seed import RECIPES_SEED

    categories_by_name = {c.name: c for c in RecipeCategory.query.all()}

    for r in RECIPES_SEED:
        category = categories_by_name.get(r["category"])
        if category is None:
            continue
        recipe = Recipe(
            name=r["name"], slug=r["slug"], description=r["description"],
            category_id=category.id, prep_time_min=r["prep_time_min"],
            cook_time_min=r["cook_time_min"], servings=r["servings"], difficulty=r["difficulty"],
            calories=r["calories"], protein=r["protein"], carbs=r["carbs"], fat=r["fat"],
            match_keywords="|".join(r["match_keywords"]),
        )
        db.session.add(recipe)
        db.session.flush()

        for idx, ing in enumerate(r["ingredients"]):
            db.session.add(RecipeIngredient(
                recipe_id=recipe.id, name=ing["name"], quantity=ing["quantity"],
                unit=ing["unit"], order_index=idx,
            ))
        for step_num, step in enumerate(r["steps"], start=1):
            db.session.add(RecipeStep(
                recipe_id=recipe.id, step_number=step_num,
                instruction=step["instruction"], duration=step["duration"],
                temperature=step["temperature"], tip=step["tip"], warning=step["warning"],
            ))
        for ing_name, replacement in r["substitutions"].items():
            db.session.add(RecipeSubstitution(
                recipe_id=recipe.id, ingredient_name=ing_name, replacement=replacement,
            ))

    db.session.commit()


def _substring_match(query_norm: str, field: str) -> bool:
    f_norm = normalize(field or "")
    if not f_norm:
        return False
    return query_norm in f_norm or f_norm in query_norm


def _fuzzy_match(query_words: list, field: str) -> bool:
    """تحمّل خطأ إملائي بسيط — تُستخدم فقط ضد حقول تعريفية قصيرة (اسم/كلمات مفتاحية)،
    مو ضد نص وصف حر (كلمات عامة قصيرة بالوصف كانت تعطي تطابقات فوضوية بنسبة ثقة منخفضة)."""
    f_norm = normalize(field or "")
    if not f_norm:
        return False
    for fw in f_norm.split():
        if len(fw) < 4:
            continue
        for qw in query_words:
            if qw in fw or fw in qw:
                return True
            if difflib.SequenceMatcher(None, qw, fw).ratio() >= CONFIRM_THRESHOLD:
                return True
    return False


def search_recipes(query: str = "", category_id: str | None = None):
    """يرجّع قائمة Recipe نشطة تطابق query (اسم/وصف/كلمات مفتاحية) وcategory_id إذا انعطت.
    لا يخمّن — ماكو تطابق يرجّع قائمة فاضية والواجهة تعرض Empty State."""
    q = Recipe.query.filter_by(active=True)
    if category_id:
        q = q.filter_by(category_id=category_id)
    recipes = q.order_by(Recipe.name).all()

    query = (query or "").strip()
    if not query:
        return recipes

    query_norm = normalize(query)
    query_words = [w for w in query_norm.split() if len(w) >= 3]

    matched = []
    for r in recipes:
        keywords = (r.match_keywords or "").split("|")
        if _substring_match(query_norm, r.name) or _substring_match(query_norm, r.description):
            matched.append(r)
            continue
        if any(_substring_match(query_norm, k) for k in keywords):
            matched.append(r)
            continue
        if _fuzzy_match(query_words, r.name) or any(_fuzzy_match(query_words, k) for k in keywords):
            matched.append(r)
    return matched


def find_recipe_by_text(text: str):
    """يبحث عن أفضل وصفة مطابقة لنص حر بالشات (بديل recipes_data.find_recipe القديمة)."""
    results = search_recipes(query=text)
    return results[0] if results else None


def suggest_recipes_within(remaining_calories: int, limit: int = 2) -> list:
    """وصفات حقيقية ضمن السعرات المتبقية — تُستخدم لإثراء رد ASK_RECOMMENDATION بالشات
    (إضافة فقط، لا تلمس بحث foods.sqlite الموجود). لا تخمين — فاضية لو ماكو وصفة تناسب."""
    if remaining_calories <= 0:
        return []
    fitting = [r for r in search_recipes() if r.calories <= remaining_calories]
    fitting.sort(key=lambda r: -r.calories)
    return fitting[:limit]
