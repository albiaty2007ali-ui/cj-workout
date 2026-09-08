"""
أداة سطر أوامر لبيانات knowledge/ (استيراد/تحقق/إحصائيات) — راجع DATASET_GUIDE.md
لشرح كامل. لا اتصال إنترنت هنا، ولا يمس أي شي بقاعدة البيانات الحية (App DB / Food KB).

الاستخدام:
    python scripts/dataset_cli.py import <ملف.jsonl> [<ملف2.jsonl> ...] --dest <ملف_الوجهة.jsonl>
    python scripts/dataset_cli.py validate <ملف.jsonl> [<ملف2.jsonl> ...]
    python scripts/dataset_cli.py stats [--knowledge-dir knowledge] [--report data/dataset_stats.json]
"""
import argparse
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# طباعة عربية آمنة حتى لو الطرفية (خصوصًا Windows) ما تدعم UTF-8 افتراضيًا
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from nutrition_ai.dataset_tools.dedup import DedupIndex
from nutrition_ai.dataset_tools.importer import import_jsonl
from nutrition_ai.dataset_tools.schema import validate_record
from nutrition_ai.dataset_tools.stats import write_stats_report


def _expand_globs(patterns):
    paths = []
    for pattern in patterns:
        matches = sorted(glob.glob(pattern, recursive=True))
        paths.extend(matches if matches else [pattern])
    return paths


def cmd_import(args):
    sources = _expand_globs(args.sources)
    missing = [p for p in sources if not os.path.isfile(p)]
    if missing:
        for p in missing:
            print(f"❌ ماكو هذا الملف: {p}")
        return 1

    dedup_index = DedupIndex(args.index) if args.index else DedupIndex()
    try:
        result = import_jsonl(sources, args.dest, dedup_index=dedup_index, dry_run=args.dry_run)
    finally:
        dedup_index.close()

    mode = "تجربة (Dry Run، ماكو كتابة فعلية)" if args.dry_run else "استيراد فعلي"
    print(f"\n✅ {mode} خلص — {len(sources)} ملف مصدر")
    print(f"   إجمالي الأسطر: {result.total_lines}")
    print(f"   مقبول: {result.accepted}")
    print(f"   مرفوض: {result.rejected} (منها JSON تالف: {result.malformed_json})")
    print(f"   مكرر: {result.duplicates}")
    if result.rejected_examples:
        print("\n⚠️ أمثلة على المرفوض (أول 10):")
        for source_path, line_no, reason in result.rejected_examples[:10]:
            print(f"   {source_path}:{line_no} — {reason}")
    return 0


def cmd_validate(args):
    sources = _expand_globs(args.sources)
    total = 0
    valid = 0
    errors_by_file = {}

    for path in sources:
        if not os.path.isfile(path):
            print(f"❌ ماكو هذا الملف: {path}")
            continue
        file_errors = []
        with open(path, "r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                line = line.strip()
                if not line:
                    continue
                total += 1
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as e:
                    file_errors.append((line_no, f"malformed JSON: {e}"))
                    continue
                ok, errors = validate_record(record)
                if ok:
                    valid += 1
                else:
                    file_errors.append((line_no, "; ".join(errors)))
        if file_errors:
            errors_by_file[path] = file_errors

    invalid = total - valid
    print(f"✅ فحصت {total} سجل — صحيح: {valid}, غير صحيح: {invalid}")
    for path, file_errors in errors_by_file.items():
        print(f"\n⚠️ {path}:")
        for line_no, reason in file_errors[:20]:
            print(f"   سطر {line_no}: {reason}")

    if args.report:
        os.makedirs(os.path.dirname(args.report) or ".", exist_ok=True)
        with open(args.report, "w", encoding="utf-8") as f:
            json.dump({
                "total": total, "valid": valid, "invalid": invalid,
                "errors_by_file": {p: [{"line": ln, "reason": r} for ln, r in errs] for p, errs in errors_by_file.items()},
            }, f, ensure_ascii=False, indent=2)
        print(f"\n📄 تقرير مفصّل: {args.report}")

    return 0 if invalid == 0 else 1


def cmd_stats(args):
    if not os.path.isdir(args.knowledge_dir):
        print(f"❌ ماكو هذا المجلد: {args.knowledge_dir}")
        return 1
    stats = write_stats_report(args.knowledge_dir, args.report)
    print(f"✅ الإحصائيات جاهزة — {stats['valid_records']} سجل صحيح من أصل {stats['total_records']} بـ{stats['files_scanned']} ملف")
    print(f"   توزيع الـIntent: {stats['intent_distribution']}")
    print(f"   توزيع الفئة: {stats['category_distribution']}")
    print(f"📄 تقرير كامل: {args.report}")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command")

    p_import = subparsers.add_parser("import", help="استيراد ملف/ملفات JSONL بعد التحقق والتصفية من التكرار")
    p_import.add_argument("sources", nargs="+", help="مسار أو أكثر لملفات .jsonl (يدعم *)")
    p_import.add_argument("--dest", required=True, help="ملف الوجهة (Append)")
    p_import.add_argument("--index", default=None, help="مسار فهرس التكرار (افتراضي: instance/dataset_index.sqlite)")
    p_import.add_argument("--dry-run", action="store_true", help="تحقق فقط بدون كتابة فعلية")
    p_import.set_defaults(func=cmd_import)

    p_validate = subparsers.add_parser("validate", help="تحقق من ملف/ملفات JSONL بدون استيراد")
    p_validate.add_argument("sources", nargs="+", help="مسار أو أكثر لملفات .jsonl (يدعم *)")
    p_validate.add_argument("--report", default=None, help="مسار تقرير JSON اختياري")
    p_validate.set_defaults(func=cmd_validate)

    p_stats = subparsers.add_parser("stats", help="إحصائيات شاملة عن مجلد knowledge/")
    p_stats.add_argument("--knowledge-dir", default="knowledge")
    p_stats.add_argument("--report", default="data/dataset_stats.json")
    p_stats.set_defaults(func=cmd_stats)

    args = parser.parse_args()
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
