"""
Dataset Statistics — يمرّ على ملفات knowledge/*.jsonl مرة واحدة (Streaming، عدادات فقط
بالذاكرة — لا يحتفظ بأي سجل كامل)، وينتج تقرير JSON: توزيع الـIntent، الفئة (المجلد)،
اللغة، الصعوبة، عدد المرفوض/التالف، ومتوسط طول input/output.
"""
import glob
import json
import os
from collections import Counter

from nutrition_ai.dataset_tools.schema import validate_record


def compute_stats(knowledge_dir: str) -> dict:
    intent_counts = Counter()
    category_counts = Counter()
    language_counts = Counter()
    difficulty_counts = Counter()

    total = 0
    valid = 0
    invalid = 0
    input_len_sum = 0
    output_len_sum = 0

    files = sorted(glob.glob(os.path.join(knowledge_dir, "**", "*.jsonl"), recursive=True))

    for path in files:
        category = os.path.relpath(os.path.dirname(path), knowledge_dir).split(os.sep)[0]
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                total += 1
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    invalid += 1
                    continue

                ok, _errors = validate_record(record)
                if not ok:
                    invalid += 1
                    continue

                valid += 1
                intent_counts[record.get("intent", "?")] += 1
                category_counts[category] += 1
                language_counts[record.get("language", "?")] += 1
                difficulty_counts[record.get("difficulty") or "unspecified"] += 1
                input_len_sum += len(record.get("input") or "")
                output_len_sum += len(record.get("output") or "")

    return {
        "files_scanned": len(files),
        "total_records": total,
        "valid_records": valid,
        "invalid_records": invalid,
        "intent_distribution": dict(intent_counts.most_common()),
        "category_distribution": dict(category_counts.most_common()),
        "language_distribution": dict(language_counts.most_common()),
        "difficulty_distribution": dict(difficulty_counts.most_common()),
        "average_input_length": round(input_len_sum / valid, 1) if valid else 0,
        "average_output_length": round(output_len_sum / valid, 1) if valid else 0,
    }


def write_stats_report(knowledge_dir: str, report_path: str) -> dict:
    stats = compute_stats(knowledge_dir)
    os.makedirs(os.path.dirname(report_path) or ".", exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)
    return stats
