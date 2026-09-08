"""اختبارات nutrition_ai/dataset_tools/stats.py — ملف JSONL معروف بـtmp_path، بدون Flask."""
import json

from nutrition_ai.dataset_tools.stats import compute_stats, write_stats_report


def _record(intent="LOG_MEAL", language="ar-IQ", difficulty="easy", input_text="اكلت بيضتين", output_text="تم"):
    return {
        "instruction": "x",
        "input": input_text,
        "output": output_text,
        "context": {},
        "intent": intent,
        "entities": {"resolved": [], "clarifications": []},
        "language": language,
        "difficulty": difficulty,
        "source": "test",
        "metadata": {},
    }


def test_stats_counts_match_known_fixture(tmp_path):
    category_dir = tmp_path / "foods"
    category_dir.mkdir()
    records = [
        _record(intent="LOG_MEAL"),
        _record(intent="LOG_MEAL"),
        _record(intent="WATER_LOG", language="ar-IQ", difficulty="medium"),
    ]
    with open(category_dir / "sample.jsonl", "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    stats = compute_stats(str(tmp_path))

    assert stats["total_records"] == 3
    assert stats["valid_records"] == 3
    assert stats["invalid_records"] == 0
    assert stats["intent_distribution"]["LOG_MEAL"] == 2
    assert stats["intent_distribution"]["WATER_LOG"] == 1
    assert stats["category_distribution"]["foods"] == 3
    assert stats["language_distribution"]["ar-IQ"] == 3
    assert stats["difficulty_distribution"]["easy"] == 2
    assert stats["difficulty_distribution"]["medium"] == 1


def test_stats_counts_invalid_records_separately(tmp_path):
    category_dir = tmp_path / "foods"
    category_dir.mkdir()
    bad_record = _record()
    del bad_record["output"]
    with open(category_dir / "sample.jsonl", "w", encoding="utf-8") as f:
        f.write(json.dumps(_record(), ensure_ascii=False) + "\n")
        f.write(json.dumps(bad_record, ensure_ascii=False) + "\n")
        f.write("{ not valid json\n")

    stats = compute_stats(str(tmp_path))

    assert stats["total_records"] == 3
    assert stats["valid_records"] == 1
    assert stats["invalid_records"] == 2


def test_write_stats_report_creates_file(tmp_path):
    category_dir = tmp_path / "foods"
    category_dir.mkdir()
    with open(category_dir / "sample.jsonl", "w", encoding="utf-8") as f:
        f.write(json.dumps(_record(), ensure_ascii=False) + "\n")

    report_path = str(tmp_path / "reports" / "stats.json")
    stats = write_stats_report(str(tmp_path), report_path)

    with open(report_path, encoding="utf-8") as f:
        loaded = json.load(f)
    assert loaded == stats
    assert loaded["total_records"] == 1
