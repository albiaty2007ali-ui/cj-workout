"""
Weight Update — نقطة الحقيقة الوحيدة لتحديث وزن المستخدم: يعيد حساب bmr/tdee/calorie_target
عبر calorie_calc.py الحقيقي، ويحفظ سجل WeightHistory (لا يُستبدل القياس السابق أبدًا). يستدعيها
كل من nutrition_ai/orchestrator.py (تحديث عبر الشات) وprogress_bp.py (تحديث عبر صفحة متابعة
الوزن) — صفر تكرار منطق، نفس النتيجة بالضبط من أي مسار.
"""
import calorie_calc


def apply_weight_update(user, new_weight_kg: float, db, NutritionProfile, WeightHistory) -> dict:
    """يرجّع نتيجة calorie_calc.calculate() (تحتوي bmr/tdee/calorie_target/water_target_ml
    و safety_warning إن وجد)، أو None لو ماكو NutritionProfile بعد (المستخدم ما أكمل Onboarding)."""
    profile = NutritionProfile.query.get(user.id)
    if not profile:
        return None

    result = calorie_calc.calculate(
        profile.age, new_weight_kg, profile.height_cm, profile.sex, profile.goal, profile.activity_level
    )
    profile.weight_kg = new_weight_kg
    profile.bmr = result["bmr"]
    profile.tdee = result["tdee"]
    profile.calorie_target = result["calorie_target"]
    profile.water_target_ml = result["water_target_ml"]
    db.session.add(WeightHistory(
        user_id=user.id, weight_kg=new_weight_kg, bmr=result["bmr"],
        tdee=result["tdee"], calorie_target=result["calorie_target"],
    ))
    db.session.commit()
    return result
