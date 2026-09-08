"""
Food Entity Extractor — الطبقة الموحّدة اللي يتعامل معها orchestrator.py.
تجمع نتائج المطابقة الحرفية (food_search.py) والمطابقة الضبابية لتحمّل الأخطاء الإملائية
(nutrition_ai/fuzzy.py) بشكل واحد متّسق، بدون ما تخترع أي رقم غذائي بنفسها.

كل عنصر "clarification" له kind واحد من:
  - "quantity"       : الطعام معروف بثقة، لكن الكمية غير واضحة (نفس سلوك food_search الحالي)
  - "confirm_match"  : تخمين واحد بثقة متوسطة (0.70–0.89) — يحتاج تأكيد "تقصد {food}؟"
  - "ambiguous_match": مرشحين متقاربين — يحتاج اختيار "تقصد {A} لو {B}؟"
"""
import food_search
from nutrition_ai import fuzzy


def extract_food_entities(raw_text: str) -> dict:
    resolved, _spans, _text = food_search.match_message_with_meta(raw_text)

    clarifications = []
    final_resolved = []
    for r in resolved:
        if r.get("resolved"):
            r["confidence"] = 1.0
            final_resolved.append(r)
        else:
            clarifications.append({
                "kind": "quantity",
                "food_id": r["food_id"],
                "food_name": r["food_name"],
            })

    for suggestion in fuzzy.find_fuzzy_candidates(raw_text):
        decision, payload = fuzzy.classify_candidates(suggestion["matches"])
        if decision == "auto":
            hit = food_search.resolve_alias_at(
                payload["alias_row"], raw_text, suggestion["start"], suggestion["end"]
            )
            hit["confidence"] = payload["confidence"]
            if hit.get("resolved"):
                final_resolved.append(hit)
            else:
                clarifications.append({
                    "kind": "quantity",
                    "food_id": hit["food_id"], "food_name": hit["food_name"],
                })
        elif decision == "confirm":
            clarifications.append({
                "kind": "confirm_match",
                "food_id": payload["food_id"], "food_name": payload["food_name"],
                "confidence": payload["confidence"],
                "raw_token": suggestion["token"],
                "alias_row": payload["alias_row"],
                "start": suggestion["start"], "end": suggestion["end"],
                "source_text": raw_text,
            })
        elif decision == "ambiguous":
            clarifications.append({
                "kind": "ambiguous_match",
                "options": [
                    {"food_id": m["food_id"], "food_name": m["food_name"], "alias_row": m["alias_row"]}
                    for m in payload
                ],
                "raw_token": suggestion["token"],
                "start": suggestion["start"], "end": suggestion["end"],
                "source_text": raw_text,
            })
        # "none" -> نتجاهل الكلمة بصمت، أفضل من اقتراح خاطئ بثقة منخفضة

    return {"resolved": final_resolved, "clarifications": clarifications}
