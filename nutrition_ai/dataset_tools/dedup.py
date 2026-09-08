"""
Exact Deduplication — يمنع حفظ نفس المثال مرتين، حتى عبر تشغيلات متعددة (Resumable)،
بدون تحميل كل الهاشات بالذاكرة (فهرس SQLite بدل set() بايثون، يبقى خفيف حتى بمئات الآلاف).

مصمَّم كقائمة Checkers قابلة للتوسعة (قسم "لا تفاخر بالحجم" بالخطة) — اليوم فيها فاحص واحد
فقط (Exact Hash)، وأي فاحص Semantic (Embeddings) مستقبلاً ينضاف لنفس القائمة بدون إعادة كتابة
شي بالـImporter.

الفهرس بـinstance/dataset_index.sqlite — مو data/ (تلك محجوزة لقاعدة معرفة الأكل الحقيقية
المطلوب تبقى Committed)، ومو knowledge/ (تلك بيانات المصدر نفسها) — نفس منطق instance/cjworkout.db:
حالة قابلة لإعادة البناء بالكامل من الملفات الأصلية، ما تنحفظ بـGit.
"""
import hashlib
import os
import sqlite3
from datetime import datetime, timezone

from arabic_normalize import normalize

DEFAULT_INDEX_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "instance", "dataset_index.sqlite",
)


def _hash_record(instruction: str, output: str) -> str:
    text = normalize(instruction or "") + "|" + normalize(output or "")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class DedupIndex:
    """فهرس SQLite بسيط لهاشات السجلات المقبولة سابقًا. resumable بشكل طبيعي — فتح نفس
    الملف بتشغيلة جديدة يشوف كل الهاشات القديمة تلقائيًا."""

    def __init__(self, path: str | None = None):
        self.path = path or DEFAULT_INDEX_PATH
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.conn = sqlite3.connect(self.path)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS seen (hash TEXT PRIMARY KEY, source TEXT, added_at TEXT)"
        )
        self.conn.commit()

    def is_duplicate(self, instruction: str, output: str) -> bool:
        h = _hash_record(instruction, output)
        row = self.conn.execute("SELECT 1 FROM seen WHERE hash = ?", (h,)).fetchone()
        return row is not None

    def mark_seen(self, instruction: str, output: str, source: str = "") -> None:
        h = _hash_record(instruction, output)
        self.conn.execute(
            "INSERT OR IGNORE INTO seen (hash, source, added_at) VALUES (?, ?, ?)",
            (h, source, datetime.now(timezone.utc).isoformat()),
        )

    def commit(self) -> None:
        self.conn.commit()

    def close(self) -> None:
        self.conn.commit()
        self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


# قائمة الفاحصين — اليوم فاحص واحد فقط (Exact Hash عبر DedupIndex نفسها). فاحص Semantic
# مستقبلي (Embeddings + Similarity threshold) ينضاف هنا كعنصر ثاني، مثال شكله المستقبلي:
#   CHECKERS.append(lambda index, instruction, output: semantic_similarity_checker(...))
CHECKERS = ["exact_hash"]
