"""
تطبيع النص العربي لتحسين مطابقة أسماء الأكل — بدون ربط كلمات مختلفة عشوائيًا.
يوحّد أشكال الألف، يزيل التشكيل والتطويل، وينظّف المسافات فقط.
"""
import re

_DIACRITICS = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
_TATWEEL = "\u0640"

_ALEF_FORMS = str.maketrans({
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
    "ى": "ي",  # ألف مقصورة -> ياء (شائع بالكتابة العراقية)
})


def normalize(text: str) -> str:
    if not text:
        return ""
    text = text.strip()
    text = _DIACRITICS.sub("", text)
    text = text.replace(_TATWEEL, "")
    text = text.translate(_ALEF_FORMS)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
