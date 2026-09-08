"""حارس Regression دائم على بيانات knowledge/*.jsonl الحقيقية — يتأكد كل سجل مكتوب يدويًا
يمر Schema، وكل Intent حقيقي (KNOWN_INTENTS) ظاهر مرة على الأقل. يفشل هذا الاختبار لو أحد
حذف/خرّب سطر بالغلط مستقبلاً، أو أضاف Intent مقترح بدون metadata.implemented=false."""
import glob
import json
import os

from nutrition_ai.dataset_tools.schema import ALL_INTENTS, KNOWN_INTENTS, validate_record

KNOWLEDGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "knowledge")


def _load_all_records():
    records = []
    for path in glob.glob(os.path.join(KNOWLEDGE_DIR, "**", "*.jsonl"), recursive=True):
        with open(path, "r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                records.append((path, line_no, json.loads(line)))
    return records


def test_knowledge_directory_exists_and_has_files():
    assert os.path.isdir(KNOWLEDGE_DIR)
    records = _load_all_records()
    assert len(records) > 0, "ماكو أي بيانات Seed مكتوبة بـknowledge/"


def test_every_seed_record_passes_schema_validation():
    failures = []
    for path, line_no, record in _load_all_records():
        ok, errors = validate_record(record)
        if not ok:
            failures.append(f"{path}:{line_no} — {errors}")
    assert not failures, "سجلات فشلت التحقق:\n" + "\n".join(failures)


def test_every_known_intent_appears_at_least_once():
    seen_intents = {record["intent"] for _, _, record in _load_all_records()}
    missing = KNOWN_INTENTS - seen_intents
    assert not missing, f"Intents حقيقية بدون أي مثال Seed: {sorted(missing)}"


def test_no_record_uses_an_intent_outside_the_schema():
    for path, line_no, record in _load_all_records():
        assert record["intent"] in ALL_INTENTS, f"{path}:{line_no} يستخدم Intent مو معروف: {record['intent']}"


def test_no_exact_duplicate_records_in_seed_data():
    seen = set()
    duplicates = []
    for path, line_no, record in _load_all_records():
        key = (record.get("input", "").strip(), record["output"].strip())
        if key in seen:
            duplicates.append(f"{path}:{line_no} — تكرار حرفي: {key}")
        seen.add(key)
    assert not duplicates, "تكرار حرفي داخل بيانات Seed:\n" + "\n".join(duplicates)
