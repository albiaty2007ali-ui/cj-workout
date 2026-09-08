"""
Quantity/Units Engine — يفهم أرقام وكميات باللهجة العراقية (كلمات وأرقام)، مستقل عن أي طعام معيّن.
يُستخدم من food_search.py (عبر NUMBER_WORDS المشتركة) ومن نيّة WATER_LOG هنا.
لا يخترع قيمة أبدًا — إذا ما وجد رقم/وحدة صريحة يرجّع None ويترك القرار للمتصل (يسأل المستخدم).
"""
import re

from arabic_normalize import normalize

NUMBER_WORDS = {
    "صفر": 0,
    "واحد": 1, "واحدة": 1, "وحدة": 1, "حبة": 1, "حبه": 1,
    "اثنين": 2, "اثنتين": 2, "ثنتين": 2, "زوج": 2, "زوجين": 2,
    "ثلاثة": 3, "ثلاث": 3,
    "اربعة": 4, "أربعة": 4, "اربع": 4, "أربع": 4,
    "خمسة": 5, "خمس": 5,
    "ستة": 6, "ست": 6,
    "سبعة": 7, "سبع": 7,
    "ثمانية": 8, "ثمان": 8, "ثمانى": 8,
    "تسعة": 9, "تسع": 9,
    "عشرة": 10, "عشر": 10,
    "عشرين": 20,
    "مية": 100, "مائة": 100,
}

# وحدات الماي — لا نربطها بغرامات طعام، فقط مليلتر
WATER_UNITS_ML = {
    "لتر": 1000, "ليتر": 1000,
    "نص لتر": 500, "نصف لتر": 500,
    "ربع لتر": 250,
    "كوب": 240,
    "استكان": 200, "إستكان": 200,
    "مل": 1, "ملل": 1, "ml": 1,
}
# مرتبة من الأطول للأقصر لتفادي تطابق جزئي (مثل "لتر" داخل "نص لتر")
_WATER_UNIT_KEYS = sorted(WATER_UNITS_ML.keys(), key=len, reverse=True)


def parse_number_word(token: str):
    """يحاول تفسير كلمة واحدة كرقم. يرجع None إذا مو رقم معروف."""
    return NUMBER_WORDS.get(token)


def find_leading_number(text: str):
    """يبحث عن أول رقم (خانة أو كلمة) بالنص بالكامل — يُستخدم لحالات مثل 'وزني هسه 80'."""
    text = normalize(text)
    m = re.search(r"(\d+(?:\.\d+)?)", text)
    if m:
        return float(m.group(1))
    for word, val in sorted(NUMBER_WORDS.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"(?:^|\s){re.escape(word)}(?:\s|$)", text):
            return float(val)
    return None


def parse_water_ml(text: str):
    """
    يحاول حسم كمية الماي المذكورة صراحة بالنص.
    'شربت نص لتر' -> 500 ، 'شربت 500 مل' -> 500 ، 'شربت كوبين ماي' -> 480
    يرجع None إذا الكمية غير مذكورة (لا نفترضها أبدًا — نفس فلسفة الأكل).
    """
    text = normalize(text)
    for unit in _WATER_UNIT_KEYS:
        idx = text.find(unit)
        if idx == -1:
            continue
        base_ml = WATER_UNITS_ML[unit]
        if unit in ("مل", "ملل", "ml"):
            m = re.search(r"(\d+(?:\.\d+)?)\s*(?:مل|ملل|ml)", text)
            if m:
                return round(float(m.group(1)) * base_ml)
            continue
        window_before = text[max(0, idx - 15):idx]
        qty = None
        m = re.search(r"(\d+)\s*$", window_before)
        if m:
            qty = float(m.group(1))
        else:
            for word, val in NUMBER_WORDS.items():
                if re.search(rf"{re.escape(word)}\s*$", window_before):
                    qty = float(val)
                    break
        # دعم صيغة "كوبين" الملتصقة (مثنى) كحالة خاصة شائعة
        if qty is None and unit == "كوب" and text[idx:idx + 5].startswith("كوبين"):
            qty = 2
        if qty is None and unit == "استكان" and text[idx:idx + 8].startswith("استكانين"):
            qty = 2
        return round(base_ml * (qty or 1))
    return None
