"""اختبارات nutrition_ai/dataset_tools/schema.py — بدون Flask app context، منطق ملفات صرف."""
from nutrition_ai.dataset_tools.schema import validate_record


def _valid_record(**overrides):
    record = {
        "instruction": "المستخدم يقول: اكلت بيضتين",
        "input": "اكلت بيضتين",
        "output": "تم تسجيل الفطور ✓ بيضة ×2",
        "context": {"has_pending": False, "has_recipe": False},
        "intent": "LOG_MEAL",
        "entities": {"resolved": [{"food_name": "بيضة", "quantity": 2, "confidence": 1.0}], "clarifications": []},
        "language": "ar-IQ",
        "difficulty": "easy",
        "source": "handwritten_seed",
        "metadata": {"author": "test"},
    }
    record.update(overrides)
    return record


def test_valid_record_passes():
    ok, errors = validate_record(_valid_record())
    assert ok
    assert errors == []


def test_missing_required_field_rejected():
    record = _valid_record()
    del record["output"]
    ok, errors = validate_record(record)
    assert not ok
    assert any("output" in e for e in errors)


def test_empty_required_field_rejected():
    ok, errors = validate_record(_valid_record(instruction="   "))
    assert not ok
    assert any("instruction" in e for e in errors)


def test_unknown_intent_rejected():
    ok, errors = validate_record(_valid_record(intent="NOT_A_REAL_INTENT"))
    assert not ok
    assert any("unknown intent" in e for e in errors)


def test_proposed_intent_without_implemented_flag_rejected():
    ok, errors = validate_record(_valid_record(intent="STREAK_QUERY", metadata={"author": "test"}))
    assert not ok
    assert any("implemented" in e for e in errors)


def test_proposed_intent_with_implemented_false_accepted():
    ok, errors = validate_record(_valid_record(intent="STREAK_QUERY", metadata={"implemented": False}))
    assert ok, errors


def test_invalid_clarification_kind_rejected():
    record = _valid_record()
    record["entities"] = {"resolved": [], "clarifications": [{"kind": "not_a_real_kind"}]}
    ok, errors = validate_record(record)
    assert not ok
    assert any("clarifications" in e for e in errors)


def test_unknown_language_rejected():
    ok, errors = validate_record(_valid_record(language="fr-FR"))
    assert not ok
    assert any("language" in e for e in errors)


def test_unknown_difficulty_rejected():
    ok, errors = validate_record(_valid_record(difficulty="impossible"))
    assert not ok
    assert any("difficulty" in e for e in errors)


def test_non_dict_record_rejected():
    ok, errors = validate_record("not a dict")
    assert not ok
    assert errors


def test_context_must_be_dict():
    ok, errors = validate_record(_valid_record(context="not a dict"))
    assert not ok
    assert any("context" in e for e in errors)
