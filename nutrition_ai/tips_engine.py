"""
Tips Engine — بنك نصائح قابل للتوسّع من لوحة الأدمن بدون تعديل الكود (NutritionTip بقاعدة البيانات)،
مع اختيار سياقي (وقت + هدف + بروتين اليوم + الماي + آخر وجبة) بدل عشوائي بالكامل،
ومنع تكرار عبر ShownTip (نفس الآلية القديمة).
"""
import random

from nutrition_ai.tips_seed import TIPS_SEED

ALL_CATEGORIES = sorted({t["category"] for t in TIPS_SEED})


def seed_default_tips(db, NutritionTip):
    """يزرع النصائح الافتراضية مرة وحدة فقط إذا الجدول فاضي — نفس نمط _seed_default_plan بـ app.py."""
    if NutritionTip.query.first():
        return
    for t in TIPS_SEED:
        db.session.add(NutritionTip(
            id=t["id"], text=t["text"], category=t["category"], active=True,
        ))
    db.session.commit()


def choose_category_for_context(ctx: dict, meal_type: str | None = None) -> str:
    """
    ctx بالشكل اللي يرجعه nutrition_ai/context.py.
    يختار تصنيف نصيحة واحد حسب أهم إشارة متوفرة بالوقت الحالي.
    """
    if ctx.get("over_target"):
        return "high_calorie_meal"

    target = ctx.get("target_calories") or 0
    remaining = ctx.get("remaining_calories") or 0
    if target and remaining <= target * 0.15:
        return "daily_target"

    macro_targets = ctx.get("macro_targets") or {}
    protein_target = macro_targets.get("protein_g")
    if protein_target and ctx.get("consumed_protein", 0) < protein_target * 0.5:
        return "protein"

    water_target = ctx.get("water_target_ml") or 2000
    if ctx.get("water_ml", 0) < water_target * 0.4:
        return "hydration"

    goal = ctx.get("goal")
    if goal == "lose":
        return "weight_loss"
    if goal == "gain":
        return "weight_gain"

    if meal_type in ("breakfast", "lunch", "dinner"):
        return meal_type
    return "balance"


def pick_tip(user_id: str, category: str, db, ShownTip, NutritionTip, recent_limit: int = 5):
    candidates = NutritionTip.query.filter_by(category=category, active=True).all()
    if not candidates:
        candidates = NutritionTip.query.filter_by(category="balance", active=True).all()
    if not candidates:
        return None

    recent_rows = (
        db.session.query(ShownTip.tip_id)
        .filter(ShownTip.user_id == user_id)
        .order_by(ShownTip.shown_at.desc())
        .limit(recent_limit)
        .all()
    )
    recent_ids = {r[0] for r in recent_rows}

    fresh = [t for t in candidates if t.id not in recent_ids]
    pool = fresh if fresh else candidates

    max_priority = max(t.priority for t in pool)
    top_pool = [t for t in pool if t.priority == max_priority] or pool
    chosen = random.choice(top_pool)

    db.session.add(ShownTip(user_id=user_id, tip_id=chosen.id))
    db.session.commit()
    return chosen.text
