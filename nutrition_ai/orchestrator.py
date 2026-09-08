"""
Orchestrator — القلب اللي يجمع كل الطبقات (Intent Detector, Entity Extractor, Quantity Resolver,
Meal State Machine, Nutrition Calculator, Recommendation Engine, Tips Engine, Context Manager,
Response Generator) لبناء رد واحد. لا اتصال شبكة هنا، ولا أي رقم سعرات يُخترع — كل شيء يمر من
food_search.py/foods.sqlite عبر nutrition_ai/calculator.py.

هذا هو المكان اللي nutrition_engine.py (الواجهة الرقيقة) يستدعيه فعليًا.
"""
import json
import re

from arabic_normalize import normalize
import food_search
import iraq_time
from models import WeightHistory, Recipe, RecipeCategory

from nutrition_ai import (
    calculator, context, corrections, direct_log, entities, intents,
    meal_state, quantity, recipe_search, recommendations, responses, streaks, tips_engine,
    weight_ops, xp_engine,
)

# كلمات تصنيف تُمرَّر مباشرة لـrecipe_search بدل بحث نصي حر (قسم 4 بالخطة) — نفس عبارات
# intents.RECIPE_CATEGORY_PHRASES المركّبة عمدًا (تفادي تصادم مع تسجيل وجبة فعلي)
RECIPE_CATEGORY_KEYWORDS = {
    "حلو": "حلويات", "حلويات": "حلويات",
    "مشروب حار": "مشروبات حارة", "قهوة": "مشروبات حارة", "شاي": "مشروبات حارة",
    "مشروب بارد": "مشروبات باردة",
}


def _match_recipe_category_id(text_norm: str):
    if not any(p in text_norm for p in intents.RECIPE_CATEGORY_PHRASES):
        return None
    for keyword, category_name in RECIPE_CATEGORY_KEYWORDS.items():
        if keyword in text_norm:
            category = RecipeCategory.query.filter_by(name=category_name).first()
            if category:
                return category.id
    return None


MEAL_KEYWORDS = {
    "breakfast": ["فطرت", "فطور", "فطرة", "فطرنا"],
    "lunch": ["تغديت", "تغدينا", "غداء", "غدانا", "غدينا"],
    "dinner": ["عشيت", "عشينا", "عشاء", "تعشيت"],
    "snack": ["سناك", "سنك", "وجبة خفيفة"],
}
MEAL_TYPE_LABELS = responses.MEAL_TYPE_LABELS

# نيات لازم يكون فيها pending يشتغلون عليه — لو ماكو، نحاول نعيد فتح آخر DIRECT_LOG أول
REOPEN_INTENTS = frozenset({
    intents.CORRECTION, intents.CHANGE_QUANTITY, intents.REMOVE_FOOD,
    intents.SWAP_FOOD, intents.ADD_FOOD,
})


def _explicit_meal_type_keyword(text: str) -> str | None:
    for meal_type, keywords in MEAL_KEYWORDS.items():
        if any(k in text for k in keywords):
            return meal_type
    return None


def _find_meal_type(text: str) -> str:
    explicit = _explicit_meal_type_keyword(text)
    if explicit:
        return explicit
    period = iraq_time.get_current_period()
    return iraq_time.relevant_meal_for_period(period)


def _mark_meal_logged(user, meal_type, db, MealStatus):
    if meal_type not in ("breakfast", "lunch", "dinner"):
        return
    today = iraq_time.now_baghdad().date()
    row = MealStatus.query.filter_by(user_id=user.id, date=today, meal_type=meal_type).first()
    if not row:
        row = MealStatus(user_id=user.id, date=today, meal_type=meal_type)
        db.session.add(row)
    row.status = "logged"
    db.session.commit()


def compensation_message(remaining: int, target: int) -> str:
    if remaining >= 0 or not target:
        return ""
    ratio_over = -remaining / target
    return responses.compensation_note(mild=ratio_over <= 0.1)


def _notify_streak_milestones(user, streak_snapshot: dict) -> None:
    """Push حقيقي لأي محطة Streak جديدة تحققت — Best-effort دائمًا، فشل الإرسال (أو حتى غياب
    مفاتيح VAPID) ما يوقف ولا يؤخر تسجيل الوجبة/الماي أبدًا (نفس مبدأ فشل الإيميل)."""
    milestones = streak_snapshot.get("new_milestones", [])
    if not milestones:
        return
    try:
        from nutrition_ai.notifications import engine as notifications_engine
        for m in milestones:
            notifications_engine.send_notification(user, "STREAK", f"streak_{m['days']}", "/profile")
    except Exception:
        pass


def _add_resolved_to_pending(pending: dict, hit: dict):
    n = calculator.compute_food(hit["food_id"], hit["grams"])
    pending["items"].append({
        "food_id": hit["food_id"], "food_name": hit["food_name"],
        "grams": hit["grams"], "calories": n["calories"],
        "protein": n["protein"], "carbs": n["carbs"], "fat": n["fat"],
        "quantity": hit.get("quantity"), "unit_grams": hit.get("unit_grams"),
        "portion_name": hit.get("portion_name"),
    })


def _clarification_prompt(item: dict) -> str:
    kind = item.get("kind", "quantity")
    if kind == "confirm_match":
        return responses.clarify_confirm_match(item["food_name"])
    if kind == "ambiguous_match":
        a, b = item["options"][0]["food_name"], item["options"][1]["food_name"]
        return responses.clarify_ambiguous(a, b)
    # quantity
    portions = food_search.get_portions_for(item["food_id"])
    if not portions:
        return responses.clarify_quantity_no_portions(item["food_name"])
    lines = "\n".join(f"🍽️ {p['portion_name']}" for p in portions)
    return responses.clarify_quantity_with_portions(item["food_name"], lines)


def _summarize_pending(pending: dict) -> str:
    total = sum(item["calories"] for item in pending["items"])
    meal_label = MEAL_TYPE_LABELS[pending["meal_type"]]
    return (
        f"صار عندي لـ{meal_label}: {responses.items_inline(pending['items'])}\n"
        f"🔥 تقريباً {total} سعرة\n\n" + responses.meal_confirm_prompt(pending["meal_type"])
    )


def _resolve_clarification_item(item: dict, text_norm: str):
    """يرجّع hit(dict) لو انحسمت، 'REJECTED' لو انرفضت صراحة، أو None لو الرسالة ما جاوبت عليها."""
    kind = item.get("kind", "quantity")

    if kind == "quantity":
        res = food_search.resolve_quantity_for_food(item["food_id"], text_norm)
        if res.get("resolved"):
            return {
                "food_id": item["food_id"], "food_name": item["food_name"],
                "resolved": True, "grams": res["grams"], "portion_name": res.get("portion_name"),
            }
        return None

    if kind == "confirm_match":
        if text_norm in intents.CONFIRM_PHRASES:
            return food_search.resolve_alias_at(item["alias_row"], item["source_text"], item["start"], item["end"])
        if text_norm in intents.CANCEL_PHRASES:
            return "REJECTED"
        return None

    if kind == "ambiguous_match":
        norm_text = normalize(text_norm)
        for opt in item["options"]:
            if normalize(opt["food_name"]) in norm_text:
                return food_search.resolve_alias_at(opt["alias_row"], item["source_text"], item["start"], item["end"])
        stripped = norm_text.strip()
        if stripped in ("1", "الاول", "الأول"):
            opt = item["options"][0]
            return food_search.resolve_alias_at(opt["alias_row"], item["source_text"], item["start"], item["end"])
        if stripped in ("2", "الثاني", "الثانية"):
            opt = item["options"][1]
            return food_search.resolve_alias_at(opt["alias_row"], item["source_text"], item["start"], item["end"])
        return None

    return None


def _has_answerable_clarification(pending) -> bool:
    """صحيح لو أول توضيح معلّق هو تخمين ضبابي (confirm/ambiguous) — 'اي'/'لا' هنا تجاوب عليه هو،
    مو على تثبيت/إلغاء الوجبة كاملة."""
    if not pending or not pending.get("pending_clarifications"):
        return False
    return pending["pending_clarifications"][0].get("kind") in ("confirm_match", "ambiguous_match")


def _handle_meal_message(user, text_norm: str, pending, db, models, dbg) -> dict:
    """يعالج الرسالة سواء فيه وجبة قيد التوضيح/التعديل (pending) أو رسالة جديدة كليًا."""
    if pending:
        remaining_clarifications = []
        for item in pending["pending_clarifications"]:
            result = _resolve_clarification_item(item, text_norm)
            if result == "REJECTED":
                continue
            if result is not None:
                if result.get("resolved"):
                    _add_resolved_to_pending(pending, result)
                else:
                    remaining_clarifications.append({
                        "kind": "quantity", "food_id": result["food_id"], "food_name": result["food_name"],
                    })
            else:
                remaining_clarifications.append(item)
        pending["pending_clarifications"] = remaining_clarifications

        new_entities = entities.extract_food_entities(text_norm)
        existing_item_ids = {i["food_id"] for i in pending["items"]}
        # توضيح كمية معلّق لنفس الطعام يبقى كما هو (رسالة جديدة بدون كمية ما تفيد شي) —
        # لكن توضيح تخمين ضبابي (confirm/ambiguous) ينحل تلقائيًا لو الطعام انذكر صراحة وبثقة كاملة الآن
        quantity_clarification_ids = {
            c["food_id"] for c in pending["pending_clarifications"]
            if c.get("kind", "quantity") == "quantity"
        }

        def _clarification_food_ids(c):
            if c.get("kind") == "ambiguous_match":
                return {opt["food_id"] for opt in c["options"]}
            return {c["food_id"]} if "food_id" in c else set()

        for hit in new_entities["resolved"]:
            fid = hit["food_id"]
            if fid in existing_item_ids or fid in quantity_clarification_ids:
                continue
            pending["pending_clarifications"] = [
                c for c in pending["pending_clarifications"] if fid not in _clarification_food_ids(c)
            ]
            _add_resolved_to_pending(pending, hit)
            existing_item_ids.add(fid)

        pending_clarification_ids = {
            fid for c in pending["pending_clarifications"] for fid in _clarification_food_ids(c)
        }
        for clar in new_entities["clarifications"]:
            cids = _clarification_food_ids(clar)
            if cids and (cids & existing_item_ids or cids & pending_clarification_ids):
                continue
            pending["pending_clarifications"].append(clar)
            pending_clarification_ids |= cids

        meal_state.save_pending(user, db, pending)
        dbg["meal_state"] = meal_state.current_state(pending)

        if pending["pending_clarifications"]:
            return {"reply": _clarification_prompt(pending["pending_clarifications"][0]), "meal_logged": False}
        if pending["items"]:
            # وجبة تبني عبر أكثر من رسالة (أو أُعيد فتحها للتعديل) — تحتاج دائمًا تأكيد صريح جديد
            return {"reply": _summarize_pending(pending), "meal_logged": False}
        return {
            "reply": "ما قدرت أتعرف على أكلة واضحة برسالتك. جرب تكتب اسم الأكلة بالضبط.",
            "meal_logged": False,
        }

    # ---------------- رسالة جديدة كليًا (ما فيه pending ولا وجبة أُعيد فتحها) ----------------
    result = entities.extract_food_entities(text_norm)
    dbg["food_candidates"] = [
        {"food_name": h["food_name"], "confidence": h.get("confidence", 1.0)} for h in result["resolved"]
    ]
    if not result["resolved"] and not result["clarifications"]:
        return {
            "reply": "ما قدرت أتعرف على أكلة واضحة برسالتك. جرب تكتب اسم الأكلة بالضبط (مثلاً: \"تغديت دولمة\" أو \"فطرت بيضتين وخبز\").",
            "meal_logged": False,
        }

    meal_type = _find_meal_type(text_norm)

    if not result["clarifications"]:
        # رسالة واحدة، كل الأكل فيها محسوم بثقة عالية (مطابقة حرفية أو fuzzy ≥0.90) وبدون أي
        # سؤال توضيحي مطلوب -> DIRECT_LOG (تسجيل مباشر بدون انتظار "تمام"، مع نافذة تراجع قصيرة)
        return _try_direct_log(user, meal_type, text_norm, result["resolved"], db, models, dbg)

    new_pending = meal_state.new_pending(meal_type, text_norm)
    for hit in result["resolved"]:
        _add_resolved_to_pending(new_pending, hit)
    new_pending["pending_clarifications"] = result["clarifications"]
    meal_state.save_pending(user, db, new_pending)
    dbg["meal_state"] = meal_state.current_state(new_pending)
    return {"reply": _clarification_prompt(new_pending["pending_clarifications"][0]), "meal_logged": False}


def _finalize_meal(user, pending, db, models, dbg, source: str) -> dict:
    """
    نقطة الحقيقة الوحيدة لإنشاء MealLog — تُستدعى من مسارين فقط:
    source="confirmed" (تأكيد صريح بعد وجبة بُنيت عبر أكثر من رسالة أو أُعيد فتحها للتعديل)
    source="direct"    (رسالة واحدة واضحة تمامًا — DIRECT_LOG، يُبنى ويُحفظ Undo Snapshot).
    """
    MealLog = models["MealLog"]
    NutritionProfile = models["NutritionProfile"]
    ShownTip = models["ShownTip"]
    NutritionTip = models["NutritionTip"]
    WaterLog = models["WaterLog"]
    MealStatus = models["MealStatus"]

    was_free_meal = not user.is_premium
    if was_free_meal:
        # UPDATE Atomic بدل "اقرأ ثم اكتب" — يمنع تجاوز الحد الحقيقي تحت طلبات متزامنة
        # (مثلاً gunicorn -w 2)، ويبقى ضمن نفس الـTransaction لين db.session.commit() بالأسفل
        # فيتراجع تلقائيًا لو فشل أي جزء لاحق من هالدالة (Atomic Meal Consumption حقيقي).
        result = db.session.execute(
            db.text("UPDATE users SET free_meals_used = free_meals_used + 1 WHERE id = :uid AND free_meals_used < 6"),
            {"uid": user.id},
        )
        if result.rowcount == 0:
            db.session.rollback()
            if source == "confirmed":
                meal_state.save_pending(user, db, None)
            return {"reply": None, "meal_logged": False, "premium_required": True}
        user.free_meals_used += 1  # مزامنة الكائن بالذاكرة — الكتابة الحقيقية صارت أصلًا بالسطر فوق

    profile = NutritionProfile.query.get(user.id)
    target = profile.calorie_target if profile else 2000
    totals = calculator.totals_for_items(pending["items"])

    today = iraq_time.now_baghdad().date()
    status_row = MealStatus.query.filter_by(
        user_id=user.id, date=today, meal_type=pending["meal_type"]
    ).first()
    meal_status_before = status_row.status if status_row else None

    log = MealLog(
        user_id=user.id, meal_type=pending["meal_type"], raw_text=pending["raw_text"],
        matched_foods_json=json.dumps([i["food_name"] for i in pending["items"]], ensure_ascii=False),
        total_calories=totals["calories"], total_protein=totals["protein"],
        total_carbs=totals["carbs"], total_fat=totals["fat"], is_free_meal=was_free_meal,
    )
    db.session.add(log)
    db.session.flush()  # نحتاج log.id فورًا (direct-log يبني عليه Undo Snapshot)

    xp_awarded = 10
    xp_engine.award_xp(user, xp_awarded, reason="meal_logged", source=log.id)
    streak_snapshot = streaks.record_active_day(user)

    if source == "confirmed":
        meal_state.save_pending(user, db, None)
    _mark_meal_logged(user, pending["meal_type"], db, MealStatus)

    day_totals = calculator.today_totals(user, MealLog)
    remaining = target - day_totals["calories"]
    over_target = remaining < 0

    ctx = context.build(user, profile, MealLog, WaterLog)
    tip_category = tips_engine.choose_category_for_context(ctx, pending["meal_type"])
    tip_text = tips_engine.pick_tip(user.id, tip_category, db, ShownTip, NutritionTip)
    dbg["tip_selected"] = {"category": tip_category, "text": tip_text}
    dbg["context_used"] = ctx

    reply = (
        f"{responses.meal_logged(pending['meal_type'])} {responses.items_inline(pending['items'])}\n\n"
        f"🔥 تقريباً {totals['calories']} سعرة\n"
        f"باقيلك: {max(0, remaining)} سعرة اليوم 💪"
    )
    if getattr(user, "ai_response_style", "balanced") != "concise":
        if over_target:
            reply += compensation_message(remaining, target)
        elif tip_text:
            reply += f"\n\n🌱 {tip_text}"
    for milestone in streak_snapshot.get("new_milestones", []):
        reply += f"\n\n🔥 {milestone['label']}! +{milestone['xp_reward']} XP"
    _notify_streak_milestones(user, streak_snapshot)

    if source in ("direct", "recipe"):
        snapshot = direct_log.build_meal_snapshot(
            meal_log_id=log.id, meal_type=pending["meal_type"], raw_text=pending["raw_text"],
            items=pending["items"], xp_awarded=xp_awarded, was_free_meal=was_free_meal,
            streak_snapshot=streak_snapshot, meal_status_before=meal_status_before,
        )
        direct_log.save(user, db, snapshot)
        reply += f"\n\n{responses.direct_log_undo_hint()}"
        dbg["meal_state"] = meal_state.DIRECT_LOGGED
    else:
        dbg["meal_state"] = meal_state.CONFIRMED

    db.session.commit()

    return {
        "reply": reply, "meal_logged": True, "today_calories": day_totals["calories"],
        "target_calories": target, "remaining": remaining, "xp": user.xp,
        "free_meals_used": user.free_meals_used,
    }


def _try_direct_log(user, meal_type, raw_text, resolved_hits, db, models, dbg) -> dict:
    temp_pending = meal_state.new_pending(meal_type, raw_text)
    for hit in resolved_hits:
        _add_resolved_to_pending(temp_pending, hit)
    return _finalize_meal(user, temp_pending, db, models, dbg, source="direct")


def _confirm_pending(user, pending, db, models, dbg) -> dict:
    if pending["pending_clarifications"]:
        return {"reply": _clarification_prompt(pending["pending_clarifications"][0]), "meal_logged": False}
    return _finalize_meal(user, pending, db, models, dbg, source="confirmed")


def mark_recipe_awaiting_confirmation(user, db, recipe) -> str:
    """وصفة خلص طبخها (بالشات أو بصفحة /recipes) — ما تُحتسب سعراتها لين المستخدم يجاوب صراحة
    'أكلتها'. تُستدعى من فرع COOKING_STEP هنا، ومن recipes_bp.py:/recipes/<slug>/complete."""
    user.current_recipe_id = None
    user.current_recipe_step = 0
    user.pending_recipe_confirmation_id = recipe.id
    db.session.commit()
    return responses.recipe_finished_prompt()


def _finalize_recipe_meal(user, db, models, dbg) -> dict:
    """المستخدم أكّد 'أكلتها' لوصفة خلص طبخها — يمر عبر _finalize_meal نفسه (source='recipe')
    حتى يستفيد من نفس منطق XP/Streak/Undo، بدون أي تكرار كود. لا يمنع التسجيل أبدًا بسبب
    تجاوز الهدف — المنع يخص بدء وصفة جديدة فقط (recipes_bp.py:/start)، مو تسجيل حقيقة وقعت."""
    recipe = Recipe.query.get(user.pending_recipe_confirmation_id)
    user.pending_recipe_confirmation_id = None
    if not recipe:
        db.session.commit()
        return {"reply": "ماكو وصفة بانتظار التأكيد هسه 🙂", "meal_logged": False}

    pending = meal_state.new_pending(_find_meal_type(""), recipe.name)
    pending["items"].append({
        "food_id": None, "food_name": recipe.name,
        "calories": recipe.calories, "protein": recipe.protein,
        "carbs": recipe.carbs, "fat": recipe.fat,
    })
    return _finalize_meal(user, pending, db, models, dbg, source="recipe")


def _handle_greeting(user) -> dict:
    """تحية Context-aware — تفرق بين مستخدم نشط اليوم ومستخدم راجع بعد غياب، بدون تكرار نفس
    الجملة، وبدون أي لوم على الغياب."""
    absence = streaks.days_absent(user)
    if absence >= 7:
        reply = responses.return_greeting("long")
    elif absence >= 3:
        reply = responses.return_greeting("medium")
    elif absence >= 1:
        reply = responses.return_greeting("short")
    else:
        reply = responses.greeting()
        if user.streak_days > 1:
            reply += f"\n{responses.streak_continues_note(user.streak_days)}"
    return {"reply": reply, "meal_logged": False}


def _handle_express_desire(user, text_norm, db, models, dbg) -> dict:
    """'أريد بيض'، 'يمكن آكل تمن'، 'أفكر آكل بيتزا' — رغبة/احتمال، مو استهلاك فعلي. ما يسجّل شي أبدًا."""
    result = entities.extract_food_entities(text_norm)
    if result["resolved"] or result["clarifications"]:
        return {"reply": responses.desire_ack(has_food=True), "meal_logged": False}

    meal_type = _explicit_meal_type_keyword(text_norm)
    if meal_type:
        NutritionProfile = models["NutritionProfile"]
        MealLog = models["MealLog"]
        WaterLog = models.get("WaterLog")
        profile = NutritionProfile.query.get(user.id)
        ctx = context.build(user, profile, MealLog, WaterLog)
        macro_targets = ctx.get("macro_targets") or {}
        protein_needed = max(0, (macro_targets.get("protein_g") or 0) - ctx["consumed_protein"])
        return {"reply": recommendations.suggest_meal_within(ctx["remaining_calories"], protein_needed), "meal_logged": False}

    return {"reply": responses.desire_ack(has_food=False), "meal_logged": False}


def _asked_macro(text_norm: str):
    """يحدد إذا سؤال 'شكد باقيلي' يقصد ماكرو محدد (بروتين/كارب/دهون) بدل السعرات العامة —
    يرجع None لو ماكو ذكر صريح، فيبقى الجواب الافتراضي بالسعرات كما كان."""
    if any(w in text_norm for w in intents.PROTEIN_WORDS):
        return "protein"
    if any(w in text_norm for w in intents.CARB_WORDS):
        return "carb"
    if any(w in text_norm for w in intents.FAT_WORDS):
        return "fat"
    return None


def _general_nutrition_topic(text_norm: str) -> str:
    """يحدد أي موضوع تغذية عام يقصده السؤال، بترتيب أولوية يمنع تصادم كلمة عامة (بروتين) مع
    موضوع أدق (قبل/بعد التمرين) لو الاثنين مذكورين بنفس الرسالة."""
    if "قبل التمرين" in text_norm:
        return "pre_workout"
    if "بعد التمرين" in text_norm:
        return "post_workout"
    if "توقيت الوجبات" in text_norm:
        return "meal_timing"
    if "مشروبات غازية" in text_norm:
        return "sugary_drinks"
    if "فاست فود" in text_norm:
        return "fast_food"
    if "حلويات" in text_norm:
        return "desserts"
    if any(w in text_norm for w in intents.PROTEIN_WORDS):
        return "protein"
    if any(w in text_norm for w in intents.CARB_WORDS):
        return "carb"
    if any(w in text_norm for w in intents.FAT_WORDS):
        return "fat"
    if any(w in text_norm for w in intents.FIBER_WORDS):
        return "fiber"
    return "generic"


def _extract_first_food(text_norm: str):
    """يرجّع (food_id, food_name) لأول طعام يذكره النص، من resolved أو من clarifications (كمية
    غير محددة بعد) — يستخدمها كل من EXPRESS_CRAVING/PLAN_TO_EAT/ASK_PORTION_FOR_FOOD، ما تسجل
    ولا تحسب شي بنفسها."""
    result = entities.extract_food_entities(text_norm)
    if result["resolved"]:
        item = result["resolved"][0]
        return item["food_id"], item["food_name"]
    for c in result["clarifications"]:
        if c.get("food_id"):
            return c["food_id"], c["food_name"]
    return None, None


def _handle_food_topic(user, text_norm, db, models, dbg, kind: str) -> dict:
    """'مشتهي دولمة' (kind='craving') أو 'راح آكل دولمة'/'ناوي آكل دولمة' (kind='plan') — نية أو
    رغبة فقط، مو استهلاك فعلي، ما يسجّل شي أبدًا (يفرق جوهري عن 'اكلت دولمة'). يخزّن الطعام
    كموضوع قصير المدى (User.pending_food_topic_json) حتى رد لاحق قصير متل 'شكد آكل؟' يعرف عن
    أي طعام يتكلم بدون إعادة ذكر اسمه."""
    food_id, food_name = _extract_first_food(text_norm)
    if food_id is None:
        user.pending_food_topic_json = None
        db.session.commit()
        return {"reply": responses.craving_ack(None) if kind == "craving" else responses.plan_ack(None), "meal_logged": False}

    user.pending_food_topic_json = json.dumps({"food_id": food_id, "food_name": food_name, "kind": kind})
    db.session.commit()
    ack = responses.craving_ack(food_name) if kind == "craving" else responses.plan_ack(food_name)
    return {"reply": ack, "meal_logged": False}


def _handle_portion_for_food(user, text_norm, db, models, dbg) -> dict:
    """'شكد آكل من الدولمة؟' أو 'شكد آكل؟' وحدها بعد اشتهاء/نية سابقة — توصية كمية حقيقية لطعام
    محدد بالاسم (من food_search.py/calculator.py الحقيقيين، صفر اختراع أرقام). سؤال استشاري
    بحت، ما يسجّل أي شي — التسجيل الفعلي يصير فقط بـ'اكلت X' صريحة لاحقًا."""
    food_id, food_name = _extract_first_food(text_norm)
    if food_id is None and user.pending_food_topic_json:
        topic = json.loads(user.pending_food_topic_json)
        food_id, food_name = topic.get("food_id"), topic.get("food_name")

    if food_id is None:
        return {"reply": responses.no_food_in_topic_prompt(), "meal_logged": False}

    NutritionProfile = models["NutritionProfile"]
    MealLog = models["MealLog"]
    WaterLog = models.get("WaterLog")
    profile = NutritionProfile.query.get(user.id)
    ctx = context.build(user, profile, MealLog, WaterLog)

    reply = recommendations.suggest_portion_for_food(food_id, food_name, ctx["remaining_calories"])
    user.pending_food_topic_json = json.dumps({"food_id": food_id, "food_name": food_name, "kind": "portion_given"})
    db.session.commit()
    return {"reply": reply, "meal_logged": False}


def _handle_water_log(user, text_norm, db, WaterLog) -> dict:
    ml = quantity.parse_water_ml(text_norm)
    if ml is None:
        return {
            "reply": "شكد تقريباً شربت؟ 🥤 (مثلاً: كوب، نص لتر، أو 500 مل)",
            "meal_logged": False,
        }

    log = WaterLog(user_id=user.id, ml=int(ml))
    db.session.add(log)
    db.session.flush()
    streak_snapshot = streaks.record_active_day(user)
    db.session.commit()

    snapshot = direct_log.build_water_snapshot(log.id, int(ml), streak_snapshot)
    direct_log.save(user, db, snapshot)

    total = calculator.today_water_ml(user, WaterLog)
    reply = f"{responses.water_logged(int(ml))}\nمجموع اليوم: {total} مل 💧\n\n{responses.direct_log_undo_hint()}"
    for milestone in streak_snapshot.get("new_milestones", []):
        reply += f"\n\n🔥 {milestone['label']}! +{milestone['xp_reward']} XP"
    _notify_streak_milestones(user, streak_snapshot)
    return {"reply": reply, "meal_logged": False}


def _handle_weight_update(user, text_norm, db, NutritionProfile) -> dict:
    new_weight = quantity.find_leading_number(text_norm)
    if new_weight is None or not (30 <= new_weight <= 300):
        return {"reply": "شكد وزنك الجديد بالضبط؟ اكتبلي رقم بالكيلوغرام (مثلاً: وزني هسه 80).", "meal_logged": False}

    result = weight_ops.apply_weight_update(user, new_weight, db, NutritionProfile, WeightHistory)
    if result is None:
        return {"reply": "لازم تكمل بياناتك الأساسية أول مرة قبل ما أگدر أحدّث وزنك.", "meal_logged": False}

    reply = responses.weight_updated(new_weight, result["calorie_target"])
    if result.get("safety_warning"):
        reply += f"\n\n⚠️ {result['safety_warning']}"
    return {"reply": reply, "meal_logged": False, "target_calories": result["calorie_target"]}


def handle_message(user, text: str, db, models, debug: bool = False) -> dict:
    NutritionProfile = models["NutritionProfile"]

    text_norm = text.strip()
    profile = NutritionProfile.query.get(user.id)
    target = profile.calorie_target if profile else 2000

    pending = meal_state.load_pending(user)
    undo_snapshot = direct_log.load_valid(user, db)
    ctx_flags = {
        "has_pending": bool(pending),
        "has_recipe": bool(user.current_recipe_id),
        "has_undoable_log": bool(undo_snapshot),
        "has_pending_recipe": bool(user.pending_recipe_confirmation_id),
        "has_pending_food_topic": bool(user.pending_food_topic_json),
    }
    intent = intents.detect_intent(text_norm, ctx_flags)

    dbg = {"intent": intent} if debug else {}

    result = _dispatch(user, text_norm, intent, pending, target, db, models, dbg)

    if debug:
        result["debug"] = dbg
    return result


def _dispatch(user, text_norm, intent, pending, target, db, models, dbg) -> dict:
    MealLog = models["MealLog"]
    NutritionProfile = models["NutritionProfile"]
    WaterLog = models.get("WaterLog")

    if intent in REOPEN_INTENTS and pending is None:
        reopened = direct_log.reopen_meal_for_edit(user, db, models)
        if reopened is not None:
            pending = reopened
            dbg["meal_state"] = "REOPENED_FOR_EDIT"
        elif intent != intents.ADD_FOOD:
            return {
                "reply": "خلص وكت التعديل على آخر وجبة، خبرني شنو أكلت وأبدأ وجبة جديدة.",
                "meal_logged": False,
            }
        # ADD_FOOD بدون pending ولا وجبة قابلة لإعادة الفتح -> يبدأ وجبة جديدة (يمر تحت بدون تغيير)

    if intent == intents.OFFTOPIC:
        return {"reply": "أنا مخصص لمساعدتك بالأكل واللياقة والتغذية داخل CJ WORKOUT 💪، ما أكدر أساعد بطلبات ثانية.", "meal_logged": False}

    if intent == intents.MEDICAL:
        return {"reply": "هذا سؤال يحتاج رأي مختص طبي، أنا ما أقدر أشخص أو أنصح بعلاج. تواصل مع دكتور أو مختص تغذية لهذا الموضوع 🙏", "meal_logged": False}

    if intent == intents.NOT_YET:
        if user.pending_recipe_confirmation_id:
            return {"reply": responses.recipe_not_yet_ack(), "meal_logged": False}
        return {"reply": "تمام، خبرني لما تاكل 🌱 أو گلي شنو تشتهي وأقترحلك شي مناسب لسعراتك المتبقية.", "meal_logged": False}

    if intent == intents.EXPRESS_DESIRE:
        return _handle_express_desire(user, text_norm, db, models, dbg)

    if intent == intents.EXPRESS_CRAVING:
        return _handle_food_topic(user, text_norm, db, models, dbg, kind="craving")

    if intent == intents.PLAN_TO_EAT:
        return _handle_food_topic(user, text_norm, db, models, dbg, kind="plan")

    if intent == intents.ASK_PORTION_FOR_FOOD:
        return _handle_portion_for_food(user, text_norm, db, models, dbg)

    if intent == intents.GREETING:
        return _handle_greeting(user)

    if intent == intents.FAREWELL:
        return {"reply": responses.farewell(), "meal_logged": False}

    if intent == intents.THANKS:
        return {"reply": responses.thanks_ack(), "meal_logged": False}

    if intent == intents.ACKNOWLEDGEMENT:
        return {"reply": responses.acknowledgement(), "meal_logged": False}

    if intent == intents.CANCEL:
        if _has_answerable_clarification(pending):
            return _handle_meal_message(user, text_norm, pending, db, models, dbg)
        if pending:
            meal_state.save_pending(user, db, None)
            return {"reply": "تمام، ألغيتها. خبرني شنو أكلت فعليًا.", "meal_logged": False}
        if user.pending_recipe_confirmation_id:
            user.pending_recipe_confirmation_id = None
            db.session.commit()
            return {"reply": responses.recipe_declined_ack(), "meal_logged": False}
        if user.pending_food_topic_json:
            user.pending_food_topic_json = None
            db.session.commit()
            return {"reply": responses.food_topic_cancel_ack(), "meal_logged": False}
        return direct_log.undo(user, db, models)

    if intent == intents.CONFIRM:
        if _has_answerable_clarification(pending):
            return _handle_meal_message(user, text_norm, pending, db, models, dbg)
        if pending:
            return _confirm_pending(user, pending, db, models, dbg)
        if user.pending_recipe_confirmation_id:
            return _finalize_recipe_meal(user, db, models, dbg)
        if user.pending_food_topic_json:
            return _handle_portion_for_food(user, text_norm, db, models, dbg)
        return {"reply": "ماكو شي بانتظار التأكيد هسه 🙂", "meal_logged": False}

    if intent == intents.CORRECTION:
        if quantity.find_leading_number(text_norm) is not None:
            ok, msg = corrections.change_last_quantity(pending, text_norm)
            if ok:
                meal_state.save_pending(user, db, pending)
                msg += "\n\n" + _summarize_pending(pending)
            return {"reply": msg, "meal_logged": False}
        return {"reply": "وضحلي شنو تريد تصحح بالضبط.", "meal_logged": False}

    if intent == intents.CHANGE_QUANTITY:
        ok, msg = corrections.change_last_quantity(pending, text_norm)
        if ok:
            meal_state.save_pending(user, db, pending)
            msg += "\n\n" + _summarize_pending(pending)
        return {"reply": msg, "meal_logged": False}

    if intent == intents.REMOVE_FOOD:
        ok, msg = corrections.remove_food(pending, text_norm)
        if ok:
            meal_state.save_pending(user, db, pending)
            if pending["items"]:
                msg += "\n\n" + _summarize_pending(pending)
        return {"reply": msg, "meal_logged": False}

    if intent == intents.SWAP_FOOD:
        ok, _item, msg = corrections.swap_food(pending, text_norm)
        if ok:
            meal_state.save_pending(user, db, pending)
        return {"reply": msg, "meal_logged": False}

    if intent == intents.WATER_LOG and WaterLog is not None:
        return _handle_water_log(user, text_norm, db, WaterLog)

    if intent == intents.WEIGHT_UPDATE:
        return _handle_weight_update(user, text_norm, db, NutritionProfile)

    if intent == intents.ASK_TIP:
        NutritionTip = models["NutritionTip"]
        ShownTip = models["ShownTip"]
        profile = NutritionProfile.query.get(user.id)
        ctx = context.build(user, profile, MealLog, WaterLog)
        category = tips_engine.choose_category_for_context(ctx)
        tip_text = tips_engine.pick_tip(user.id, category, db, ShownTip, NutritionTip)
        dbg["tip_selected"] = {"category": category, "text": tip_text}
        return {"reply": tip_text or "ما عندي نصيحة جديدة هسه، جرب لاحقًا 🌱", "meal_logged": False}

    if intent == intents.END_DAY:
        day_totals = calculator.today_totals(user, MealLog)
        water_ml = calculator.today_water_ml(user, WaterLog) if WaterLog is not None else 0
        remaining = target - day_totals["calories"]
        summary = (
            f"ملخص يومك 📋\n🔥 السعرات: {day_totals['calories']} / {target} kcal\n"
            f"🍗 بروتين: {round(day_totals['protein'])}غ | 🍞 كارب: {round(day_totals['carbs'])}غ | 🥑 دهون: {round(day_totals['fat'])}غ\n"
            f"💧 الماي: {water_ml} مل\n"
            f"🍽️ عدد الوجبات المسجلة: {len(day_totals['logs'])}\n⭐ XP الحالي: {user.xp}\n"
        )
        summary += compensation_message(remaining, target) or "\n\nبطل 🔥 اليوم كان مرتب جدًا. استمر، يوم وراء يوم راح تشوف الفرق."
        return {"reply": summary, "meal_logged": False}

    if intent == intents.ASK_REMAINING:
        macro = _asked_macro(text_norm)
        if macro:
            profile = NutritionProfile.query.get(user.id)
            ctx = context.build(user, profile, MealLog, WaterLog)
            macro_targets = ctx.get("macro_targets") or {}
            consumed_key, target_key, label = {
                "protein": ("consumed_protein", "protein_g", "بروتين"),
                "carb": ("consumed_carbs", "carbs_g", "كارب"),
                "fat": ("consumed_fat", "fat_g", "دهون"),
            }[macro]
            target_grams = macro_targets.get(target_key) or 0
            remaining_grams = target_grams - ctx.get(consumed_key, 0)
            return {"reply": responses.remaining_macro(label, remaining_grams, target_grams), "meal_logged": False}

        day_totals = calculator.today_totals(user, MealLog)
        remaining = target - day_totals["calories"]
        if remaining >= 0:
            return {"reply": f"باقيلك تقريبًا {remaining} سعرة من أصل {target} kcal اليوم. تحب أقترحلك وجبة ضمنها؟", "meal_logged": False}
        return {"reply": f"تجاوزت هدفك اليوم بـ {abs(remaining)} سعرة تقريبًا." + compensation_message(remaining, target), "meal_logged": False}

    if intent == intents.GENERAL_NUTRITION:
        return {"reply": responses.general_nutrition_answer(_general_nutrition_topic(text_norm)), "meal_logged": False}

    if intent == intents.ASK_CALORIE_TARGET_MEAL:
        m = re.search(r"(\d+)", text_norm)
        if m:
            return {"reply": recommendations.suggest_meal_near_target(int(m.group(1))), "meal_logged": False}
        return {"reply": "شكد سعرة تريد تكون الوجبة تقريبًا؟ اكتبلي رقم.", "meal_logged": False}

    if intent == intents.ASK_RECOMMENDATION:
        profile = NutritionProfile.query.get(user.id)
        ctx = context.build(user, profile, MealLog, WaterLog)
        macro_targets = ctx.get("macro_targets") or {}
        protein_needed = max(0, (macro_targets.get("protein_g") or 0) - ctx["consumed_protein"])
        reply = recommendations.suggest_meal_within(ctx["remaining_calories"], protein_needed)
        matching_recipes = recipe_search.suggest_recipes_within(ctx["remaining_calories"])
        if matching_recipes:
            lines = "\n".join(f"🍳 {r.name} (~{r.calories} kcal) — /recipes/{r.slug}" for r in matching_recipes)
            reply += f"\n\nأو جرب وصفة جاهزة عندنا:\n{lines}"
        return {"reply": reply, "meal_logged": False}

    has_recipe = bool(user.current_recipe_id)
    if intent == intents.COOKING_STEP and has_recipe:
        recipe = Recipe.query.get(user.current_recipe_id)
        if recipe:
            if any(t in text_norm for t in intents.MISSING_INGREDIENT_TRIGGERS):
                for sub in recipe.substitutions:
                    if sub.ingredient_name in text_norm:
                        return {"reply": sub.replacement, "meal_logged": False}
                return {"reply": "ما عندي بديل مسجّل لهذا المكوّن بقاعدة بياناتي الحالية، جرب تحذفه إذا مو أساسي بالوصفة.", "meal_logged": False}

            steps = sorted(recipe.steps, key=lambda s: s.step_number)
            step_idx = user.current_recipe_step
            if step_idx >= len(steps):
                prompt = mark_recipe_awaiting_confirmation(user, db, recipe)
                return {"reply": prompt, "meal_logged": False}
            step = steps[step_idx]
            user.current_recipe_step = step_idx + 1
            db.session.commit()
            step_text = f"الخطوة {step_idx + 1}/{len(steps)}: {step.instruction}"
            extras = []
            if step.duration:
                extras.append(f"⏱️ {step.duration}")
            if step.temperature:
                extras.append(f"🌡️ {step.temperature}")
            if extras:
                step_text += "\n" + " · ".join(extras)
            if step.tip:
                step_text += f"\n💡 {step.tip}"
            if step.warning:
                step_text += f"\n⚠️ {step.warning}"
            return {"reply": step_text, "meal_logged": False}

    if intent == intents.ASK_RECIPE:
        category_id = _match_recipe_category_id(text_norm)
        if category_id:
            results = recipe_search.search_recipes(category_id=category_id)
        else:
            results = recipe_search.search_recipes(query=text_norm)
        recipe = results[0] if results else None
        if recipe:
            user.current_recipe_id = recipe.id
            user.current_recipe_step = 0
            db.session.commit()
            ingredients_list = "\n".join(
                f"- {i.name}" + (f" ({i.quantity} {i.unit})" if i.quantity and i.unit else (f" ({i.unit})" if i.unit else ""))
                for i in recipe.ingredients
            )
            reply = (
                f"🍳 {recipe.name}\n\nالسعرات التقريبية: {recipe.calories} kcal | بروتين {recipe.protein}غ | "
                f"كارب {recipe.carbs}غ | دهون {recipe.fat}غ\n\nالمكونات:\n{ingredients_list}\n\n"
                f"اكتب \"هسه شنو أسوي\" لنبدأ خطوة بخطوة 👨‍🍳\nأو شوف الوصفة كاملة: /recipes/{recipe.slug}"
            )
            return {"reply": reply, "meal_logged": False}
        return {"reply": "ما لقيت وصفة مناسبة بقاعدة بياناتي الحالية لهذا الطلب، جرب تذكر مكونات ثانية أو اسم أكلة معروفة، أو تصفح كل الوصفات بصفحة /recipes.", "meal_logged": False}

    # LOG_MEAL / ADD_FOOD / أي نية ثانية غير معروفة -> نحاول نطابقها كأكل
    return _handle_meal_message(user, text_norm, pending, db, models, dbg)
