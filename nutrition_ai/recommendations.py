"""
Recommendation Engine — يبحث بقاعدة الأكل المحلية حسب السعرات المتبقية/الهدف/البروتين الناقص،
ولا يخترع أي وجبة أبدًا (نفس فلسفة "لا Hallucination بالسعرات"). الـ LLM (لو انفعّل مستقبلاً)
يصيغ الجملة فقط — لا يقرر الأرقام.
"""
import food_search

from nutrition_ai import calculator


def _candidates(remaining_calories: int):
    conn = food_search.get_connection()
    rows = conn.execute(
        "SELECT f.name, fn.calories_per_100g, fn.protein_per_100g, fp.portion_name, fp.grams "
        "FROM foods f JOIN food_nutrients fn ON fn.food_id=f.id "
        "LEFT JOIN food_portions fp ON fp.food_id=f.id "
        "GROUP BY f.id"
    ).fetchall()
    conn.close()
    out = []
    for r in rows:
        grams = r["grams"] or 100
        cal = round(r["calories_per_100g"] * grams / 100)
        protein = round(r["protein_per_100g"] * grams / 100, 1)
        if 0 < cal <= max(remaining_calories, 1):
            out.append({"name": r["name"], "calories": cal, "protein": protein, "portion": r["portion_name"]})
    return out


def suggest_meal_within(remaining_calories: int, protein_needed: float = 0) -> str:
    """يقترح ضمن الباقي من السعرات، مرجّح لصالح البروتين إذا المستخدم ناقصه اليوم."""
    if remaining_calories <= 0:
        return "خلصت سعراتك اليوم، بس اذا لسا جوعان جرب سلطة أو خضار قليلة السعرات جدًا."

    candidates = _candidates(remaining_calories)
    if not candidates:
        return f"باقيلك {remaining_calories} سعرة تقريبًا — جرب وجبة خفيفة زي سلطة أو خضار."

    candidates.sort(key=lambda c: (-c["protein"], c["calories"]))
    top = candidates[:3]
    lines = [f"• {c['name']} ({c['portion'] or 'حصة'}) — ~{c['calories']} kcal" for c in top]
    prefix = f"بما إن باقيلك تقريبًا {remaining_calories} سعرة"
    if protein_needed > 0:
        prefix += " وناقصك بروتين اليوم"
    return f"{prefix}، أقترحلك:\n" + "\n".join(lines)


def suggest_meal_near_target(target_calories: int) -> str:
    """للحالة: 'اريد وجبة 500 سعرة' — يبحث عن أقرب الأطعمة الحقيقية لهذا الرقم، ولا يدّعي رقمًا غير دقيق."""
    conn = food_search.get_connection()
    rows = conn.execute(
        "SELECT f.name, fn.calories_per_100g, fp.portion_name, fp.grams "
        "FROM foods f JOIN food_nutrients fn ON fn.food_id=f.id "
        "LEFT JOIN food_portions fp ON fp.food_id=f.id "
        "GROUP BY f.id"
    ).fetchall()
    conn.close()
    candidates = []
    for r in rows:
        grams = r["grams"] or 100
        cal = round(r["calories_per_100g"] * grams / 100)
        if cal <= 0:
            continue
        diff = abs(cal - target_calories)
        if diff <= max(150, target_calories * 0.3):
            candidates.append((diff, r["name"], cal, r["portion_name"]))
    candidates.sort(key=lambda c: c[0])
    top = candidates[:3]
    if not top:
        return f"ما لقيت وجبة قريبة من {target_calories} سعرة بقاعدة بياناتي الحالية. جرب رقم مختلف أو اذكر أكلة معينة."
    lines = [f"• {name} ({portion or 'حصة'}) — تقريبًا {cal} kcal" for _, name, cal, portion in top]
    return f"هذي أقرب خيارات لـ{target_calories} سعرة تقريبًا:\n" + "\n".join(lines)


def suggest_portion_for_food(food_id: int, food_name: str, remaining_calories: int) -> str:
    """يقترح كمية حقيقية من طعام محدد بالاسم (مثلاً 'شكد آكل من الدولمة؟') — يعتمد فقط على
    food_search.get_portions_for()/calculator.compute_food() الحقيقيين، صفر اختراع أرقام أو
    تحويلات وحدات غير موجودة بقاعدة البيانات. يختار أكبر Portion معروف يبقى ضمن الباقي من
    السعرات، أو يوضح صراحة لو حتى أصغر كمية معروفة أعلى من الباقي (بدون إخفاء الحقيقة)."""
    portions = food_search.get_portions_for(food_id)
    scored = []
    for p in portions:
        grams = p.get("grams")
        if not grams:
            continue
        nutrition = calculator.compute_food(food_id, grams)
        scored.append({"portion_name": p.get("portion_name") or "حصة", "calories": nutrition["calories"]})

    if not scored:
        return (
            f"ماكو عندي معلومة كمية دقيقة عن {food_name} بقاعدة البيانات الحالية، "
            "بس گلي الوزن بالغرام وأحسبلك السعرات بالضبط."
        )

    scored.sort(key=lambda s: s["calories"])
    fitting = [s for s in scored if remaining_calories <= 0 or s["calories"] <= remaining_calories]

    if fitting:
        choice = fitting[-1]
        return (
            f"إذا مشتهي {food_name}، نكدر نخليها بكمية مناسبة لسعراتك 🌱\n"
            f"أقترح تقريبًا {choice['portion_name']} — ~{choice['calories']} kcal."
        )

    choice = scored[0]
    return (
        f"حتى أصغر كمية معروفة من {food_name} ({choice['portion_name']}, ~{choice['calories']} kcal) "
        f"أعلى شوي من سعراتك المتبقية (~{remaining_calories}) — القرار إلك طبعًا، "
        "بس خل الوجبة الجاية أخف حتى توازن يومك."
    )
