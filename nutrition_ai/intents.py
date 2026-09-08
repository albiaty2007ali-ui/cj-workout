"""
Intent Detector — يحدد نية المستخدم قبل أي رد، بقواعد/كلمات مفتاحية عراقية (لا LLM هنا).
كل نية Constant نصّي بسيط (مو Enum) حتى يرجع بسهولة بحقل debug بدون تحويل إضافي.
"""

LOG_MEAL = "LOG_MEAL"
ADD_FOOD = "ADD_FOOD"
REMOVE_FOOD = "REMOVE_FOOD"
CHANGE_QUANTITY = "CHANGE_QUANTITY"
SWAP_FOOD = "SWAP_FOOD"
ASK_REMAINING = "ASK_REMAINING"
ASK_RECOMMENDATION = "ASK_RECOMMENDATION"
ASK_CALORIE_TARGET_MEAL = "ASK_CALORIE_TARGET_MEAL"
ASK_RECIPE = "ASK_RECIPE"
COOKING_STEP = "COOKING_STEP"
WATER_LOG = "WATER_LOG"
WEIGHT_UPDATE = "WEIGHT_UPDATE"
END_DAY = "END_DAY"
ASK_TIP = "ASK_TIP"
GENERAL_NUTRITION = "GENERAL_NUTRITION"
CONFIRM = "CONFIRM"
CANCEL = "CANCEL"
CORRECTION = "CORRECTION"
OFFTOPIC = "OFFTOPIC"
MEDICAL = "MEDICAL"
NOT_YET = "NOT_YET"
EXPRESS_DESIRE = "EXPRESS_DESIRE"
EXPRESS_CRAVING = "EXPRESS_CRAVING"
PLAN_TO_EAT = "PLAN_TO_EAT"
ASK_PORTION_FOR_FOOD = "ASK_PORTION_FOR_FOOD"
GREETING = "GREETING"
FAREWELL = "FAREWELL"
THANKS = "THANKS"
ACKNOWLEDGEMENT = "ACKNOWLEDGEMENT"
UNKNOWN = "UNKNOWN"

# ---------------- قوائم الكلمات المفتاحية (عراقي/لهجة) ----------------

OFFTOPIC_KEYWORDS = ["كود", "برمجة", "python", "javascript", "اكتبلي برنامج", "سكربت"]
MEDICAL_KEYWORDS = ["دواء", "مرض", "تشخيص", "أعاني من", "وجع", "الم مزمن", "دكتور شنو"]

END_DAY_PHRASES = ["راح أنام", "راح انام", "خلص يومي", "بنام", "أنام هسه", "انام هسه"]
REMAINING_QUERY_PHRASES = ["باقيلي", "شكد باقي", "كم باقي", "شكد متبقي", "الباقي شكد"]
SUGGEST_QUERY_PHRASES = [
    "شنو آكل", "شنو اكل", "اقترح", "شنو أطبخ", "شنو اطبخ", "رتبلي",
    "تقترح", "تنصحني", "تنصح", "شنو مناسب الي", "شنو مناسب إلي", "اقترحلي",
    "اختارلي شي آكله", "اختارلي شي اكله", "عندك اقتراح", "شنو تنصحني",
]
CALORIE_TARGET_MEAL_PHRASES = ["اريد وجبة", "أريد وجبة", "وجبة بحدود", "وجبة تكون"]
COOKING_START_PHRASES = ["هسه شنو أسوي", "هسه شنو اسوي", "وين أبدأ", "خلينا نطبخ", "علمني أسويها", "علمني اسويها", "ابدأ الطبخ"]
COOKING_NEXT_PHRASES = ["بعد شنو", "شنو بعدين", "الخطوة الجاية", "وبعدين"]
MISSING_INGREDIENT_TRIGGERS = ["ما عندي", "ماعندي", "ماكو عندي"]
RECIPE_TRIGGERS = ["خلي نطبخ", "وصفة", "خلينا نطبخ"]
# طلب تصنيف وصفات محدد — عبارات مركّبة عمدًا (مو كلمات مفردة متل "شاي"/"قهوة") حتى ما تتصادم
# مع تسجيل وجبة فعلي بنفس الكلمة (مثلاً "اكلت شاي" لازم تبقى LOG_MEAL، مو طلب وصفة)
RECIPE_CATEGORY_PHRASES = [
    "حلو دايت", "حلويات دايت", "أريد حلو", "اريد حلو", "ابي حلو", "أبي حلو",
    "أريد مشروب بارد", "اريد مشروب بارد", "أريد مشروب حار", "اريد مشروب حار",
    "أريد قهوة دايت", "اريد قهوة دايت", "أريد شاي دايت", "اريد شاي دايت",
    "وصفة حلويات", "وصفة مشروب بارد", "وصفة مشروب حار", "وصفة قهوة", "وصفة شاي",
]
NOT_YET_PHRASES = ["بعدني", "لسا", "بعد ما اكلت", "لا بعد", "مو هسه"]

# جواب "أكلت الوصفة فعلًا؟" — تُفحص فقط لما فيه pending_recipe_confirmation (has_pending_recipe بالـctx)،
# ما تصير مرادف عام لـCONFIRM بأي سياق ثاني حتى ما تتصادم مع أي معنى آخر لـ"أكلتها"
RECIPE_EATEN_PHRASES = ["اكلتها", "أكلتها", "اي اكلتها", "إي اكلتها", "اي، أكلتها", "إي، أكلتها", "اي أكلتها"]

CONFIRM_PHRASES = ["اي", "ايه", "اوك", "اوكي", "تمام", "نعم", "ثبتها", "ثبت", "اثبتها", "صح", "أكد"]
CANCEL_PHRASES = ["لا", "الغي", "الغيها", "مو صحيح", "خطأ بالكل", "cancel", "ماريد", "ما اريد", "ما أريد"]
# عبارات تراجع عن آخر تسجيل مباشر (DIRECT_LOG) — أوسع من CANCEL_PHRASES ومطابقة تامة فقط
# (حتى "شيل الصمونة" ما ينحسب تراجع كامل، يبقى REMOVE_FOOD على الوجبة المُعاد فتحها)
UNDO_PHRASES = CANCEL_PHRASES + ["الغيه", "شيلها", "نسيتها", "ما أكلتها", "ما اكلتها"]

ADD_FOOD_PHRASES = ["زيدلي", "زيد", "ضيفلي", "ضيف", "اضيف", "أضيف", "كمان اكلت", "نسيت أضيف", "نسيت اضيف"]
REMOVE_FOOD_PHRASES = ["شيل", "احذف", "إحذف", "شيلها", "الغي منها"]
CHANGE_QUANTITY_PHRASES = ["خليها", "خله", "غيّر العدد", "غير العدد", "خلي الكمية"]
SWAP_FOOD_PHRASES = ["بدل ", "بدّل ", "استبدل", "غيّر لـ", "غير ل"]
CORRECTION_PHRASES = ["لا مو", "لا، مو", "غلط", "خطأ", "مو هيچي", "مو هيك"]

PROTEIN_WORDS = ["بروتين"]
CARB_WORDS = ["كارب", "كاربوهيدرات", "نشويات", "نشا"]
FAT_WORDS = ["دهون", "دهن"]
FIBER_WORDS = ["ألياف", "الياف"]

# سؤال معلوماتي عام عن التغذية ("شنو فايدة البروتين؟"، "الكارب مضر؟") — يفرق جوهري عن سؤال
# "شكد باقيلي" (ASK_REMAINING، مفحوص قبل هذا بأسطر) أو محاولة تسجيل وجبة فيها اسم عنصر غذائي
# صدفة. الشرط المركّب (علامة سؤال + كلمة موضوع) يمنع أي تصادم مع تسجيل وجبة حقيقي.
GENERAL_NUTRITION_MARKERS = ["فايدة", "فوائد", "اضرار", "أضرار", "مضر", "صحي لو", "شنو ال", "احتاج", "لازم"]
GENERAL_NUTRITION_TOPICS = (
    PROTEIN_WORDS + CARB_WORDS + FAT_WORDS + FIBER_WORDS
    + ["مشروبات غازية", "فاست فود", "حلويات", "قبل التمرين", "بعد التمرين", "توقيت الوجبات"]
)

WATER_PHRASES = ["شربت", "اشرب ماي", "شربت ماي", "شربت مي"]
WEIGHT_PHRASES = ["وزني", "وزنت", "صار وزني", "نزل وزني", "زاد وزني", "احسبلي وزن"]
ASK_TIP_PHRASES = ["عطيني نصيحة", "نصيحة سريعة", "افادة"]

# رغبة/احتمال أكل شي — مو استهلاك فعلي، ما يسجّل وجبة أبدًا حتى لو ذكر اسم أكلة معروفة
# (مثلاً "أريد بيض" ما يسجّل بيضة — يفرق جوهري عن "اكلت بيض")
DESIRE_MARKERS = [
    "أريد", "اريد", "ابي", "أبي", "ابغي", "أبغى", "يمكن", "ممكن اكل", "ممكن آكل",
    "أفكر", "افكر", "حاب اكل", "حاب آكل", "ودي اكل", "ودي آكل", "أحب أكل", "احب اكل",
]

# اشتهاء طعام محدد بالاسم ("مشتهي دولمة") — يختلف عن DESIRE_MARKERS العامة بإنه غالبًا يستحق
# عرض مساعدة بتحديد كمية مناسبة للطعام المذكور تحديدًا، مو رد عام. لا تضعها ضمن RECIPE_TRIGGERS
# أبدًا — كانت هناك سابقًا وسببت تحويل أي رسالة اشتهاء لبحث وصفة حر بكامل نص الرسالة.
CRAVING_MARKERS = ["مشتهي", "مشتهية", "نفسي ب", "نفسي بـ", "خاطري ب", "خاطري بـ"]

# نية مستقبلية صريحة بالأكل — مو استهلاك فعلي، ما يسجّل وجبة أبدًا (يفرق جوهري عن "اكلت دولمة")
PLAN_TO_EAT_MARKERS = ["راح آكل", "راح اكل", "ناوي آكل", "ناوي اكل", "بروح آكل", "بروح اكل"]

# سؤال عن كمية مناسبة لطعام محدد (وليس "شكد أكلت؟" التوضيحي لوجبة قيد التسجيل) — يُفحص بأولوية
# أعلى من CRAVING_MARKERS/PLAN_TO_EAT_MARKERS حتى رسالة مركّبة متل "مشتهي دولمه شكد لازم اكل؟"
# تروح لتوصية الكمية مباشرة، مو لرد اشتهاء عام بس.
PORTION_QUESTION_MARKERS = ["شكد لازم آكل", "شكد لازم اكل", "شكد اخلي", "شكد آكل", "شكد اكل", "قديش آكل"]

# عبارات اجتماعية قصيرة — تُفحص بمطابقة شبه-تامة (مو substring حر) حتى ما تبلع رسالة أكل حقيقية
# تبدأ برسالة ترحيب صدفة (مثلاً "هلا اكلت بيضتين وصمونة" لازم تضل LOG_MEAL)
GREETING_PHRASES = [
    "سلام", "السلام عليكم", "هلا", "هلاو", "هلا والله", "شلونك", "شلونچ", "شلونج", "شلونكم",
    "شنو الاخبار", "شنو أخبارك", "صباح الخير", "صباح النور", "صباح الفل", "مساء الخير", "مساء النور",
    "هاي", "hi", "hello", "يلا", "يلا بينا",
]
FAREWELL_PHRASES = ["تصبح على خير", "تصبحين على خير", "مع السلامة", "باي", "الله بالخير", "وياك بالسلامة"]
THANKS_PHRASES = [
    "شكرا", "شكراً", "شكرا الك", "مشكور", "مشكورين", "ممنون", "تسلم", "تسلمين",
    "يعطيك العافية", "الله يعافيك", "عاشت ايدك", "عاشت إيدك",
]
ACKNOWLEDGEMENT_PHRASES = ["زين", "زينين", "ماشي", "تمام", "اوكي", "اوك", "اي", "ايه", "نعم"]


def _is_mostly_phrase(text: str, phrases: list, max_extra: int = 8) -> bool:
    """صحيح لو الرسالة تساوي إحدى العبارات تمامًا، أو تبدأ فيها ويبقى بعدها ذيل قصير جدًا
    (مثلاً "هلا كابتن") — يمنع ابتلاع رسالة أكل حقيقية تبدأ صدفة بكلمة ترحيب."""
    for p in phrases:
        if text == p:
            return True
        if text.startswith(p) and len(text) - len(p) <= max_extra:
            return True
    return False


def detect_intent(text_norm: str, ctx: dict) -> str:
    """
    ctx المتوقع: {"has_pending": bool, "has_recipe": bool, "has_undoable_log": bool,
    "has_pending_recipe": bool, "has_pending_food_topic": bool}
    الترتيب هنا هو ترتيب الأولوية (نفس فلسفة nutrition_engine.py القديمة، لكن مركزّة بمكان واحد).
    """
    has_pending = ctx.get("has_pending", False)
    has_recipe = ctx.get("has_recipe", False)
    has_undoable_log = ctx.get("has_undoable_log", False)
    has_pending_recipe = ctx.get("has_pending_recipe", False)
    has_pending_food_topic = ctx.get("has_pending_food_topic", False)

    if any(k in text_norm.lower() for k in OFFTOPIC_KEYWORDS):
        return OFFTOPIC
    if any(k in text_norm for k in MEDICAL_KEYWORDS):
        return MEDICAL

    # عبارات اجتماعية قصيرة — لا تحول أبدًا لنية غذائية، بغض النظر عن حالة المحادثة
    if _is_mostly_phrase(text_norm, GREETING_PHRASES):
        return GREETING
    if _is_mostly_phrase(text_norm, FAREWELL_PHRASES):
        return FAREWELL
    if _is_mostly_phrase(text_norm, THANKS_PHRASES):
        return THANKS

    if has_pending:
        if text_norm in CANCEL_PHRASES:
            return CANCEL
        if text_norm in CONFIRM_PHRASES:
            return CONFIRM
        if any(p in text_norm for p in CORRECTION_PHRASES):
            return CORRECTION
        if any(p in text_norm for p in SWAP_FOOD_PHRASES) and "ب" in text_norm:
            return SWAP_FOOD
        if any(p in text_norm for p in REMOVE_FOOD_PHRASES):
            return REMOVE_FOOD
        if any(p in text_norm for p in CHANGE_QUANTITY_PHRASES):
            return CHANGE_QUANTITY
        if any(p in text_norm for p in ADD_FOOD_PHRASES):
            return ADD_FOOD

    # جواب على "سويتها 😋 أكلتها لو بعدك؟" (وصفة خلص طبخها) — أولوية بعد pending (بناء وجبة) مباشرة
    # وقبل نافذة تراجع قديمة، حتى لو فيه undo سابق منتهي الأثر
    if has_pending_recipe and not has_pending:
        if text_norm in CANCEL_PHRASES:
            return CANCEL
        if text_norm in CONFIRM_PHRASES or text_norm in RECIPE_EATEN_PHRASES:
            return CONFIRM
        if text_norm in NOT_YET_PHRASES:
            return NOT_YET

    # جواب على اشتهاء/نية أكل طعام محدد ("مشتهي دولمة" ثم "اي"/"ماريد") — نفس منطق
    # has_pending_recipe فوق، بس لموضوع طعام عادي مو وصفة قيد الطبخ
    if has_pending_food_topic and not has_pending and not has_pending_recipe:
        if text_norm in CANCEL_PHRASES:
            return CANCEL
        if text_norm in CONFIRM_PHRASES:
            return CONFIRM

    # وجبة اتسجّلت مباشرة (DIRECT_LOG) وبعدها ضمن نافذة التراجع — نفس عائلة أوامر التعديل
    # تشتغل عليها هي، مو على وجبة جديدة (مثلاً "لا مو بيضتين، 3" بعد "اكلت بيضتين")
    if has_undoable_log and not has_pending:
        if text_norm in UNDO_PHRASES:
            return CANCEL
        if any(p in text_norm for p in CORRECTION_PHRASES):
            return CORRECTION
        if any(p in text_norm for p in SWAP_FOOD_PHRASES) and "ب" in text_norm:
            return SWAP_FOOD
        if any(p in text_norm for p in REMOVE_FOOD_PHRASES):
            return REMOVE_FOOD
        if any(p in text_norm for p in CHANGE_QUANTITY_PHRASES):
            return CHANGE_QUANTITY
        if any(p in text_norm for p in ADD_FOOD_PHRASES):
            return ADD_FOOD

    if text_norm in NOT_YET_PHRASES:
        return NOT_YET
    if any(p in text_norm for p in END_DAY_PHRASES):
        return END_DAY
    if any(p in text_norm for p in REMAINING_QUERY_PHRASES):
        return ASK_REMAINING
    if (any(m in text_norm for m in GENERAL_NUTRITION_MARKERS)
            and any(t in text_norm for t in GENERAL_NUTRITION_TOPICS)):
        return GENERAL_NUTRITION
    if any(p in text_norm for p in CALORIE_TARGET_MEAL_PHRASES):
        return ASK_CALORIE_TARGET_MEAL
    if any(p in text_norm for p in SUGGEST_QUERY_PHRASES):
        return ASK_RECOMMENDATION
    if any(p in text_norm for p in ASK_TIP_PHRASES):
        return ASK_TIP
    if any(p in text_norm for p in WEIGHT_PHRASES):
        return WEIGHT_UPDATE
    if any(p in text_norm for p in WATER_PHRASES):
        return WATER_LOG

    if has_recipe and (any(p in text_norm for p in COOKING_NEXT_PHRASES) or any(p in text_norm for p in COOKING_START_PHRASES)):
        return COOKING_STEP
    if has_recipe and any(t in text_norm for t in MISSING_INGREDIENT_TRIGGERS):
        return COOKING_STEP
    if any(p in text_norm for p in RECIPE_TRIGGERS) or any(p in text_norm for p in RECIPE_CATEGORY_PHRASES):
        return ASK_RECIPE

    # ترتيب مقصود بالأولوية: سؤال الكمية أولاً (حتى رسالة مركّبة "مشتهي دولمه شكد لازم اكل؟"
    # تروح لتوصية كمية مباشرة)، ثم الاشتهاء، ثم النية المستقبلية — الثلاثة قبل LOG_MEAL الافتراضي
    # حتى ما تنعامل كاستهلاك فعلي بالغلط (نفس مشكلة "راح اكل دولمه" الأصلية)
    if any(p in text_norm for p in PORTION_QUESTION_MARKERS):
        return ASK_PORTION_FOR_FOOD
    if any(p in text_norm for p in CRAVING_MARKERS):
        return EXPRESS_CRAVING
    if any(p in text_norm for p in PLAN_TO_EAT_MARKERS):
        return PLAN_TO_EAT

    if not has_pending and any(p in text_norm for p in ADD_FOOD_PHRASES):
        return ADD_FOOD

    # "تمام"/"اي"/"زين" بدون أي وجبة أو تسجيل مباشر بانتظار رد عليه — رد اجتماعي فقط، صفر تسجيل
    # (لو فيه pending أو has_undoable_log كانت النية اتحسمت فوق كـCONFIRM/CANCEL أصلاً)
    if not has_pending and not has_undoable_log and _is_mostly_phrase(text_norm, ACKNOWLEDGEMENT_PHRASES):
        return ACKNOWLEDGEMENT

    # رغبة/احتمال ("أريد بيض"، "يمكن آكل تمن") — مو استهلاك فعلي، لازم تُفحص قبل LOG_MEAL
    # الافتراضي، وإلا "أريد بيض" كانت راح تتسجل direct-log كبيضة وحدة فعلية
    if any(p in text_norm for p in DESIRE_MARKERS):
        return EXPRESS_DESIRE

    # افتراضي: نحاول نطابقها كوجبة جديدة (المتصل orchestrator.py يقرر UNKNOWN إذا ما لقى أكل)
    return LOG_MEAL
