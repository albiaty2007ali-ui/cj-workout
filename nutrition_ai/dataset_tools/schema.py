"""
Dataset Schema — شكل السجل الموحّد لكل مثال بملفات knowledge/*.jsonl، ودالة تحقق واحدة
(validate_record) يستخدمها كل من الـImporter والـValidator (نفس المنطق، صفر تكرار).

الحقول تعكس الأشكال الحقيقية الموجودة فعلاً بالمحرك — مو حقول مخترعة:
- intent: من nutrition_ai/intents.py (الـ26 الحقيقية) أو PROPOSED_INTENTS (مواضيع مطلوبة
  بس ماكو Intent فعلي إلها بعد بـintents.py — موثّقة صراحة عشان ما تنخلط بالحقيقية).
- context: مفاتيحها تشبه ما يرجعه intents.detect_intent's ctx (has_pending/has_recipe/
  has_undoable_log/has_pending_recipe) ونتيجة context.build() (remaining_calories/
  over_target/consumed_protein/macro_targets) — مفاتيح إضافية مسموحة (Forward-compatible)
  بس تُسجَّل بالإحصائيات، ما تُرفض.
- entities.clarifications[].kind: نفس القيم الحقيقية من entities.py ("quantity",
  "confirm_match", "ambiguous_match").
"""
from nutrition_ai import intents as _intents

KNOWN_INTENTS = {
    _intents.LOG_MEAL, _intents.ADD_FOOD, _intents.REMOVE_FOOD, _intents.CHANGE_QUANTITY,
    _intents.SWAP_FOOD, _intents.ASK_REMAINING, _intents.ASK_RECOMMENDATION,
    _intents.ASK_CALORIE_TARGET_MEAL, _intents.ASK_RECIPE, _intents.COOKING_STEP,
    _intents.WATER_LOG, _intents.WEIGHT_UPDATE, _intents.END_DAY, _intents.ASK_TIP,
    _intents.GENERAL_NUTRITION, _intents.CONFIRM, _intents.CANCEL, _intents.CORRECTION,
    _intents.OFFTOPIC, _intents.MEDICAL, _intents.NOT_YET, _intents.EXPRESS_DESIRE,
    _intents.GREETING, _intents.FAREWELL, _intents.THANKS, _intents.ACKNOWLEDGEMENT,
    _intents.UNKNOWN,
}

# مواضيع مطلوبة بالتغطية (ستريك/XP/بروفايل...) بس ماكو Intent حقيقي إلها بـintents.py اليوم —
# أي سجل يستخدمها لازم يحمل metadata.implemented = false (يتحقق منه validate_record).
PROPOSED_INTENTS = {
    "STREAK_QUERY", "XP_QUERY", "LEVEL_QUERY", "PROFILE_QUERY", "SETTINGS_QUERY",
}

ALL_INTENTS = KNOWN_INTENTS | PROPOSED_INTENTS

VALID_CLARIFICATION_KINDS = {"quantity", "confirm_match", "ambiguous_match"}
VALID_LANGUAGES = {"ar-IQ", "ar-MSA"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}

REQUIRED_STRING_FIELDS = ["instruction", "output", "intent", "language", "source"]


def validate_record(record: dict) -> tuple[bool, list[str]]:
    """يتحقق من سجل واحد (dict مُحمَّل من سطر JSONL). يرجع (صحيح؟, قائمة أخطاء).
    لا يرمي استثناء أبدًا على بيانات غريبة الشكل — يرجعها كخطأ ضمن القائمة."""
    errors: list[str] = []

    if not isinstance(record, dict):
        return False, ["record must be a JSON object"]

    for field in REQUIRED_STRING_FIELDS:
        value = record.get(field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"missing or empty required field: {field}")

    intent = record.get("intent")
    if isinstance(intent, str) and intent not in ALL_INTENTS:
        errors.append(f"unknown intent: {intent}")

    if isinstance(intent, str) and intent in PROPOSED_INTENTS:
        metadata = record.get("metadata")
        implemented = isinstance(metadata, dict) and metadata.get("implemented") is False
        if not implemented:
            errors.append(f"proposed intent '{intent}' requires metadata.implemented = false")

    language = record.get("language")
    if isinstance(language, str) and language not in VALID_LANGUAGES:
        errors.append(f"unknown language: {language}")

    difficulty = record.get("difficulty")
    if difficulty is not None and difficulty not in VALID_DIFFICULTIES:
        errors.append(f"unknown difficulty: {difficulty}")

    context = record.get("context")
    if context is not None and not isinstance(context, dict):
        errors.append("context must be an object")

    entities = record.get("entities")
    if entities is not None:
        if not isinstance(entities, dict):
            errors.append("entities must be an object")
        else:
            clarifications = entities.get("clarifications", [])
            if not isinstance(clarifications, list):
                errors.append("entities.clarifications must be a list")
            else:
                for item in clarifications:
                    kind = item.get("kind") if isinstance(item, dict) else None
                    if kind not in VALID_CLARIFICATION_KINDS:
                        errors.append(f"invalid clarifications[].kind: {kind!r}")

    return (len(errors) == 0), errors
