"""
Dataset Importer — يقرأ ملف/ملفات JSONL سطرًا سطرًا (Streaming حقيقي، بدون تحميل الملف
كله بالذاكرة)، يتحقق من كل سجل عبر schema.validate_record، يفحص التكرار عبر dedup.DedupIndex،
ثم يكتب المقبول فقط بملف الوجهة. مقاطعة التشغيل (Ctrl+C/كراش) وإعادة التشغيل آمنة تمامًا —
الفهرس يتذكر كل شي اتكتب سابقًا فما ينكتب مرتين.

نفس فلسفة scripts/import_foods.py: بيانات تالفة/غير صالحة تُتجاوز وتُحسب ضمن "مرفوض"،
ما توقف بقية الاستيراد ولا ترمي استثناء للمستخدم.
"""
import json
import os
from dataclasses import dataclass, field

from nutrition_ai.dataset_tools.dedup import DedupIndex
from nutrition_ai.dataset_tools.schema import validate_record


@dataclass
class ImportResult:
    total_lines: int = 0
    accepted: int = 0
    rejected: int = 0
    duplicates: int = 0
    malformed_json: int = 0
    rejected_examples: list = field(default_factory=list)  # [(line_no, reason)] أول N فقط


def import_jsonl(source_paths, dest_path: str, dedup_index: DedupIndex | None = None,
                  dry_run: bool = False, progress_every: int = 500) -> ImportResult:
    """source_paths: مسار واحد أو قائمة مسارات JSONL. dest_path: ملف الوجهة (Append).
    dry_run=True يشغّل كل خطوات التحقق/التكرار بدون كتابة فعلية — مفيد للفحص المسبق."""
    if isinstance(source_paths, str):
        source_paths = [source_paths]

    own_index = dedup_index is None
    index = dedup_index or DedupIndex()
    result = ImportResult()

    if not dry_run:
        os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)

    try:
        dest_file = None if dry_run else open(dest_path, "a", encoding="utf-8")
        try:
            for source_path in source_paths:
                with open(source_path, "r", encoding="utf-8") as f:
                    for line_no, line in enumerate(f, start=1):
                        line = line.strip()
                        if not line:
                            continue
                        result.total_lines += 1

                        try:
                            record = json.loads(line)
                        except json.JSONDecodeError as e:
                            result.malformed_json += 1
                            result.rejected += 1
                            _remember_rejection(result, source_path, line_no, f"malformed JSON: {e}")
                            continue

                        ok, errors = validate_record(record)
                        if not ok:
                            result.rejected += 1
                            _remember_rejection(result, source_path, line_no, "; ".join(errors))
                            continue

                        if index.is_duplicate(record["instruction"], record["output"]):
                            result.duplicates += 1
                            continue

                        result.accepted += 1
                        if not dry_run:
                            index.mark_seen(record["instruction"], record["output"], source=source_path)
                        if dest_file is not None:
                            dest_file.write(json.dumps(record, ensure_ascii=False) + "\n")

                        if result.total_lines % progress_every == 0:
                            print(f"... {result.total_lines} سطر معالَج (مقبول: {result.accepted}, مرفوض: {result.rejected}, مكرر: {result.duplicates})")
        finally:
            if dest_file is not None:
                dest_file.close()
        index.commit()
    finally:
        if own_index:
            index.close()

    return result


def _remember_rejection(result: ImportResult, source_path: str, line_no: int, reason: str, cap: int = 50) -> None:
    if len(result.rejected_examples) < cap:
        result.rejected_examples.append((source_path, line_no, reason))
