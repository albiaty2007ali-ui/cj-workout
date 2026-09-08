"""
Typo Tolerance Layer — يحاول يفهم كلمة أكل مكتوبة غلط بدل ما يرد "الكلمة غير صحيحة".
يشتغل فقط على الأجزاء اللي ما طابقتها food_search.py حرفيًا (consumed_spans)، وما يخمّن أبدًا
لو النتيجة غير واثقة — يطلب توضيح بدلها. لا يستخدم أي مكتبة خارجية (difflib من stdlib).
"""
import difflib
import re

import food_search

# عتبات الثقة — قابلة للتعديل مركزيًا هنا فقط
AUTO_THRESHOLD = 0.90
CONFIRM_THRESHOLD = 0.70
AMBIGUOUS_GAP = 0.08

# كلمات شائعة بجملة الأكل ما نحاول نطابقها ضد أسماء الأكل أبدًا (تفادي نتائج فوضوية)
STOPWORDS = {
    "اكلت", "أكلت", "فطرت", "تغديت", "تعشيت", "عشيت", "شربت", "زيدلي", "ضيف",
    "هسه", "هسة", "بعدني", "لسا", "مع", "وياها", "ويا", "وايا", "من", "الى", "إلى",
    "كان", "كانت", "شوي", "شوية", "تقريبا", "تقريباً", "اليوم", "امس", "باجر",
    "و", "ب", "ال", "شي", "شنو", "كيف", "شكد", "لو", "او", "أو",
}


def _leftover_text(normalized_text: str, consumed_spans):
    chars = list(normalized_text)
    for start, end in consumed_spans:
        for i in range(start, min(end, len(chars))):
            chars[i] = " "
    return "".join(chars)


def _candidate_tokens(leftover: str):
    words = [w for w in re.split(r"\s+", leftover) if w]
    tokens = []
    for w in words:
        if len(w) >= 3 and w not in STOPWORDS:
            tokens.append(w)
    for i in range(len(words) - 1):
        bigram = f"{words[i]} {words[i + 1]}"
        if words[i] not in STOPWORDS or words[i + 1] not in STOPWORDS:
            tokens.append(bigram)
    return tokens


def find_fuzzy_candidates(raw_text: str):
    """
    يرجّع قائمة اقتراحات لكل جزء غير متطابق بالرسالة، كل عنصر:
      {"token": ..., "matches": [{"food_id", "food_name", "confidence"}, ...] مرتبة تنازليًا}
    القرار (تلقائي/تأكيد/توضيح) يُترك للمتصل (entities.py) حسب العتبات أعلاه.
    """
    _results, consumed_spans, normalized_text = food_search.match_message_with_meta(raw_text)
    leftover = _leftover_text(normalized_text, consumed_spans)
    tokens = _candidate_tokens(leftover)
    if not tokens:
        return []

    aliases = food_search.get_all_aliases_dicts()
    # نستبعد aliases قصيرة جدًا (أقل من 3 أحرف) لتفادي تطابقات ضبابية عشوائية
    aliases = [a for a in aliases if len(a["normalized_alias"]) >= 3]

    suggestions = []
    seen_food_ids_per_token = set()
    for token in tokens:
        scored = []
        seen_food_ids_per_token.clear()
        for alias in aliases:
            ratio = difflib.SequenceMatcher(None, token, alias["normalized_alias"]).ratio()
            if ratio < 0.55:
                continue
            fid = alias["food_id"]
            if fid in seen_food_ids_per_token:
                continue
            seen_food_ids_per_token.add(fid)
            scored.append({
                "food_id": fid,
                "food_name": alias["food_name"],
                "confidence": round(ratio, 3),
                "alias_row": alias,
            })
        if not scored:
            continue
        scored.sort(key=lambda c: -c["confidence"])
        if scored[0]["confidence"] >= CONFIRM_THRESHOLD:
            idx = leftover.find(token)
            suggestions.append({
                "token": token, "start": idx, "end": idx + len(token) if idx >= 0 else None,
                "matches": scored[:3],
            })

    return suggestions


def classify_candidates(matches: list):
    """
    يحوّل قائمة matches مرتبة تنازليًا إلى قرار واحد من:
      ("auto", match)            -> ثقة عالية، أكمل تلقائيًا
      ("confirm", match)         -> ثقة متوسطة، اسأل "تقصد {food}؟"
      ("ambiguous", [m1, m2])    -> أكثر من مرشح قوي متقارب، اسأل "تقصد {A} لو {B}؟"
      ("none", None)             -> ولا مرشح واثق كفاية
    """
    if not matches:
        return "none", None
    top = matches[0]
    if len(matches) > 1:
        second = matches[1]
        if top["confidence"] - second["confidence"] <= AMBIGUOUS_GAP and second["confidence"] >= CONFIRM_THRESHOLD:
            return "ambiguous", [top, second]
    if top["confidence"] >= AUTO_THRESHOLD:
        return "auto", top
    if top["confidence"] >= CONFIRM_THRESHOLD:
        return "confirm", top
    return "none", None
