"""اختبارات nutrition_ai/dataset_tools/importer.py — Streaming حقيقي بـtmp_path، بدون Flask."""
import json

from nutrition_ai.dataset_tools.dedup import DedupIndex
from nutrition_ai.dataset_tools.importer import import_jsonl


def _record(input_text="اكلت بيضتين", output_text="تم تسجيل الفطور ✓"):
    return {
        "instruction": f"المستخدم يقول: {input_text}",
        "input": input_text,
        "output": output_text,
        "context": {"has_pending": False},
        "intent": "LOG_MEAL",
        "entities": {"resolved": [], "clarifications": []},
        "language": "ar-IQ",
        "difficulty": "easy",
        "source": "test",
        "metadata": {},
    }


def _write_jsonl(path, records):
    with open(path, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def test_valid_records_land_in_dest(tmp_path):
    source = tmp_path / "source.jsonl"
    dest = tmp_path / "dest.jsonl"
    _write_jsonl(source, [_record(), _record("شربت ماي", "تمام سجلت الماي")])

    index = DedupIndex(str(tmp_path / "index.sqlite"))
    result = import_jsonl(str(source), str(dest), dedup_index=index)
    index.close()

    assert result.accepted == 2
    assert result.rejected == 0
    assert dest.exists()
    lines = dest.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2


def test_malformed_json_line_does_not_crash_stream(tmp_path):
    source = tmp_path / "source.jsonl"
    dest = tmp_path / "dest.jsonl"
    source.write_text(
        json.dumps(_record(), ensure_ascii=False) + "\n"
        "{ this is not valid json\n"
        + json.dumps(_record("اكلت صمونة", "تم تسجيل صمونة"), ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    index = DedupIndex(str(tmp_path / "index.sqlite"))
    result = import_jsonl(str(source), str(dest), dedup_index=index)
    index.close()

    assert result.malformed_json == 1
    assert result.accepted == 2
    assert result.total_lines == 3


def test_duplicate_across_two_import_calls_not_written_twice(tmp_path):
    source = tmp_path / "source.jsonl"
    dest = tmp_path / "dest.jsonl"
    _write_jsonl(source, [_record()])
    index_path = str(tmp_path / "index.sqlite")

    index1 = DedupIndex(index_path)
    result1 = import_jsonl(str(source), str(dest), dedup_index=index1)
    index1.close()
    assert result1.accepted == 1

    index2 = DedupIndex(index_path)
    result2 = import_jsonl(str(source), str(dest), dedup_index=index2)
    index2.close()
    assert result2.accepted == 0
    assert result2.duplicates == 1

    lines = dest.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1  # ما تكرر الكتابة رغم استدعاءين


def test_invalid_record_rejected_without_crashing(tmp_path):
    source = tmp_path / "source.jsonl"
    dest = tmp_path / "dest.jsonl"
    bad_record = _record()
    del bad_record["output"]
    _write_jsonl(source, [bad_record, _record()])

    index = DedupIndex(str(tmp_path / "index.sqlite"))
    result = import_jsonl(str(source), str(dest), dedup_index=index)
    index.close()

    assert result.rejected == 1
    assert result.accepted == 1


def test_dry_run_does_not_write_destination(tmp_path):
    source = tmp_path / "source.jsonl"
    dest = tmp_path / "dest.jsonl"
    _write_jsonl(source, [_record()])

    index = DedupIndex(str(tmp_path / "index.sqlite"))
    result = import_jsonl(str(source), str(dest), dedup_index=index, dry_run=True)
    index.close()

    assert result.accepted == 1
    assert not dest.exists()


def test_dry_run_does_not_pollute_dedup_index(tmp_path):
    """Dry Run لازم صفر أثر دائم — لو ما راح كذا، تجربة Dry Run تخلي الاستيراد الحقيقي
    اللاحق يتجاهل نفس السجلات باعتبارها مكررة رغم إنها ما انكتبت فعليًا بأي مكان."""
    source = tmp_path / "source.jsonl"
    dest = tmp_path / "dest.jsonl"
    _write_jsonl(source, [_record()])
    index_path = str(tmp_path / "index.sqlite")

    dry_index = DedupIndex(index_path)
    import_jsonl(str(source), str(dest), dedup_index=dry_index, dry_run=True)
    dry_index.close()

    real_index = DedupIndex(index_path)
    result = import_jsonl(str(source), str(dest), dedup_index=real_index)
    real_index.close()

    assert result.accepted == 1
    assert result.duplicates == 0
    assert dest.exists()
