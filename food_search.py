"""
البحث والمطابقة داخل قاعدة CJ WORKOUT المحلية.
لا يوجد أي طلب شبكة هنا — كل شيء محلي (SQLite + FTS5).
"""
import re
from food_db import get_connection
from arabic_normalize import normalize

NUMBER_WORDS = {
    "واحد": 1, "واحدة": 1, "وحدة": 1,
    "اثنين": 2, "اثنتين": 2, "ثنتين": 2, "زوج": 2,
    "ثلاثة": 3, "ثلاث": 3,
    "اربعة": 4, "اربع": 4,
    "خمسة": 5, "خمس": 5,
    "ستة": 6, "ست": 6,
    "سبعة": 7, "سبع": 7,
    "ثمانية": 8, "ثمان": 8,
    "تسعة": 9, "تسع": 9,
    "عشرة": 10, "عشر": 10,
}

GRAM_UNIT_WORDS = ["غرام", "غم", "جرام", "جم", "gram", "g"]

# صيغ مختلفة لنفس اسم الـPortion بقاعدة البيانات (خصوصًا الجمع) — تطبيع محلي فقط عند مطابقة
# اسم الحصة، بدون ما يأثر على مواقع الأحرف المستخدمة بمطابقة الأرقام/الـalias بمكان ثاني
UNIT_SPELLING_VARIANTS = {
    "خواشيق": "خاشوقة", "خاشوگة": "خاشوقة", "خاشوكة": "خاشوقة",
    "ملاعق": "ملعقة",
}


def _normalize_unit_words(text: str) -> str:
    for variant, canonical in UNIT_SPELLING_VARIANTS.items():
        text = text.replace(variant, canonical)
    return text


def _get_all_aliases(conn):
    """كل الـaliases مرتبة من الأطول للأقصر لتفادي تطابق جزئي خاطئ (مثل 'بيض' داخل 'بيضتين')."""
    rows = conn.execute(
        "SELECT fa.id as alias_id, fa.normalized_alias, fa.quantity_multiplier, fa.is_plural_unspecified, "
        "f.id as food_id, f.name as food_name, f.is_bulk "
        "FROM food_aliases fa JOIN foods f ON f.id = fa.food_id"
    ).fetchall()
    return sorted(rows, key=lambda r: -len(r["normalized_alias"]))


def _find_number_before(text: str, pos: int):
    """يبحث عن رقم (كلمة أو خانة) ضمن آخر 15 حرف قبل موقع المطابقة."""
    window = text[max(0, pos - 15):pos]
    m = re.search(r"(\d+)\s*$", window)
    if m:
        return float(m.group(1))
    for word, val in NUMBER_WORDS.items():
        if re.search(rf"\b{re.escape(word)}\s*$", window):
            return float(val)
    return None


def _find_grams_before(text: str, pos: int):
    window = text[max(0, pos - 20):pos]
    m = re.search(r"(\d+)\s*(?:" + "|".join(GRAM_UNIT_WORDS) + r")\s*$", window)
    if m:
        return float(m.group(1))
    return None


def _find_portion(conn, food_id: int, text: str):
    """
    يفتش عن Portion معرّف لهذا الطعام. يدعم الحالتين:
    - متجاورة: "صحن متوسط"
    - منفصلة حول اسم الطعام (شائع بالعراقي): "صحن تمن متوسط"
    عبر التحقق من وجود كل كلمات اسم الـPortion بالنص، بأي ترتيب.
    """
    text = _normalize_unit_words(text)  # نسخة محلية فقط — ما يأثر على مواقع الأحرف بمكان الاستدعاء
    portions = conn.execute(
        "SELECT * FROM food_portions WHERE food_id=? ORDER BY LENGTH(normalized_portion_name) DESC",
        (food_id,),
    ).fetchall()
    best = None
    for p in portions:
        if p["normalized_portion_name"] in text:
            return p
        tokens = p["normalized_portion_name"].split()
        if len(tokens) > 1 and all(tok in text for tok in tokens):
            if best is None or len(p["normalized_portion_name"]) > len(best["normalized_portion_name"]):
                best = p
    return best


def match_message(raw_text: str):
    """
    يحلل رسالة المستخدم ويرجع قائمة نتائج، كل نتيجة واحدة من:
      - resolved: طعام + كمية محسومة (grams أو portion)
      - needs_clarification: طعام معروف لكن الكمية غير واضحة (يرجع خيارات الـportions المتاحة)
    """
    results, _spans, _text = match_message_with_meta(raw_text)
    return results


def match_message_with_meta(raw_text: str):
    """
    نفس match_message لكن يرجّع أيضًا (consumed_spans, normalized_text) —
    يُستخدم من nutrition_ai/fuzzy.py لمعرفة أي أجزاء من الرسالة ما طابقت أي alias حرفيًا،
    حتى يجرّب عليها مطابقة ضبابية (تحمّل أخطاء الكتابة) بدل تجاهلها بصمت.
    """
    text = normalize(raw_text)
    conn = get_connection()
    aliases = _get_all_aliases(conn)

    results = []
    consumed_spans = []

    def _overlaps(start, end):
        return any(not (end <= s or start >= e) for s, e in consumed_spans)

    for row in aliases:
        alias = row["normalized_alias"]
        for m in re.finditer(re.escape(alias), text):
            start, end = m.start(), m.end()
            if _overlaps(start, end):
                continue
            results.append(_resolve_hit(conn, row, text, start, end))
            consumed_spans.append((start, end))

    conn.close()
    return results, consumed_spans, text


def _resolve_hit(conn, row, text: str, start: int, end: int) -> dict:
    """
    يحدد الكمية/الحصة لطعام معروف الموقع بالنص (alias مطابق حرفيًا أو ضبابيًا).
    مشترك بين match_message_with_meta وnutrition_ai/fuzzy.py عند تأكيد مطابقة ضبابية.
    """
    grams_explicit = _find_grams_before(text, start)
    portion = None if grams_explicit else _find_portion(conn, row["food_id"], text)
    number_before = _find_number_before(text, start)

    if grams_explicit is not None:
        return {
            "food_id": row["food_id"], "food_name": row["food_name"],
            "resolved": True, "grams": grams_explicit,
        }
    if portion is not None:
        qty = number_before or 1
        return {
            "food_id": row["food_id"], "food_name": row["food_name"],
            "resolved": True, "grams": portion["grams"] * qty, "quantity": qty,
            "portion_name": portion["portion_name"], "unit_grams": portion["grams"],
        }
    if number_before is not None and not row["is_bulk"]:
        # عدد صريح مذكور (مثلاً "5 تمرات") — نستخدم أول Portion معرّف لهذا الطعام كوحدة قياس
        default_portion = conn.execute(
            "SELECT * FROM food_portions WHERE food_id=? LIMIT 1", (row["food_id"],)
        ).fetchone()
        unit_grams = default_portion["grams"] if default_portion else 100
        grams = unit_grams * number_before
        return {
            "food_id": row["food_id"], "food_name": row["food_name"],
            "resolved": True, "grams": grams, "quantity": number_before, "unit_grams": unit_grams,
        }
    if row["is_plural_unspecified"] and not number_before:
        return {
            "food_id": row["food_id"], "food_name": row["food_name"],
            "resolved": False, "needs_clarification": True,
        }
    if row["is_bulk"]:
        return {
            "food_id": row["food_id"], "food_name": row["food_name"],
            "resolved": False, "needs_clarification": True,
        }
    # طعام Discrete: المضاعِف من الـalias نفسه (مفرد=1, مثنى=2)
    multiplier = row["quantity_multiplier"]
    default_portion = conn.execute(
        "SELECT * FROM food_portions WHERE food_id=? LIMIT 1", (row["food_id"],)
    ).fetchone()
    unit_grams = default_portion["grams"] if default_portion else 100
    grams = unit_grams * multiplier
    return {
        "food_id": row["food_id"], "food_name": row["food_name"],
        "resolved": True, "grams": grams, "quantity": multiplier, "unit_grams": unit_grams,
    }


def resolve_alias_at(alias_row: dict, raw_text: str, start: int, end: int) -> dict:
    """نسخة عامة من _resolve_hit تفتح اتصالها الخاص — تُستخدم بعد تأكيد مطابقة ضبابية (fuzzy)."""
    text = normalize(raw_text)
    conn = get_connection()
    try:
        return _resolve_hit(conn, alias_row, text, start, end)
    finally:
        conn.close()


def get_all_aliases_dicts():
    """نسخة عامة (مو private) من كل الـaliases كقواميس بسيطة — تُستخدم من nutrition_ai/fuzzy.py."""
    conn = get_connection()
    rows = _get_all_aliases(conn)
    result = [dict(r) for r in rows]
    conn.close()
    return result


def get_portions_for(food_id: int):
    conn = get_connection()
    rows = conn.execute("SELECT * FROM food_portions WHERE food_id=?", (food_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def resolve_quantity_for_food(food_id: int, raw_text: str):
    """
    يُستخدم عندما يكون الطعام معروفًا مسبقًا (بانتظار توضيح الكمية) والمستخدم يرد
    برسالة قد لا تحتوي اسم الطعام إطلاقًا، مثل "صحن متوسط" أو "300 غرام" أو "5 حبات".
    """
    text = _normalize_unit_words(normalize(raw_text))
    conn = get_connection()

    m = re.search(r"(\d+)\s*(?:" + "|".join(GRAM_UNIT_WORDS) + r")", text)
    if m:
        conn.close()
        return {"resolved": True, "grams": float(m.group(1))}

    portions = conn.execute(
        "SELECT * FROM food_portions WHERE food_id=? ORDER BY LENGTH(normalized_portion_name) DESC",
        (food_id,),
    ).fetchall()
    number = None
    m2 = re.search(r"\d+", text)
    if m2:
        number = float(m2.group(0))
    else:
        for word, val in NUMBER_WORDS.items():
            if word in text:
                number = float(val)
                break

    for p in portions:
        tokens = p["normalized_portion_name"].split()
        if p["normalized_portion_name"] in text or all(tok in text for tok in tokens):
            qty = number or 1
            conn.close()
            return {"resolved": True, "grams": p["grams"] * qty, "portion_name": p["portion_name"]}

    if number is not None and portions:
        habba_portion = next((p for p in portions if p["normalized_portion_name"] == "حبة"), None)
        if habba_portion:
            conn.close()
            return {"resolved": True, "grams": habba_portion["grams"] * number, "portion_name": habba_portion["portion_name"]}

    conn.close()
    return {"resolved": False}


def compute_nutrition(food_id: int, grams: float) -> dict:
    conn = get_connection()
    n = conn.execute("SELECT * FROM food_nutrients WHERE food_id=?", (food_id,)).fetchone()
    conn.close()
    if not n:
        return {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "fiber": 0}
    factor = grams / 100.0
    return {
        "calories": round(n["calories_per_100g"] * factor),
        "protein": round(n["protein_per_100g"] * factor, 1),
        "carbs": round(n["carbs_per_100g"] * factor, 1),
        "fat": round(n["fat_per_100g"] * factor, 1),
        "fiber": round(n["fiber_per_100g"] * factor, 1),
    }
