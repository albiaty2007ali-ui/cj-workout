"""
Corrections & Food Swap — يفهم "لا خليها 3"، "شيل الجبن"، "بدل البيبسي بببسي دايت"
ويحدّث الوجبة الحالية (pending) بدلاً من إنشاء وجبة جديدة. لا يخترع كمية أو سعرات —
كل رقم يمر من food_search.compute_nutrition/quantity.py فقط.
"""
import food_search
from nutrition_ai import calculator, entities, quantity


def _recompute_item_nutrition(item: dict) -> None:
    n = calculator.compute_food(item["food_id"], item["grams"])
    item["calories"], item["protein"], item["carbs"], item["fat"] = (
        n["calories"], n["protein"], n["carbs"], n["fat"],
    )


def change_last_quantity(pending: dict, text_norm: str):
    """'لا خليها 3' — يغيّر كمية آخر عنصر مضاف بالوجبة الحالية."""
    if not pending.get("items"):
        return False, "ما عندي أكل بهذي الوجبة أعدل كميته هسه."

    number = quantity.find_leading_number(text_norm)
    if number is None:
        return False, "شكد تريد تخليها بالضبط؟ اكتبلي رقم."

    item = pending["items"][-1]
    if item.get("unit_grams"):
        item["grams"] = item["unit_grams"] * number
        item["quantity"] = number
    else:
        item["grams"] = number if number >= 10 else item["grams"]

    _recompute_item_nutrition(item)
    return True, f"تمام، خليتها {item['food_name']}: {item['calories']} سعرة."


def remove_food(pending: dict, text_norm: str):
    """'شيل الجبن' — يحذف عنصر من الوجبة الحالية إذا انذكر اسمه بالرسالة."""
    if not pending.get("items"):
        return False, "ما عندي أكل بهذي الوجبة أشيل منه شي."

    mentioned, _spans, _t = food_search.match_message_with_meta(text_norm)
    mentioned_ids = {m["food_id"] for m in mentioned}

    removed = [i for i in pending["items"] if i["food_id"] in mentioned_ids]
    if not removed:
        return False, "ما لقيت هذا الأكل بالوجبة الحالية حتى أشيله."

    pending["items"] = [i for i in pending["items"] if i["food_id"] not in mentioned_ids]
    names = "، ".join(r["food_name"] for r in removed)
    return True, f"تمام، شلت {names} من الوجبة."


def swap_food(pending: dict, text_norm: str):
    """
    'بدل البيبسي بببسي دايت' — يستبدل عنصر موجود بالوجبة بأكلة ثانية مذكورة بنفس الرسالة،
    وياخذ نفس كمية العنصر القديم (نفس مبدأ 'نفس الحصة، أكلة مختلفة') بدون افتراض رقم جديد.
    """
    if not pending.get("items"):
        return False, None, "ما عندي وجبة أبدّل بيها أكل هسه."

    mentioned = entities.extract_food_entities(text_norm)["resolved"]
    existing_ids = {i["food_id"] for i in pending["items"]}

    old_match = next((m for m in mentioned if m["food_id"] in existing_ids), None)
    new_match = next((m for m in mentioned if m["food_id"] not in existing_ids), None)

    if not old_match:
        return False, None, "ما فهمت شنو تريد تبدل بالضبط. جرب: \"بدل X بـ Y\"."
    if not new_match:
        old_item = next(i for i in pending["items"] if i["food_id"] == old_match["food_id"])
        return False, None, f"تريد تبدل {old_item['food_name']} بشنو بالضبط؟"

    old_item = next(i for i in pending["items"] if i["food_id"] == old_match["food_id"])
    before_calories = old_item["calories"]

    new_grams = new_match.get("grams") or old_item["grams"]
    n = calculator.compute_food(new_match["food_id"], new_grams)

    old_name = old_item["food_name"]
    old_item.update({
        "food_id": new_match["food_id"], "food_name": new_match["food_name"],
        "grams": new_grams, "calories": n["calories"], "protein": n["protein"],
        "carbs": n["carbs"], "fat": n["fat"],
    })
    old_item.pop("unit_grams", None)
    old_item.pop("quantity", None)

    diff = n["calories"] - before_calories
    sign = "+" if diff >= 0 else ""
    message = (
        f"قبل: {old_name} = {before_calories} kcal\n"
        f"بعد: {new_match['food_name']} = {n['calories']} kcal\n"
        f"الفرق: {sign}{diff} kcal\n\nأثبت التغيير؟"
    )
    return True, old_item, message
